"use server";

/**
 * The server actions of the e-IFU pages (stage B3 contract, IFU-10, IFU-20,
 * IFU-30, IFU-31, IFU-40).
 *
 * A server action is a public POST endpoint, so each one does these steps in the
 * order of `sds-auth`: it needs a session (401 `AUTH-4100`), then the permission
 * of the action (403 `PERM-4150`), then it validates its argument (400 `VAL-40xx`),
 * and then it calls the same service as the route handler of the same operation.
 * The service checks the permission again with the data. Next.js compares
 * `Origin` with the host (FND-07 rule 3). Each action answers the envelope of
 * `sds-api-design`.
 *
 * The upload of a document file and the replacement of a published file have no
 * action. The browser sends them with `fetch` to the route handler, because the
 * body of an action is capped at 1 MiB by default and a file is up to 20 MiB
 * (DEC-092, IFU-20 rule 2). The pages read lists and details through the
 * services, in server components, and the download URL through the route
 * `GET document-files/{id}/download-url` (DEC-093).
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type SessionActor, requirePermission } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/errors";
import { parseWith, runAction } from "@/lib/http";
import {
  CreateDocumentInput,
  CreateOverrideInput,
  CreateVersionInput,
  type DocumentDetail,
  EndOverrideInput,
  type FileView,
  type LotOverrideView,
  type PeriodView,
  PublishInput,
  UpdateDocumentInput,
  UpdateVersionInput,
  type VersionDetail,
  WithdrawInput,
} from "@/lib/schemas/eifu";
import { EntityId, type PermissionCode } from "@/lib/schemas/identity";
import { createDocument, createVersion, updateDocument, updateVersion } from "@/modules/eifu/services/document-service";
import { deactivateFile } from "@/modules/eifu/services/file-service";
import { createOverride, endOverride } from "@/modules/eifu/services/override-service";
import { publishVersion, withdrawVersion } from "@/modules/eifu/services/publication-service";
import { requireCurrentActor } from "@/modules/identity/current-actor";

const IdArgument = z.strictObject({ id: EntityId });

/** The session, and the permission of the action. Nothing is validated before both pass. */
async function authorize(permission: PermissionCode): Promise<SessionActor> {
  const actor = await requireCurrentActor();
  requirePermission(actor, permission);
  return actor;
}

/** The pages that show a document, its versions and its files. */
function revalidateDocumentPages(): void {
  revalidatePath("/backoffice/documents");
  revalidatePath("/backoffice/documents/[id]", "page");
  revalidatePath("/backoffice/documents/[id]/versions/[versionId]", "page");
  revalidatePath("/backoffice/catalog/products/[id]", "page");
}

/** The pages that show an override. */
function revalidateOverridePages(): void {
  revalidatePath("/backoffice/lot-overrides");
  revalidatePath("/backoffice/catalog/lots/[id]", "page");
}

/** Creates a document (`eifu.document.manage`). */
export async function createDocumentAction(input: CreateDocumentInput): Promise<ActionResult<{ document: DocumentDetail }>> {
  return runAction("createDocument", async () => {
    const actor = await authorize("eifu.document.manage");
    const document = await createDocument(actor, parseWith(CreateDocumentInput, input));
    revalidateDocumentPages();
    return { status: "ok", document };
  });
}

/** Changes a document with a merge patch (`eifu.document.manage`). */
export async function updateDocumentAction(id: string, patch: UpdateDocumentInput): Promise<ActionResult<{ document: DocumentDetail }>> {
  return runAction("updateDocument", async () => {
    const actor = await authorize("eifu.document.manage");
    const argument = parseWith(IdArgument, { id });
    const document = await updateDocument(actor, argument.id, parseWith(UpdateDocumentInput, patch));
    revalidateDocumentPages();
    return { status: "ok", document };
  });
}

/** Creates a version of a document as `DRAFT` (`eifu.document.manage`). */
export async function createVersionAction(documentId: string, input: CreateVersionInput): Promise<ActionResult<{ version: VersionDetail }>> {
  return runAction("createVersion", async () => {
    const actor = await authorize("eifu.document.manage");
    const argument = parseWith(IdArgument, { id: documentId });
    const version = await createVersion(actor, argument.id, parseWith(CreateVersionInput, input));
    revalidateDocumentPages();
    return { status: "ok", version };
  });
}

/** Changes the proposed start of a `DRAFT` version with a merge patch (`eifu.document.manage`). */
export async function updateVersionAction(id: string, patch: UpdateVersionInput): Promise<ActionResult<{ version: VersionDetail }>> {
  return runAction("updateVersion", async () => {
    const actor = await authorize("eifu.document.manage");
    const argument = parseWith(IdArgument, { id });
    const version = await updateVersion(actor, argument.id, parseWith(UpdateVersionInput, patch));
    revalidateDocumentPages();
    return { status: "ok", version };
  });
}

/** Removes a file of a `DRAFT` version by deactivation (`eifu.document.manage`). */
export async function deactivateFileAction(id: string): Promise<ActionResult<{ file: FileView }>> {
  return runAction("deactivateFile", async () => {
    const actor = await authorize("eifu.document.manage");
    const argument = parseWith(IdArgument, { id });
    const file = await deactivateFile(actor, argument.id);
    revalidateDocumentPages();
    return { status: "ok", file };
  });
}

/** Publishes a `DRAFT` version (`eifu.document.publish`). */
export async function publishVersionAction(
  id: string,
  input: PublishInput,
): Promise<ActionResult<{ version: VersionDetail; period: PeriodView; supersededVersionId: string | null }>> {
  return runAction("publishVersion", async () => {
    const actor = await authorize("eifu.document.publish");
    const argument = parseWith(IdArgument, { id });
    const result = await publishVersion(actor, argument.id, parseWith(PublishInput, input));
    revalidateDocumentPages();
    return { status: "ok", ...result };
  });
}

/** Withdraws a version with a reason, and reopens the previous version if asked (`eifu.document.withdraw`). */
export async function withdrawVersionAction(
  id: string,
  input: WithdrawInput,
): Promise<ActionResult<{ version: VersionDetail; reopenedVersionId: string | null }>> {
  return runAction("withdrawVersion", async () => {
    const actor = await authorize("eifu.document.withdraw");
    const argument = parseWith(IdArgument, { id });
    const result = await withdrawVersion(actor, argument.id, parseWith(WithdrawInput, input));
    revalidateDocumentPages();
    revalidateOverridePages();
    return { status: "ok", ...result };
  });
}

/** Creates an override from a LOT to a version (`eifu.lot_override.manage`). */
export async function createOverrideAction(lotId: string, input: CreateOverrideInput): Promise<ActionResult<{ override: LotOverrideView }>> {
  return runAction("createOverride", async () => {
    const actor = await authorize("eifu.lot_override.manage");
    const argument = parseWith(IdArgument, { id: lotId });
    const override = await createOverride(actor, argument.id, parseWith(CreateOverrideInput, input));
    revalidateOverridePages();
    return { status: "ok", override };
  });
}

/** Ends an override with a reason (`eifu.lot_override.manage`). */
export async function endOverrideAction(id: string, input: EndOverrideInput): Promise<ActionResult<{ override: LotOverrideView }>> {
  return runAction("endOverride", async () => {
    const actor = await authorize("eifu.lot_override.manage");
    const argument = parseWith(IdArgument, { id });
    const override = await endOverride(actor, argument.id, parseWith(EndOverrideInput, input));
    revalidateOverridePages();
    return { status: "ok", override };
  });
}
