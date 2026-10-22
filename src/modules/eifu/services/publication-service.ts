/**
 * Publication and withdrawal of a version (IFU-30, IFU-31).
 *
 * Each function checks the permission of the actor first (DEC-029). The system
 * never deletes a period (DEC-010). The business dates are `YYYY-MM-DD` texts
 * (DEC-039); the period is half-open (DEC-061).
 *
 * MOCK: IFU-30, IFU-31. The functions read and write the mock store, in the order
 * that the real work has. Step 4 runs each function in one transaction, locks the
 * document and the live periods of the product, and lets the constraints of the
 * database refuse an overlap (IFU-30.AC7).
 */
import "server-only";

import { type SessionActor, requirePermission } from "@/lib/auth/session";
import { now } from "@/lib/clock";
import { AppError, CODE_MEANINGS } from "@/lib/errors";
import { validationError } from "@/lib/http/validation";
import { getEifuMock } from "@/lib/mock/eifu";
import type { PublicationResult, PublishInput, WithdrawInput, WithdrawalResult } from "@/lib/schemas/eifu";

import { planPublication } from "../domain/periods";
import {
  documentOfVersion,
  filesOfVersion,
  livePeriodsOfProduct,
  notAllowedInState,
  periodOfVersion,
  recordAudit,
  requireReason,
  requireVersion,
  toPeriodView,
  toVersionDetail,
} from "./eifu-views";

/**
 * Publishes a `DRAFT` version, in the order of IFU-30 rule 3:
 *
 * 1. refuses a version that is not `DRAFT`;
 * 2. refuses a version that has no active file;
 * 3. refuses when the product of the document is not `expectedProductId`;
 * 4. plans the period from the live periods of the product, and closes the open
 *    period, which moves its version to `SUPERSEDED`;
 * 5. creates the new period with no end;
 * 6. moves the version to `PUBLISHED`, with the time and the publisher;
 * 7. writes the audit row, with the superseded version.
 *
 * @throws AppError `PERM-4150` without `eifu.document.publish`; `RES-4200`;
 * `RES-4302` for a version that is not `DRAFT` (AC5) or has no active file (AC4);
 * `RES-4301` when `expectedProductId` is not the product of the document (AC6);
 * `VAL-4006` on `effectiveFrom` (AC3, AC8).
 */
export async function publishVersion(actor: SessionActor, versionId: string, input: PublishInput): Promise<PublicationResult> {
  requirePermission(actor, "eifu.document.publish");
  // MOCK: IFU-30 (publication)
  const state = getEifuMock();
  const version = requireVersion(versionId);
  if (version.status !== "DRAFT") {
    throw notAllowedInState("the publication of a version that is not a draft");
  }
  if (!filesOfVersion(version.id).some((file) => file.isActive)) {
    throw notAllowedInState("the publication of a version with no active file");
  }
  const document = documentOfVersion(version);
  if (document.productId !== input.expectedProductId) {
    throw new AppError("RES-4301", CODE_MEANINGS["RES-4301"], { reason: "the product of the document is not the expected product" });
  }
  const plan = planPublication(livePeriodsOfProduct(document.productId), input.effectiveFrom);
  if (plan.kind === "refused") {
    throw validationError([{ code: "VAL-4006", entry: { field: "effectiveFrom", issue: plan.issue } }]);
  }
  const at = now();
  let supersededVersionId: string | null = null;
  if (plan.closes !== null) {
    const open = state.periods.get(plan.closes.id);
    const previous = open === undefined ? undefined : state.versions.get(open.versionId);
    if (open === undefined || previous === undefined) {
      throw new AppError("DB-5000", CODE_MEANINGS["DB-5000"], { reason: "the open period has no version" });
    }
    open.effectiveTo = input.effectiveFrom;
    previous.status = "SUPERSEDED";
    previous.supersededAt = at;
    previous.updatedAt = at;
    supersededVersionId = previous.id;
  }
  const period = {
    id: String(state.nextPeriodId),
    versionId: version.id,
    productId: document.productId,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: null,
    withdrawnAt: null,
  };
  state.nextPeriodId += 1;
  state.periods.set(period.id, period);
  version.status = "PUBLISHED";
  version.publishedAt = at;
  version.publishedByUserId = actor.userId;
  version.updatedAt = at;
  recordAudit(actor, {
    actionCode: "eifu.document_version.published",
    entityType: "eifu_document_version",
    entityId: version.id,
    stateBefore: { status: "DRAFT" },
    stateAfter: {
      status: "PUBLISHED",
      productId: period.productId,
      effectiveFrom: period.effectiveFrom,
      effectiveTo: null,
      supersededVersionId,
    },
  });
  return { version: await toVersionDetail(actor, version), period: toPeriodView(period), supersededVersionId };
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
  // MOCK: IFU-31 (withdrawal)
  const state = getEifuMock();
  const version = requireVersion(versionId);
  if (version.status !== "PUBLISHED" && version.status !== "SUPERSEDED") {
    throw notAllowedInState("the withdrawal of a version that is not published");
  }
  const period = periodOfVersion(version.id);
  if (period === null || period.withdrawnAt !== null) {
    throw new AppError("DB-5000", CODE_MEANINGS["DB-5000"], { reason: "a published version has no live period" });
  }
  const reopen = input.reopenPrevious === true;
  const previousPeriod = reopen
    ? [...state.periods.values()].find(
        (candidate) =>
          candidate.productId === period.productId && candidate.withdrawnAt === null && candidate.effectiveTo === period.effectiveFrom,
      )
    : undefined;
  if (reopen && (period.effectiveTo !== null || previousPeriod === undefined)) {
    throw notAllowedInState("the reopening needs the open period of the version and a period that ends at its start");
  }
  const at = now();
  const before = { status: version.status };
  period.withdrawnAt = at;
  version.status = "WITHDRAWN";
  version.withdrawnAt = at;
  version.withdrawnByUserId = actor.userId;
  version.withdrawalReason = reason;
  version.updatedAt = at;
  let reopenedVersionId: string | null = null;
  if (previousPeriod !== undefined) {
    const previous = state.versions.get(previousPeriod.versionId);
    if (previous === undefined) {
      throw new AppError("DB-5000", CODE_MEANINGS["DB-5000"], { reason: "a period has no version" });
    }
    previousPeriod.effectiveTo = null;
    previous.status = "PUBLISHED";
    previous.supersededAt = null;
    previous.updatedAt = at;
    reopenedVersionId = previous.id;
  }
  recordAudit(actor, {
    actionCode: "eifu.document_version.withdrawn",
    entityType: "eifu_document_version",
    entityId: version.id,
    stateBefore: before,
    stateAfter: { status: "WITHDRAWN", reopenedVersionId },
    reason,
  });
  return { version: await toVersionDetail(actor, version), reopenedVersionId };
}
