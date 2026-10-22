/**
 * LOT overrides (IFU-40, DEC-066).
 *
 * An override binds one LOT to one `PUBLISHED` or `SUPERSEDED` version of the
 * product of that LOT, with a reason. A LOT has at most one active override. An
 * override ends by deactivation with a reason, and the row stays (DEC-010). Each
 * function checks the permission of the actor first (DEC-029), and each change
 * runs in one transaction with its audit row (PLT-40). A LOT is read only through
 * a catalog service (DEC-004).
 */
import "server-only";

import { type SessionActor, requirePermission } from "@/lib/auth/session";
import { now } from "@/lib/clock";
import type { AppError } from "@/lib/errors";
import { validationError } from "@/lib/http/validation";
import {
  type CreateOverrideInput,
  EIFU_ISSUES,
  type EndOverrideInput,
  type LotOverrideListPage,
  type LotOverrideListQuery,
  type LotOverrideView,
  type LotOverrides,
} from "@/lib/schemas/eifu";
import { readExecutor, runTransaction, violatedConstraint } from "@/lib/transaction";

import { findDocumentById } from "../repositories/document-repository";
import {
  findActiveOverrideOfLot,
  findOverrideById,
  insertOverride,
  listOverrideRows,
  listOverridesOfLot as readOverridesOfLot,
  markOverrideEnded,
} from "../repositories/override-repository";
import { findVersionById } from "../repositories/version-repository";
import {
  alreadyExists,
  loadOverrideViews,
  notAllowedInState,
  notFound,
  parseEifuId,
  recordAudit,
  requireEifuKey,
  requireReason,
  resolveLot,
} from "./eifu-views";

/** The index that the database names for a second active override of one LOT (IFU-40.AC4). */
const ONE_ACTIVE_RULE = "lot_override_one_active_per_lot";

function onlyOne(): AppError {
  return alreadyExists("the LOT has an active override");
}

/**
 * The active override of a LOT, and its history: the ended overrides, newest first.
 *
 * @throws AppError `PERM-4150` without `eifu.document.view`; `RES-4200` for a LOT that does not exist.
 */
export async function listOverridesOfLot(actor: SessionActor, lotId: string): Promise<LotOverrides> {
  requirePermission(actor, "eifu.document.view");
  const key = requireEifuKey(lotId);
  if ((await resolveLot(actor, lotId)) === null) {
    throw notFound();
  }
  const executor = readExecutor();
  const rows = await readOverridesOfLot(executor, key);
  const views = await loadOverrideViews(actor, executor, rows);
  return { active: views.find((view) => view.isActive) ?? null, history: views.filter((view) => !view.isActive) };
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
  const lotKey = requireEifuKey(lotId);
  const lot = await resolveLot(actor, lotId);
  if (lot === null) {
    throw notFound();
  }
  const versionKey = parseEifuId(input.documentVersionId);
  return runTransaction(async (tx) => {
    // A shared lock: a withdrawal of the version waits for this commit, and the check below sees the state that the override keeps.
    const version = versionKey === null ? null : await findVersionById(tx, versionKey, "share");
    if (version === null) {
      throw validationError([{ code: "VAL-4006", entry: { field: "documentVersionId", issue: EIFU_ISSUES.versionNotFound } }]);
    }
    if (version.status !== "PUBLISHED" && version.status !== "SUPERSEDED") {
      throw validationError([{ code: "VAL-4006", entry: { field: "documentVersionId", issue: EIFU_ISSUES.versionNotPublished } }]);
    }
    const document = await findDocumentById(tx, version.documentId);
    if (document === null || String(document.productId) !== lot.productId) {
      throw validationError([{ code: "VAL-4006", entry: { field: "documentVersionId", issue: EIFU_ISSUES.versionOfOtherProduct } }]);
    }
    // A second creation between this check and the insert fails on the index `lot_override_one_active_per_lot` with the same `RES-4300`.
    if ((await findActiveOverrideOfLot(tx, lotKey)) !== null) {
      throw onlyOne();
    }
    let override;
    try {
      override = await insertOverride(tx, {
        lotId: lotKey,
        documentVersionId: version.id,
        reason,
        createdByUserId: BigInt(actor.userId),
        now: now(),
      });
    } catch (error) {
      throw violatedConstraint(error) === ONE_ACTIVE_RULE ? onlyOne() : error;
    }
    await recordAudit(tx, actor, {
      actionCode: "eifu.lot_override.created",
      entityType: "eifu_lot_override",
      entityId: String(override.id),
      stateBefore: null,
      stateAfter: { lotId: String(override.lotId), documentVersionId: String(override.documentVersionId), isActive: true },
      reason,
    });
    const [view] = await loadOverrideViews(actor, tx, [override]);
    if (view === undefined) {
      throw new Error("The view of the new override is missing");
    }
    return view;
  });
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
  const key = requireEifuKey(id);
  return runTransaction(async (tx) => {
    const override = await findOverrideById(tx, key, "update");
    if (override === null) {
      throw notFound();
    }
    if (!override.isActive) {
      throw notAllowedInState("the override has ended");
    }
    const at = now();
    await markOverrideEnded(tx, override.id, BigInt(actor.userId), reason, at);
    await recordAudit(tx, actor, {
      actionCode: "eifu.lot_override.ended",
      entityType: "eifu_lot_override",
      entityId: String(override.id),
      stateBefore: { lotId: String(override.lotId), documentVersionId: String(override.documentVersionId), isActive: true },
      stateAfter: { lotId: String(override.lotId), documentVersionId: String(override.documentVersionId), isActive: false },
      reason,
    });
    const ended = { ...override, isActive: false, endedByUserId: BigInt(actor.userId), endedAt: at, endReason: reason };
    const [view] = await loadOverrideViews(actor, tx, [ended]);
    if (view === undefined) {
      throw new Error("The view of the ended override is missing");
    }
    return view;
  });
}

/**
 * Lists the overrides of all LOTs, one page: the active ones first, then the
 * ended ones, each group newest first (DEC-094).
 *
 * @throws AppError `PERM-4150` without `eifu.document.view`.
 */
export async function listOverrides(actor: SessionActor, query: LotOverrideListQuery): Promise<LotOverrideListPage> {
  requirePermission(actor, "eifu.document.view");
  const executor = readExecutor();
  const { rows, totalCount } = await listOverrideRows(executor, { active: query.active, page: query.page, limit: query.limit });
  const overrides = await loadOverrideViews(actor, executor, rows);
  return { page: query.page, count: overrides.length, totalCount, overrides, filterParams: query };
}
