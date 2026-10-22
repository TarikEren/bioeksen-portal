/**
 * The versions that an override of a LOT may name (IFU-40.AC1 to AC3, DEC-066).
 *
 * An override binds a LOT to a `PUBLISHED` or `SUPERSEDED` version of a document of
 * the product of the LOT. The page reads the documents of that product and their
 * versions through the e-IFU services, and gives the form the versions that fit,
 * with their text already filled. The form shows what the service accepts and the
 * service checks the rules again, so this list is a convenience and not a rule.
 * This file runs on the server only.
 */
import "server-only";

import { periodText } from "@/app/backoffice/_lib/period-text";
import type { SessionActor } from "@/lib/auth/session";
import type { Dictionary, Language } from "@/lib/i18n";
import { MAX_LIMIT } from "@/lib/schemas/identity";
import { getDocument, listDocuments } from "@/modules/eifu/services/document-service";

import type { VersionChoice } from "../_components/create-override-form";

/**
 * The published and superseded versions of the documents of a product, by document
 * number and then by revision.
 *
 * @throws AppError `PERM-4150` without `eifu.document.view`.
 */
export async function versionChoices(
  actor: SessionActor,
  productId: string,
  text: Dictionary,
  language: Language,
): Promise<readonly VersionChoice[]> {
  const list = await listDocuments(actor, { page: 1, limit: MAX_LIMIT, productId, q: null });
  const details = await Promise.all(list.documents.map((document) => getDocument(actor, document.id)));
  return details.flatMap((document) =>
    document.versions
      .filter((version) => version.status === "PUBLISHED" || version.status === "SUPERSEDED")
      .map((version) => ({
        id: version.id,
        documentNumber: document.documentNumber,
        revision: version.revision,
        status: text.eifu.status[version.status],
        period: periodText(version.period, text.eifu.period, language),
      })),
  );
}
