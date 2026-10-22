/**
 * The two jobs of the public lookup in the worker (PLT-30 rule 2):
 *
 * - `removeEndedVerifications` removes the verifications that ended more than 24
 *   hours before (IFU-50 rule 6, AC13);
 * - `moveIdentitiesToNewestKey` moves at most 500 rows that name an older key to
 *   the first key of the ring (IFU-90 rule 6, AC2).
 *
 * A job returns the number of rows that it changed, and logs it as a `JOB`
 * record. The record holds the number and nothing of the rows: no email
 * address, no client address, no id (FND-05 rule 5). The pass of the worker logs
 * the start, the end and the failure of each job (`job-service.ts`), and one
 * failed job does not stop the other (PLT-30.AC2).
 */
import "server-only";

import { now } from "@/lib/clock";
import { logger } from "@/lib/logging";
import { runTransaction } from "@/lib/transaction";

import { decryptIdentity, encryptIdentity, newestKeyId } from "../domain/identity";
import {
  lockAccessRecordsWithOtherKey,
  writeAccessRecordIdentity,
} from "../repositories/access-record-repository";
import {
  deleteVerificationsEndedBefore,
  lockVerificationsWithOtherKey,
  writeVerificationIdentity,
} from "../repositories/verification-repository";

/** A verification is removed 24 hours after it ends (IFU-50 rule 6). */
const VERIFICATION_RETENTION_MS = 24 * 60 * 60 * 1000;

/** The most rows that one pass moves to the first key (IFU-90 rule 6). */
export const KEY_MOVE_LIMIT = 500;

/**
 * Removes the verifications that ended more than 24 hours before, and the ones
 * that expired more than 24 hours before without another end (IFU-50 rule 6).
 *
 * @returns The number of verifications removed.
 */
export async function removeEndedVerifications(): Promise<number> {
  const cutoff = new Date(now().getTime() - VERIFICATION_RETENTION_MS);
  const removed = await runTransaction((tx) => deleteVerificationsEndedBefore(tx, cutoff));
  logger.write({ severity: "INFO", type: "JOB", message: "ended verifications removed", tail: { removed } });
  return removed;
}

/** The cipher text of a value under the first key: decrypted with the key that its row names, and encrypted again. */
function moved(cipher: Uint8Array, keyId: string): ReturnType<typeof encryptIdentity> {
  return encryptIdentity(decryptIdentity(cipher, keyId));
}

/**
 * Moves at most `KEY_MOVE_LIMIT` rows that name an older key to the first key
 * (IFU-90 rule 6). The access records go first, then the verifications with the
 * places that remain. The rows are locked in one transaction, so a failed row
 * leaves every row as it was, and the job fails loudly: a row that names a key
 * that is not in the ring is a defect of the key ring (DEC-088).
 *
 * @returns The number of rows moved.
 * @throws AppError `CFG-5000` without a key ring; `CFG-5001` for a row that names a key that is not in the ring.
 */
export async function moveIdentitiesToNewestKey(): Promise<number> {
  const newest = newestKeyId();
  const count = await runTransaction(async (tx) => {
    const records = await lockAccessRecordsWithOtherKey(tx, newest, KEY_MOVE_LIMIT);
    for (const record of records) {
      const email = moved(record.email, record.identityKeyId);
      const clientAddress = moved(record.clientAddress, record.identityKeyId);
      await writeAccessRecordIdentity(tx, record.id, {
        email: email.cipher,
        clientAddress: clientAddress.cipher,
        identityKeyId: email.keyId,
      });
    }
    const places = KEY_MOVE_LIMIT - records.length;
    const verifications = places > 0 ? await lockVerificationsWithOtherKey(tx, newest, places) : [];
    for (const verification of verifications) {
      const email = moved(verification.email, verification.identityKeyId);
      const clientAddress = moved(verification.clientAddress, verification.identityKeyId);
      await writeVerificationIdentity(tx, verification.id, {
        email: email.cipher,
        clientAddress: clientAddress.cipher,
        identityKeyId: email.keyId,
      });
    }
    return { records: records.length, verifications: verifications.length };
  });
  logger.write({
    severity: "INFO",
    type: "JOB",
    message: "identity rows moved to the first key",
    // The key `verifications` would be redacted: the logger hides each key that names a verification.
    tail: { moved: count.records + count.verifications, access_records: count.records },
  });
  return count.records + count.verifications;
}
