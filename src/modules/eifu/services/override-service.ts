/**
 * LOT overrides (IFU-40, DEC-066).
 *
 * An override binds one LOT to one `PUBLISHED` or `SUPERSEDED` version of the
 * product of that LOT, with a reason. A LOT has at most one active override. An
 * override ends by deactivation with a reason, and the row stays (DEC-010). Each
 * function checks the permission of the actor first (DEC-029), and each change
 * writes one audit row (PLT-40). A LOT is read only through a catalog service
 * (DEC-004).
 *
 * MOCK: IFU-40. The functions read and write the mock store. Step 4 moves the
 * work to the repositories and one transaction for each change, locks the LOT,
 * and lets `lot_override_one_active_per_lot` refuse a second active override.
 */
import "server-only";

import { type SessionActor, requirePermission } from "@/lib/auth/session";
import { now } from "@/lib/clock";
import { AppError, CODE_MEANINGS } from "@/lib/errors";
import { validationError } from "@/lib/http/validation";
import { type MockOverride, getEifuMock } from "@/lib/mock/eifu";
import {
  type CreateOverrideInput,
  EIFU_ISSUES,
  type EndOverrideInput,
  type LotOverrideListPage,
  type LotOverrideListQuery,
  type LotOverrideView,
  type LotOverrides,
} from "@/lib/schemas/eifu";
import { EntityId } from "@/lib/schemas/identity";

import {
  alreadyExists,
  documentOfVersion,
  notAllowedInState,
  notFound,
  pageOf,
  recordAudit,
  requireEifuId,
  requireReason,
  resolveLot,
  toOverrideView,
} from "./eifu-views";

/** The overrides of the mock store, newest first. */
function allOverrides(): MockOverride[] {
  return [...getEifuMock().overrides.values()].sort((left, right) => Number(right.id) - Number(left.id));
}

/** The state of an override that the audit row shows. */
function auditState(override: MockOverride): Record<string, unknown> {
  return { lotId: override.lotId, documentVersionId: override.versionId, isActive: override.isActive };
}

/** The view of an override, with its LOT. A LOT always exists (`restrict` on delete): a gap is a broken store. */
async function viewOf(actor: SessionActor, override: MockOverride): Promise<LotOverrideView> {
  const lot = await resolveLot(actor, override.lotId);
  if (lot === null) {
    throw new AppError("DB-5000", CODE_MEANINGS["DB-5000"], { reason: "an override has no LOT" });
  }
  return toOverrideView(override, lot);
}

/**
 * The active override of a LOT, and its history: the ended overrides, newest first.
 *
 * @throws AppError `PERM-4150` without `eifu.document.view`; `RES-4200` for a LOT that does not exist.
 */
export async function listOverridesOfLot(actor: SessionActor, lotId: string): Promise<LotOverrides> {
  requirePermission(actor, "eifu.document.view");
  if ((await resolveLot(actor, requireEifuId(lotId))) === null) {
    throw notFound();
  }
  // MOCK: IFU-40 (read the overrides of a LOT)
  const overrides = allOverrides().filter((override) => override.lotId === lotId);
  const active = overrides.find((override) => override.isActive);
  return {
    active: active === undefined ? null : await viewOf(actor, active),
    history: await Promise.all(overrides.filter((override) => !override.isActive).map((override) => viewOf(actor, override))),
  };
}

/**
 * Creates an override from a LOT to a `PUBLISHED` or `SUPERSEDED` version of the
 * product of the LOT (IFU-40.AC1). The creation has one audit row.
 *
 * @throws AppError `PERM-4150` without `eifu.lot_override.manage`; `VAL-4001` for
 * a blank reason (AC5); `RES-4200` for a LOT that does not exist; `VAL-4006` on
 * `documentVersionId` for a version that does not exist, is `DRAFT` or `WITHDRAWN`
 * (AC2), or belongs to a document of another product (AC3); `RES-4300` when the
 * LOT has an active override (AC4).
 */
