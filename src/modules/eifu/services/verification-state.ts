/**
 * What the two steps of the public lookup share about a verification (IFU-50
 * rule 6, IFU-51): the form of its id, and the reason why nobody can use it.
 *
 * This file is pure.
 */
import { z } from "zod";

import type { VerificationRow } from "../repositories/verification-repository";

const UuidText = z.uuid();

/** The id of a verification, or `null` when the text is not a UUID. The column is a `uuid`, so a text that is not one never reaches it. */
export function verificationUuid(value: string): string | null {
  const parsed = UuidText.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * The fixed phrase for the log record when nobody can use the verification:
 * its mail failed, it is used, it ended (the fifth wrong code), or it expired
 * (IFU-51.AC2, AC4, AC5, AC7). `null` when the verification is usable.
 */
export function unusableReason(row: VerificationRow, at: Date): string | null {
  if (row.sendFailedAt !== null) {
    return "the code mail of the verification failed";
  }
  if (row.usedAt !== null) {
    return "the verification is used";
  }
  if (row.endedAt !== null) {
    return "the verification ended after the fifth wrong code";
  }
  if (row.expiresAt.getTime() <= at.getTime()) {
    return "the verification expired";
  }
  return null;
}
