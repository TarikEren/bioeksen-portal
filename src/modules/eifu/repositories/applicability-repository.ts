/**
 * The table `eifu_applicability` (IFU-30, IFU-31). It holds queries and nothing
 * else. It never decides who may do what, and it never deletes a row: the
 * triggers of the table refuse DELETE and TRUNCATE (DEC-010).
 *
 * The database holds the rules of the periods: `applicability_period_is_ordered`,
 * the exclusion constraint `applicability_no_overlap_per_product` and the trigger
 * `applicability_on_document_product`. A write that breaks one fails, and the
 * service has planned its write so that it does not.
 *
 * A period is half-open, and its dates are business dates (DEC-039, DEC-061): the
 * column carries the text `YYYY-MM-DD`, and this file never turns it into an
 * instant.
 */
import "server-only";

import { and, or } from "@prisma/orm-postgres/orm-client";

import { type Executor, fromColumnInstant, toColumnInstant } from "@/lib/db";

/** One period as the services read it. */
export interface PeriodRow {
  readonly id: bigint;
  readonly documentVersionId: bigint;
  readonly productId: bigint;
  readonly effectiveFrom: string;
  /** `null` for an open period. */
  readonly effectiveTo: string | null;
  readonly withdrawnAt: Date | null;
}

export interface NewPeriod {
  readonly documentVersionId: bigint;
  readonly productId: bigint;
  readonly effectiveFrom: string;
  readonly now: Date;
}

interface StoredPeriod {
  readonly id: bigint;
  readonly documentVersionId: bigint;
  readonly productId: bigint;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly withdrawnAt: string | null;
}

function toPeriodRow(row: StoredPeriod): PeriodRow {
  return {
    id: row.id,
    documentVersionId: row.documentVersionId,
    productId: row.productId,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    withdrawnAt: row.withdrawnAt === null ? null : fromColumnInstant(row.withdrawnAt),
  };
}

/** The periods of the versions, in the order of the ids. A `DRAFT` has none. */
export async function listPeriodsOfVersions(executor: Executor, versionIds: readonly bigint[]): Promise<PeriodRow[]> {
  if (versionIds.length === 0) {
    return [];
  }
  const rows = await executor.orm.public.EifuApplicability.where((period) => period.documentVersionId.in([...versionIds]))
    .orderBy((period) => period.id.asc())
    .all();
  return rows.map(toPeriodRow);
}

/**
 * The live periods of the product that contain the date, at most `limit` rows
 * (IFU-60 rule 2, step 7). A period is half-open: `effective_from` is inside it
 * and `effective_to` is not (DEC-061). The read never sorts: no rule picks a
 * period by an order (IFU-60 rule 3), and the exclusion constraint of the table
 * allows one live period for a date, so a second row is an ambiguity.
 */
export async function listLivePeriodsContaining(
  executor: Executor,
  productId: bigint,
  date: string,
  limit: number,
): Promise<PeriodRow[]> {
  const rows = await executor.orm.public.EifuApplicability.where((period) =>
    and(
      period.productId.eq(productId),
      period.withdrawnAt.isNull(),
      period.effectiveFrom.lte(date),
      or(period.effectiveTo.isNull(), period.effectiveTo.gt(date)),
    ),
  )
    .limit(limit)
    .all();
  return rows.map(toPeriodRow);
}

/**
 * The live periods of the product: those that no withdrawal marked (IFU-30 rule 3,
 * step 4). The rows are locked until the end of the transaction, in the order of
 * the ids, so that two publications for one product run one after the other and
 * never wait for each other in a circle. A lock needs a transaction.
 */
export async function lockLivePeriodsOfProduct(executor: Executor, productId: bigint): Promise<PeriodRow[]> {
  const rows = await executor.orm.public.EifuApplicability.where((period) =>
    and(period.productId.eq(productId), period.withdrawnAt.isNull()),
  )
    .orderBy((period) => period.id.asc())
    .forUpdate()
    .all();
  return rows.map(toPeriodRow);
}

/** Inserts the open period of a published version (IFU-30 rule 3, step 5). */
export async function insertOpenPeriod(executor: Executor, period: NewPeriod): Promise<PeriodRow> {
  const row = await executor.orm.public.EifuApplicability.create({
    documentVersionId: period.documentVersionId,
    productId: period.productId,
    effectiveFrom: period.effectiveFrom,
    effectiveTo: null,
    withdrawnAt: null,
    createdAt: toColumnInstant(period.now),
  });
  return toPeriodRow(row);
}

/** Writes the end of a period: a date closes it, and `null` opens it again (IFU-30 rule 3, IFU-31.AC2). */
export async function setPeriodEnd(executor: Executor, id: bigint, effectiveTo: string | null): Promise<void> {
  await executor.orm.public.EifuApplicability.where({ id }).update({ effectiveTo });
}

/** Marks the period of a withdrawn version. The row stays (IFU-31.AC1, DEC-010). */
export async function markPeriodWithdrawn(executor: Executor, id: bigint, now: Date): Promise<void> {
  await executor.orm.public.EifuApplicability.where({ id }).update({ withdrawnAt: toColumnInstant(now) });
}