export async function createOverride(actor: SessionActor, lotId: string, input: CreateOverrideInput): Promise<LotOverrideView> {
  requirePermission(actor, "eifu.lot_override.manage");
  const reason = requireReason(input.reason);
  const lot = await resolveLot(actor, requireEifuId(lotId));
  if (lot === null) {
    throw notFound();
  }
  // MOCK: IFU-40 (create)
  const state = getEifuMock();
  const version = EntityId.safeParse(input.documentVersionId).success ? state.versions.get(input.documentVersionId) : undefined;
  if (version === undefined) {
    throw validationError([{ code: "VAL-4006", entry: { field: "documentVersionId", issue: EIFU_ISSUES.versionNotFound } }]);
  }
  if (version.status !== "PUBLISHED" && version.status !== "SUPERSEDED") {
    throw validationError([{ code: "VAL-4006", entry: { field: "documentVersionId", issue: EIFU_ISSUES.versionNotPublished } }]);
  }
  if (documentOfVersion(version).productId !== lot.productId) {
    throw validationError([{ code: "VAL-4006", entry: { field: "documentVersionId", issue: EIFU_ISSUES.versionOfOtherProduct } }]);
  }
  // A second creation between this check and the insert fails on `lot_override_one_active_per_lot` with the same `RES-4300`.
  if (allOverrides().some((override) => override.lotId === lot.id && override.isActive)) {
    throw alreadyExists("the LOT has an active override");
  }
  const override: MockOverride = {
    id: String(state.nextOverrideId),
    lotId: lot.id,
    versionId: version.id,
    reason,
    createdByUserId: actor.userId,
    createdAt: now(),
    isActive: true,
    endedByUserId: null,
    endedAt: null,
    endReason: null,
  };
  state.nextOverrideId += 1;
  state.overrides.set(override.id, override);
  recordAudit(actor, {
    actionCode: "eifu.lot_override.created",
    entityType: "eifu_lot_override",
    entityId: override.id,
    stateBefore: null,
    stateAfter: auditState(override),
    reason,
  });
  return toOverrideView(override, lot);
}

/**
 * Ends an override with a reason. The row stays with `isActive` false (IFU-40.AC6).
 * The end has one audit row.
 *
 * @throws AppError `PERM-4150` without `eifu.lot_override.manage`; `VAL-4001` for
 * a blank reason (AC7); `RES-4200`; `RES-4302` when the override has ended.
 */
export async function endOverride(actor: SessionActor, id: string, input: EndOverrideInput): Promise<LotOverrideView> {
  requirePermission(actor, "eifu.lot_override.manage");
  const reason = requireReason(input.reason);
  // MOCK: IFU-40 (end)
  const override = getEifuMock().overrides.get(requireEifuId(id));
  if (override === undefined) {
    throw notFound();
  }
  if (!override.isActive) {
    throw notAllowedInState("the override has ended");
  }
  const before = auditState(override);
  override.isActive = false;
  override.endedByUserId = actor.userId;
  override.endedAt = now();
  override.endReason = reason;
  recordAudit(actor, {
    actionCode: "eifu.lot_override.ended",
    entityType: "eifu_lot_override",
    entityId: override.id,
    stateBefore: before,
    stateAfter: auditState(override),
    reason,
  });
  return viewOf(actor, override);
}

/**
 * Lists the overrides of all LOTs, one page: the active ones first, then the
 * ended ones, each group newest first (DEC-094).
 *
 * @throws AppError `PERM-4150` without `eifu.document.view`.
 */
export async function listOverrides(actor: SessionActor, query: LotOverrideListQuery): Promise<LotOverrideListPage> {
  requirePermission(actor, "eifu.document.view");
  // MOCK: IFU-40 (list)
  const matching = allOverrides()
    .filter((override) => query.active === null || override.isActive === query.active)
    .sort((left, right) => Number(right.isActive) - Number(left.isActive) || Number(right.id) - Number(left.id));
  const { slice, totalCount } = pageOf(matching, query);
  const overrides = await Promise.all(slice.map((override) => viewOf(actor, override)));
  return { page: query.page, count: overrides.length, totalCount, overrides, filterParams: query };
}
