/**
 * The table `eifu_verification` (IFU-50). It holds queries and nothing else. It
 * never decides who may do what.
 *
 * A verification is not a controlled record: the worker removes it 24 hours
 * after it ends (IFU-50 rule 6), so this file is the one that deletes rows of
 * the public lookup. The email address and the client address are cipher text
 * with the id of their key (IFU-90). This file never reads or makes a cipher
 * text: the service does, and gives the bytes.
 */
import "server-only";

import { and, or } from "@prisma/orm-postgres/orm-client";

import { type Executor, fromColumnInstant, toColumnInstant } from "@/lib/db";

/** One verification as the services read it. */
export interface VerificationRow {
  readonly id: bigint;
  readonly publicId: string;
  /** The inputs as the visitor typed them (IFU-50 rule 7). */
  readonly catalogNumberInput: string;
  readonly lotNumberInput: string;
  readonly noticeVersion: string;
  readonly email: Uint8Array;
  readonly emailLookupHash: string;
  readonly clientAddress: Uint8Array;
  readonly identityKeyId: string;
  readonly userAgent: string | null;
  readonly codeHash: string;
  readonly attemptsUsed: number;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly endedAt: Date | null;
  readonly sendFailedAt: Date | null;
}

export interface NewVerification {
  readonly publicId: string;
  readonly catalogNumberInput: string;
  readonly lotNumberInput: string;
  readonly noticeVersion: string;
  readonly email: Uint8Array;
  readonly emailLookupHash: string;
  readonly clientAddress: Uint8Array;
  readonly identityKeyId: string;
  readonly userAgent: string | null;
  readonly codeHash: string;
  readonly now: Date;
  readonly expiresAt: Date;
}

interface StoredVerification {
  readonly id: bigint;
  readonly publicId: string;
  readonly catalogNumberInput: string;
  readonly lotNumberInput: string;
  readonly noticeVersion: string;
  readonly email: Uint8Array;
  readonly emailLookupHash: string;
  readonly clientAddress: Uint8Array;
  readonly identityKeyId: string;
  readonly userAgent: string | null;
  readonly codeHash: string;
  readonly attemptsUsed: number;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly usedAt: string | null;
  readonly endedAt: string | null;
  readonly sendFailedAt: string | null;
}

const instantOrNull = (stored: string | null): Date | null => (stored === null ? null : fromColumnInstant(stored));

function toVerificationRow(row: StoredVerification): VerificationRow {
  return {
    id: row.id,
    publicId: row.publicId,
    catalogNumberInput: row.catalogNumberInput,
    lotNumberInput: row.lotNumberInput,
    noticeVersion: row.noticeVersion,
    email: row.email,
    emailLookupHash: row.emailLookupHash,
    clientAddress: row.clientAddress,
    identityKeyId: row.identityKeyId,
    userAgent: row.userAgent,
    codeHash: row.codeHash,
    attemptsUsed: row.attemptsUsed,
    createdAt: fromColumnInstant(row.createdAt),
    expiresAt: fromColumnInstant(row.expiresAt),
    usedAt: instantOrNull(row.usedAt),
    endedAt: instantOrNull(row.endedAt),
    sendFailedAt: instantOrNull(row.sendFailedAt),
  };
}

export async function insertVerification(executor: Executor, verification: NewVerification): Promise<VerificationRow> {
  const row = await executor.orm.public.EifuVerification.create({
    publicId: verification.publicId,
    catalogNumberInput: verification.catalogNumberInput,
    lotNumberInput: verification.lotNumberInput,
    noticeVersion: verification.noticeVersion,
    email: verification.email,
    emailLookupHash: verification.emailLookupHash,
    clientAddress: verification.clientAddress,
    identityKeyId: verification.identityKeyId,
    userAgent: verification.userAgent,
    codeHash: verification.codeHash,
    attemptsUsed: 0,
    createdAt: toColumnInstant(verification.now),
    expiresAt: toColumnInstant(verification.expiresAt),
    usedAt: null,
    endedAt: null,
    sendFailedAt: null,
  });
  return toVerificationRow(row);
}

