/**
 * The reads of the resolution of a lookup (IFU-60 rule 2, DEC-004).
 *
 * The catalog number, the LOT and the product come from the catalog services,
 * and the overrides, the periods, the versions, the documents and the files come
 * from the e-IFU repositories. Each read is exact, and none of them changes a
 * row (IFU-60 rule 1). The public lookup has no session (DEC-070), so no read
 * takes an actor. A read never sorts by a revision label, a version, a date or an
 * id (IFU-60 rule 3): the order of the rows is the order that the store gives,
 * and the periods have a limit of 2.
 *
 * The storage key of a file never leaves the service. The reads keep the keys of
 * the files that they gave, by the id of the file, so the service can sign the
 * download URLs after the commit (DEC-076, DEC-097).
 */
import "server-only";

import { AppError, CODE_MEANINGS } from "@/lib/errors";
import { readExecutor } from "@/lib/transaction";
import {
  findCatalogNumberForLookup,
  findLotForLookup,
  lotNumberExistsUnderOtherCatalogNumber,
} from "@/modules/catalog/services/lookup-reads";

import type { ResolutionReads, ResolvedFile, VersionHit } from "../domain/resolution";
import { listLivePeriodsContaining } from "../repositories/applicability-repository";
import { findDocumentsByIds } from "../repositories/document-repository";
import { listActiveFilesOfVersion } from "../repositories/file-repository";
import { findActiveOverrideOfLot } from "../repositories/override-repository";
import { findVersionsByIds } from "../repositories/version-repository";

/** The reads, and the storage keys of the files that they gave, by the id of the file. */
export interface LookupReads {
  readonly reads: ResolutionReads;
  /** The storage key of a file that `findActiveFiles` gave, or `undefined`. */
  storageKeyOf(fileId: string): string | undefined;
}

const KEY_PATTERN = /^[1-9][0-9]{0,17}$/;

/** The `bigint` key of an id that an earlier read gave. */
function toKey(value: string): bigint {
  if (!KEY_PATTERN.test(value)) {
    throw new AppError("DB-5000", CODE_MEANINGS["DB-5000"], { reason: "a read gave an id that is not a key" });
  }
  return BigInt(value);
}

/** The versions of `versionIds` with their documents, in the order of `versionIds`. A version in an unlisted state is read too: the step decides. */
async function versionHits(versionIds: readonly bigint[]): Promise<VersionHit[]> {
  const executor = readExecutor();
  const versions = await findVersionsByIds(executor, versionIds);
  const documents = await findDocumentsByIds(executor, [...new Set(versions.map((version) => version.documentId))]);
  const documentById = new Map(documents.map((document) => [document.id, document]));
  const byId = new Map<bigint, VersionHit>();
  for (const version of versions) {
    const document = documentById.get(version.documentId);
    if (document === undefined) {
      throw new AppError("DB-5000", CODE_MEANINGS["DB-5000"], { reason: "a version has no document" });
    }
    byId.set(version.id, {
      versionId: String(version.id),
      status: version.status,
      documentNumber: document.documentNumber,
      documentTitle: document.title,
      revision: version.revision,
    });
  }
  return versionIds.flatMap((id) => byId.get(id) ?? []);
}

/** Makes the reads of one lookup. */
export function createLookupReads(): LookupReads {
  const storageKeys = new Map<string, string>();

  const reads: ResolutionReads = {
    findCatalogNumber: (catalogNumber) => findCatalogNumberForLookup(catalogNumber),
    findLot: (catalogNumberId, lotNumber) => findLotForLookup(catalogNumberId, lotNumber),
    lotNumberExistsUnderOtherCatalogNumber: (lotNumber, catalogNumberId) =>
      lotNumberExistsUnderOtherCatalogNumber(lotNumber, catalogNumberId),
    async findActiveOverrideTarget(lotId) {
      const override = await findActiveOverrideOfLot(readExecutor(), toKey(lotId));
      if (override === null) {
        return null;
      }
      const [hit] = await versionHits([override.documentVersionId]);
      if (hit === undefined) {
        throw new AppError("DB-5000", CODE_MEANINGS["DB-5000"], { reason: "an override has no version" });
      }
      return hit;
    },
    async findPeriodVersions(productId, date, limit) {
      const periods = await listLivePeriodsContaining(readExecutor(), toKey(productId), date, limit);
      const hits = await versionHits(periods.map((period) => period.documentVersionId));
      // A period counts only when its version is `PUBLISHED` or `SUPERSEDED` (IFU-60 rule 2, step 7, DEC-062).
      return hits.filter((hit) => hit.status === "PUBLISHED" || hit.status === "SUPERSEDED");
    },
    async findActiveFiles(versionId) {
      const files = await listActiveFilesOfVersion(readExecutor(), toKey(versionId));
      return files.map((file): ResolvedFile => {
        storageKeys.set(String(file.id), file.storageKey);
        return {
          fileId: String(file.id),
          languageCode: file.languageCode,
          contentType: file.contentType,
          fileSizeBytes: file.fileSizeBytes,
          fileHash: file.fileHash,
        };
      });
    },
  };

  return { reads, storageKeyOf: (fileId) => storageKeys.get(fileId) };
}
