/**
 * Publication and withdrawal of a version (IFU-30, IFU-31).
 *
 * Each function checks the permission of the actor first (DEC-029) and runs in
 * one transaction with its audit row (PLT-40). The system never deletes a period
 * (DEC-010). The business dates are `YYYY-MM-DD` texts (DEC-039); the period is
 * half-open (DEC-061).
 *
 * The rows are locked in one order in both functions, so that two transactions
 * never wait for each other in a circle: the document, then the live periods of
 * its product in the order of their ids, then the versions that the change
 * moves. The order of the plan is the one of the pure function `planPublication`.
 * The constraints of the database hold what a race could still break:
 * `applicability_no_overlap_per_product` refuses an overlap (IFU-30.AC7), and a
 * refusal of a concurrent write is 409 `RES-4301`.
 */
import "server-only";

import { type SessionActor, requirePermission } from "@/lib/auth/session";
import { now } from "@/lib/clock";
import { AppError, CODE_MEANINGS } from "@/lib/errors";
import { validationError } from "@/lib/http/validation";
import type { PublicationResult, PublishInput, WithdrawInput, WithdrawalResult } from "@/lib/schemas/eifu";
import { runTransaction } from "@/lib/transaction";

import { planPublication } from "../domain/periods";
import {
  type PeriodRow,
  insertOpenPeriod,
  lockLivePeriodsOfProduct,
  markPeriodWithdrawn,
  setPeriodEnd,
} from "../repositories/applicability-repository";
import { findDocumentById } from "../repositories/document-repository";
import { hasActiveFile } from "../repositories/file-repository";
import {
  findVersionById,
  markVersionPublished,
  markVersionReopened,
  markVersionSuperseded,
  markVersionWithdrawn,
} from "../repositories/version-repository";
import {
  loadVersionDetail,
  notAllowedInState,
  notFound,
  recordAudit,
  requireEifuKey,
  requireReason,
  toPeriodView,
} from "./eifu-views";

function brokenStore(reason: string): AppError {
  return new AppError("DB-5000", CODE_MEANINGS["DB-5000"], { reason });
}

/**
 * Publishes a `DRAFT` version, in the order of IFU-30 rule 3:
 *
 * 1. refuses a version that is not `DRAFT`;
 * 2. refuses a version that has no active file;
 * 3. locks the document, and refuses when the product of the document is not
 *    `expectedProductId`;
 * 4. locks the live periods of the product, plans the period from them, and
 *    closes the open period, which moves its version to `SUPERSEDED`;
 * 5. creates the new period with no end;
 * 6. moves the version to `PUBLISHED`, with the time and the publisher;
 * 7. writes the audit row, with the superseded version.
 *
 * @throws AppError `PERM-4150` without `eifu.document.publish`; `RES-4200`;
 * `RES-4302` for a version that is not `DRAFT` (AC5) or has no active file (AC4);
 * `RES-4301` when `expectedProductId` is not the product of the document (AC6),
 * or a concurrent publication took the period; `VAL-4006` on `effectiveFrom`
 * (AC3, AC8).
 */
export async function publishVersion(actor: SessionActor, versionId: string, input: PublishInput): Promise<PublicationResult> {
  requirePermission(actor, "eifu.document.publish");
  const key = requireEifuKey(versionId);
  return runTransaction(async (tx) => {
    const version = await findVersionById(tx, key, "no-key-update");
    if (version === null) {
      throw notFound();
    }
    if (version.status !== "DRAFT") {
      throw notAllowedInState("the publication of a version that is not a draft");
    }
    if (!(await hasActiveFile(tx, version.id))) {
      throw notAllowedInState("the publication of a version with no active file");
    }
    const document = await findDocumentById(tx, version.documentId, "no-key-update");
    if (document === null) {
      throw brokenStore("a version has no document");
    }
    if (String(document.productId) !== input.expectedProductId) {
      throw new AppError("RES-4301", CODE_MEANINGS["RES-4301"], { reason: "the product of the document is not the expected product" });
    }
    const livePeriods = await lockLivePeriodsOfProduct(tx, document.productId);
    const plan = planPublication(
      livePeriods.map((period) => ({ id: String(period.id), effectiveFrom: period.effectiveFrom, effectiveTo: period.effectiveTo })),
      input.effectiveFrom,
    );
    if (plan.kind === "refused") {
      throw validationError([{ code: "VAL-4006", entry: { field: "effectiveFrom", issue: plan.issue } }]);
    }
    const at = now();
    let supersededVersionId: string | null = null;
    if (plan.closes !== null) {
      const open: PeriodRow | undefined = livePeriods.find((period) => String(period.id) === plan.closes?.id);
      if (open === undefined) {
        throw brokenStore("the open period is not among the live periods");
      }
      // The old period ends first, so the new one does not overlap it.
      await setPeriodEnd(tx, open.id, input.effectiveFrom);
      await markVersionSuperseded(tx, open.documentVersionId, at);
      supersededVersionId = String(open.documentVersionId);
    }
    const period = await insertOpenPeriod(tx, {
      documentVersionId: version.id,
      productId: document.productId,
      effectiveFrom: input.effectiveFrom,
      now: at,
    });
    await markVersionPublished(tx, version.id, BigInt(actor.userId), at);
    await recordAudit(tx, actor, {
      actionCode: "eifu.document_version.published",
      entityType: "eifu_document_version",
      entityId: String(version.id),
      stateBefore: { status: "DRAFT" },
      stateAfter: {
        status: "PUBLISHED",
        productId: String(period.productId),
        effectiveFrom: period.effectiveFrom,
        effectiveTo: null,
        supersededVersionId,
      },
    });
    const published = await findVersionById(tx, version.id);
    if (published === null) {
      throw brokenStore("a published version is missing");
    }
    return { version: await loadVersionDetail(actor, tx, published), period: toPeriodView(period), supersededVersionId };
  });
}

