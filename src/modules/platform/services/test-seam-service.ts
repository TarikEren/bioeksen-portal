/**
 * The test seams of the platform (FND-03 rule 4, `sds-testing`, **Test seams**):
 * the fake mail transport, the clock and the file store, for the test phase.
 * Each function refuses with 404 `RES-4200` unless `TEST_SEAMS_ENABLED` is
 * `true` and `APP_ENV` is `development` or `test`. The route wrapper checks the
 * same rule first (`testSeam: true`). A seam that is reachable in production is
 * a Critical hole, so the rule is checked a second time here, with the data.
 */
import "server-only";

import { setClockForTest } from "@/lib/clock";
import { isTestSeamEnabled } from "@/lib/config";
import { AppError } from "@/lib/errors";
import type { MailMode } from "@/lib/schemas/platform";

import { type CapturedMail, listCapturedMail, writeMailMode } from "../repositories/test-mail-repository";
import { type DocumentFileIds, type StoredDocumentFile, signedDownloadUrl, storeDocumentFile } from "./file-service";

/** @throws AppError `RES-4200` when the test seams are closed. */
function requireOpenSeams(): void {
  if (!isTestSeamEnabled()) {
    throw new AppError("RES-4200", "Resource does not exist", { reason: "the test seams are closed" });
  }
}

/** The messages that the fake transport kept for a recipient, newest first. */
export async function readTestMail(to: string): Promise<CapturedMail[]> {
  requireOpenSeams();
  return listCapturedMail(to);
}

/** Sets what the fake transport does with the next messages. */
export async function setTestMailMode(mode: MailMode): Promise<void> {
  requireOpenSeams();
  await writeMailMode(mode);
}

/** Moves the clock of the app to an instant, or back to the system time with `null`. Returns the time now. */
export function moveTestClock(target: Date | null): Date {
  requireOpenSeams();
  return setClockForTest(target);
}

export interface TestFile {
  readonly file: StoredDocumentFile;
  readonly downloadUrl: string;
}

/** Stores a file and signs its download URL (PLT-10). */
export async function storeTestFile(ids: DocumentFileIds, bytes: Uint8Array): Promise<TestFile> {
  requireOpenSeams();
  const file = await storeDocumentFile(ids, bytes);
  return { file, downloadUrl: await signedDownloadUrl(file.key) };
}

/** Signs the download URL of a stored file (PLT-10). */
export async function signTestFile(key: string): Promise<string> {
  requireOpenSeams();
  return signedDownloadUrl(key);
}
