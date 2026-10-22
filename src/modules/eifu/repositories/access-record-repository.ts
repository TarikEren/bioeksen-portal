/**
 * The table `eifu_access_record` (IFU-80). It holds queries and nothing else. It
 * never decides who may do what, and it never deletes a row: the triggers of the
 * table refuse DELETE and TRUNCATE (DEC-010).
 *
 * The email address and the client address are cipher text with the id of their
 * key (IFU-90). This file never reads or makes a cipher text. The ids of the
 * resolved product and version are plain numbers with no foreign key (IFU-80
 * rule 2).
 */
import "server-only";

import { and } from "@prisma/orm-postgres/orm-client";

import { type Executor, toColumnInstant } from "@/lib/db";
import type { Outcome } from "@/lib/schemas/lookup";

export interface NewAccessRecord {
  /** The inputs as the visitor typed them (IFU-80 rule 2). */
  readonly catalogNumberInput: string;
  readonly lotNumberInput: string;
  readonly resolvedProductId: bigint | null;
  readonly resolvedDocumentVersionId: bigint | null;
  readonly outcome: Outcome;
  readonly resolvedViaOverride: boolean;
  readonly acknowledgedNoticeVersion: string;
  readonly email: Uint8Array;
  readonly clientAddress: Uint8Array;
  readonly emailLookupHash: string;
  readonly identityKeyId: string;
  readonly userAgent: string | null;
  readonly requestId: string | null;
  readonly now: Date;
}

/** An access record as the key move reads it. It holds the identity of a record that is not anonymized. */
export interface AccessRecordIdentity {
  readonly id: bigint;
  readonly email: Uint8Array;
  readonly clientAddress: Uint8Array;
  readonly identityKeyId: string;
}

/** Inserts the access record of a lookup. `email_verified` is true: a lookup runs only after a correct code (IFU-80 rule 2). */
export async function insertAccessRecord(executor: Executor, record: NewAccessRecord): Promise<void> {
  await executor.orm.public.EifuAccessRecord.create({
    catalogNumberInput: record.catalogNumberInput,
    lotNumberInput: record.lotNumberInput,
    resolvedProductId: record.resolvedProductId,
    resolvedDocumentVersionId: record.resolvedDocumentVersionId,
    outcome: record.outcome,
    resolvedViaOverride: record.resolvedViaOverride,
    acknowledgedNoticeVersion: record.acknowledgedNoticeVersion,
    emailVerified: true,
    email: record.email,
    clientAddress: record.clientAddress,
    emailLookupHash: record.emailLookupHash,
    identityKeyId: record.identityKeyId,
    userAgent: record.userAgent,
    requestId: record.requestId,
    createdAt: toColumnInstant(record.now),
    anonymizedAt: null,
  });
}

/**
 * At most `limit` records that keep an identity under another key than `keyId`,
 * locked for the move (IFU-90 rule 6). An anonymized record has no identity, so
 * it is not read. A lock needs a transaction.
 */
export async function lockAccessRecordsWithOtherKey(executor: Executor, keyId: string, limit: number): Promise<AccessRecordIdentity[]> {
  const rows = await executor.orm.public.EifuAccessRecord.where((record) =>
    and(record.anonymizedAt.isNull(), record.identityKeyId.isNotNull(), record.identityKeyId.neq(keyId)),
  )
    .orderBy((record) => record.id.asc())
    .limit(limit)
    .forUpdate()
    .all();
  return rows.flatMap((row) =>
    row.email === null || row.clientAddress === null || row.identityKeyId === null
      ? []
      : [{ id: row.id, email: row.email, clientAddress: row.clientAddress, identityKeyId: row.identityKeyId }],
  );
}

/** Writes the two cipher texts and the key id that names them. It changes no other column (IFU-90 rule 6). */
export async function writeAccessRecordIdentity(
  executor: Executor,
  id: bigint,
  identity: { readonly email: Uint8Array; readonly clientAddress: Uint8Array; readonly identityKeyId: string },
): Promise<void> {
  await executor.orm.public.EifuAccessRecord.where({ id }).update({
    email: identity.email,
    clientAddress: identity.clientAddress,
    identityKeyId: identity.identityKeyId,
  });
}