/**
 * Withdraws a `PUBLISHED` or `SUPERSEDED` version with a reason (IFU-31). The
 * period of the version stays and gets `withdrawnAt`. No other period changes,
 * unless the request asks to reopen: then the period that ended at the start of
 * this period loses its end, and its version is `PUBLISHED` again (DEC-064). The
 * system never guesses which of the two is right.
 *
 * @throws AppError `PERM-4150` without `eifu.document.withdraw`; `VAL-4001` for a
 * blank reason (AC4); `RES-4200`; `RES-4302` for a version that is not
 * `PUBLISHED` or `SUPERSEDED`, and for a reopening when the version holds no open
 * period (AC3) or no period ends at its start.
 */
export async function withdrawVersion(actor: SessionActor, versionId: string, input: WithdrawInput): Promise<WithdrawalResult> {
  requirePermission(actor, "eifu.document.withdraw");
  const reason = requireReason(input.reason);
  const key = requireEifuKey(versionId);
  return runTransaction(async (tx) => {
    // The version is read first to find its document. The lock order is then the one of the publication: the document, the periods, the versions.
    const found = await findVersionById(tx, key);
    if (found === null) {
      throw notFound();
    }
    const document = await findDocumentById(tx, found.documentId, "no-key-update");
    if (document === null) {
      throw brokenStore("a version has no document");
    }
    const livePeriods = await lockLivePeriodsOfProduct(tx, document.productId);
    const version = await findVersionById(tx, key, "no-key-update");
    if (version === null) {
      throw notFound();
    }
    if (version.status !== "PUBLISHED" && version.status !== "SUPERSEDED") {
      throw notAllowedInState("the withdrawal of a version that is not published");
    }
    const period = livePeriods.find((candidate) => candidate.documentVersionId === version.id);
    if (period === undefined) {
      throw brokenStore("a published version has no live period");
    }
    const reopen = input.reopenPrevious === true;
    const previousPeriod = reopen
      ? livePeriods.find((candidate) => candidate.id !== period.id && candidate.effectiveTo === period.effectiveFrom)
      : undefined;
    if (reopen && (period.effectiveTo !== null || previousPeriod === undefined)) {
      throw notAllowedInState("the reopening needs the open period of the version and a period that ends at its start");
    }
    const at = now();
    // The period of the withdrawn version leaves the constraint first, so the previous period can open again.
    await markPeriodWithdrawn(tx, period.id, at);
    await markVersionWithdrawn(tx, version.id, BigInt(actor.userId), reason, at);
    let reopenedVersionId: string | null = null;
    if (previousPeriod !== undefined) {
      await setPeriodEnd(tx, previousPeriod.id, null);
      const previous = await findVersionById(tx, previousPeriod.documentVersionId, "no-key-update");
      if (previous === null) {
        throw brokenStore("a period has no version");
      }
      await markVersionReopened(tx, previous.id, at);
      reopenedVersionId = String(previous.id);
    }
    await recordAudit(tx, actor, {
      actionCode: "eifu.document_version.withdrawn",
      entityType: "eifu_document_version",
      entityId: String(version.id),
      stateBefore: { status: version.status },
      stateAfter: { status: "WITHDRAWN", reopenedVersionId },
      reason,
    });
    const withdrawn = await findVersionById(tx, version.id);
    if (withdrawn === null) {
      throw brokenStore("a withdrawn version is missing");
    }
    return { version: await loadVersionDetail(actor, tx, withdrawn), reopenedVersionId };
  });
}
