/**
 * The table `eifu_lot_override` (IFU-40). It holds queries and nothing else. It
 * never decides who may do what, and it never deletes a row: the triggers of the
 * table refuse DELETE and TRUNCATE (DEC-010). An override ends by deactivation,
 * and the row stays.
 */
import "server-only";

import { type Executor, fromColumnInstant, toColumnInstant } from "@/lib/db";

import type { RowLock } from "./stored-values";

/** One override as the services read it. */
export interface OverrideRow {
  readonly id: bigint;
  readonly lotId: bigint;
  readonly documentVersionId: bigint;
  readonly reason: string;
  readonly createdByUserId: bigint;
  readonly createdAt: Date;
  readonly isActive: boolean;
  readonly endedByUserId: bigint | null;
  readonly endedAt: Date | null;
  readonly endReason: string | null;
}

export interface NewOverride {
  readonly lotId: bigint;
  readonly documentVersionId: bigint;
  readonly reason: string;
  readonly createdByUserId: bigint;
  readonly now: Date;
}

interface StoredOverride {
  readonly id: bigint;
  readonly lotId: bigint;
  readonly documentVersionId: bigint;
  readonly reason: string;
  readonly createdByUserId: bigint;
  readonly createdAt: string;
  readonly isActive: boolean;
  readonly endedByUserId: bigint | null;
  readonly endedAt: string | null;
  readonly endReason: string | null;
}

function toOverrideRow(row: StoredOverride): OverrideRow {
  return {
    id: row.id,
    lotId: row.lotId,
    documentVersionId: row.documentVersionId,
    reason: row.reason,
    createdByUserId: row.createdByUserId,
    createdAt: fromColumnInstant(row.createdAt),
    isActive: row.isActive,
    endedByUserId: row.endedByUserId,
    endedAt: row.endedAt === null ? null : fromColumnInstant(row.endedAt),
    endReason: row.endReason,
  };
}

/** The override with the id, or `null`. `update` locks the row, for the end of the override. A lock needs a transaction. */
export async function findOverrideById(executor: Executor, id: bigint, lock: RowLock = "none"): Promise<OverrideRow | null> {
  const overrides = executor.orm.public.EifuLotOverride.where({ id });
  const row = await (lock === "update"
    ? overrides.forUpdate()
    : lock === "no-key-update"
      ? overrides.forNoKeyUpdate()
      : lock === "share"
        ? overrides.forShare()
        : overrides
  ).first();
  return row === null ? null : toOverrideRow(row);
}

/** The overrides of one LOT, the active one first, then newest first. */
export async function listOverridesOfLot(executor: Executor, lotId: bigint): Promise<OverrideRow[]> {
  const rows = await executor.orm.public.EifuLotOverride.where({ lotId })
    .orderBy((override) => override.id.desc())
    .all();
  // A boolean has no sort order in the query builder, so the active override moves to the front here. The sort is stable.
  return rows.map(toOverrideRow).sort((left, right) => Number(right.isActive) - Number(left.isActive));
}

/** The active override of the LOT, or `null` (`lot_override_one_active_per_lot`). */
export async function findActiveOverrideOfLot(executor: Executor, lotId: bigint): Promise<OverrideRow | null> {
  const row = await executor.orm.public.EifuLotOverride.where({ lotId, isActive: true }).first();
  return row === null ? null : toOverrideRow(row);
}

export interface OverridePageQuery {
  /** `true` for the active overrides, `false` for the ended ones, `null` for all. */
  readonly active: boolean | null;
  readonly page: number;
  readonly limit: number;
}

export interface OverridePage {
  readonly rows: readonly OverrideRow[];
  readonly totalCount: number;
}

/**
 * One page of overrides: the active ones first, then the ended ones, each group
 * newest first (DEC-094). The order is total. A boolean has no sort order in the
 * query builder, so the page is cut from the two groups in turn: the window of the
 * page covers the active group first, and the ended group after it.
 */
export async function listOverrideRows(executor: Executor, query: OverridePageQuery): Promise<OverridePage> {
  const overrides = executor.orm.public.EifuLotOverride;
  const offset = (query.page - 1) * query.limit;
  const groupSize = async (isActive: boolean): Promise<number> =>
    query.active !== null && query.active !== isActive
      ? 0
      : (await overrides.where({ isActive }).aggregate((aggregate) => ({ total: aggregate.count() }))).total;
  const [activeTotal, endedTotal] = await Promise.all([groupSize(true), groupSize(false)]);

  const groupRows = async (isActive: boolean, from: number, count: number): Promise<OverrideRow[]> => {
    if (count <= 0) {
      return [];
    }
    const rows = await overrides
      .where({ isActive })
      .orderBy((override) => override.id.desc())
      .offset(from)
      .limit(count)
      .all();
    return rows.map(toOverrideRow);
  };

  const activeRows = offset < activeTotal ? await groupRows(true, offset, Math.min(query.limit, activeTotal - offset)) : [];
  const endedOffset = Math.max(0, offset - activeTotal);
  const endedRows = endedOffset < endedTotal ? await groupRows(false, endedOffset, query.limit - activeRows.length) : [];
  return { rows: [...activeRows, ...endedRows], totalCount: activeTotal + endedTotal };
}

/** Inserts an active override. A second active override of the LOT fails with `23505` on `lot_override_one_active_per_lot` (IFU-40.AC4). */
export async function insertOverride(executor: Executor, override: NewOverride): Promise<OverrideRow> {
  const row = await executor.orm.public.EifuLotOverride.create({
    lotId: override.lotId,
    documentVersionId: override.documentVersionId,
    reason: override.reason,
    createdByUserId: override.createdByUserId,
    createdAt: toColumnInstant(override.now),
    isActive: true,
    endedByUserId: null,
    endedAt: null,
    endReason: null,
  });
  return toOverrideRow(row);
}

/** Ends the override with the person, the time and the reason. The row stays (IFU-40.AC6, DEC-010). */
export async function markOverrideEnded(executor: Executor, id: bigint, userId: bigint, reason: string, now: Date): Promise<void> {
  await executor.orm.public.EifuLotOverride.where({ id }).update({
    isActive: false,
    endedByUserId: userId,
    endedAt: toColumnInstant(now),
    endReason: reason,
  });
}