/**
 * The verification with the public id, or `null`. `lock` reads the row `FOR
 * UPDATE`, so the count of wrong codes cannot lose a try (IFU-51.AC3). A lock
 * needs a transaction.
 */
export async function findVerificationByPublicId(executor: Executor, publicId: string, lock = false): Promise<VerificationRow | null> {
  const verifications = executor.orm.public.EifuVerification.where({ publicId });
  const row = await (lock ? verifications.forUpdate() : verifications).first();
  return row === null ? null : toVerificationRow(row);
}

/** Marks that the code mail failed. Nobody can use the verification after it, and it ends (IFU-50 rule 4, rule 6). */
export async function markVerificationSendFailed(executor: Executor, publicId: string, now: Date): Promise<void> {
  await executor.orm.public.EifuVerification.where({ publicId }).update({
    sendFailedAt: toColumnInstant(now),
    endedAt: toColumnInstant(now),
  });
}

/** Writes the count of tries after a wrong code. The fifth wrong code ends the verification (DEC-071). */
export async function writeAttempts(executor: Executor, publicId: string, attemptsUsed: number, endedAt: Date | null): Promise<void> {
  await executor.orm.public.EifuVerification.where({ publicId }).update({
    attemptsUsed,
    ...(endedAt === null ? {} : { endedAt: toColumnInstant(endedAt) }),
  });
}

/**
 * Marks the verification used with one conditional update (IFU-51.AC8). The
 * update changes the row only while it is unused, not ended, not failed, not
 * expired and under five tries, so of two lookups with the correct code exactly
 * one changes a row. The second one waits for the row lock of the first, reads
 * the new row, and changes nothing.
 *
 * @returns `true` when this call marked the row.
 */
export async function markVerificationUsed(executor: Executor, publicId: string, now: Date, maxAttempts: number): Promise<boolean> {
  const at = toColumnInstant(now);
  const changed = await executor.orm.public.EifuVerification.where((verification) =>
    and(
      verification.publicId.eq(publicId),
      verification.usedAt.isNull(),
      verification.endedAt.isNull(),
      verification.sendFailedAt.isNull(),
      verification.attemptsUsed.lt(maxAttempts),
      verification.expiresAt.gt(at),
    ),
  ).updateAndCount({ usedAt: at, endedAt: at });
  return changed === 1;
}

/**
 * Removes the verifications that ended before the cutoff, and the ones that
 * expired before it without another end (IFU-50 rule 6, AC13).
 *
 * @returns The number of rows removed.
 */
export async function deleteVerificationsEndedBefore(executor: Executor, cutoff: Date): Promise<number> {
  const at = toColumnInstant(cutoff);
  return executor.orm.public.EifuVerification.where((verification) =>
    or(verification.endedAt.lt(at), and(verification.endedAt.isNull(), verification.expiresAt.lt(at))),
  ).deleteAndCount();
}

/** At most `limit` verifications that name another key than `keyId`, locked for the move (IFU-90 rule 6). A lock needs a transaction. */
export async function lockVerificationsWithOtherKey(executor: Executor, keyId: string, limit: number): Promise<VerificationRow[]> {
  const rows = await executor.orm.public.EifuVerification.where((verification) => verification.identityKeyId.neq(keyId))
    .orderBy((verification) => verification.id.asc())
    .limit(limit)
    .forUpdate()
    .all();
  return rows.map(toVerificationRow);
}

/** Writes the two cipher texts and the key id that names them (IFU-90 rule 6). */
export async function writeVerificationIdentity(
  executor: Executor,
  id: bigint,
  identity: { readonly email: Uint8Array; readonly clientAddress: Uint8Array; readonly identityKeyId: string },
): Promise<void> {
  await executor.orm.public.EifuVerification.where({ id }).update({
    email: identity.email,
    clientAddress: identity.clientAddress,
    identityKeyId: identity.identityKeyId,
  });
}
