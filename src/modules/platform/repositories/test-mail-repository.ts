/**
 * The fake mail transport of the test seams (FND-03 rule 4): the messages that
 * the app would send, and the mode of the fake, in Redis. Redis is shared by the
 * route handlers, the server actions and the pages, so the seam sees what the
 * app sent. Nothing here is reachable unless the seams are on
 * (`mail-transport.ts`, `test-seam-service.ts`).
 */
import "server-only";

import { z } from "zod";

import { withCache } from "@/lib/cache";
import { MailMode } from "@/lib/schemas/platform";

const MESSAGES_KEY = "test:mail:messages";
const MODE_KEY = "test:mail:mode";


export const CapturedMail = z.strictObject({
  to: z.string(),
  subject: z.string(),
  text: z.string(),
  sentAt: z.iso.datetime({ offset: true }),
});
export type CapturedMail = z.infer<typeof CapturedMail>;

/** The most messages that the fake keeps. The oldest ones go first. */
const MAX_MESSAGES = 500;

export async function appendCapturedMail(mail: CapturedMail): Promise<void> {
  await withCache(async (cache) => {
    await cache.multi().rPush(MESSAGES_KEY, JSON.stringify(mail)).lTrim(MESSAGES_KEY, -MAX_MESSAGES, -1).exec();
  });
}

/** The messages for one recipient, newest first. */
export async function listCapturedMail(to: string): Promise<CapturedMail[]> {
  const wanted = to.trim().toLowerCase();
  const stored = await withCache((cache) => cache.lRange(MESSAGES_KEY, 0, -1));
  const messages: CapturedMail[] = [];
  for (const entry of stored) {
    const parsed = CapturedMail.safeParse(JSON.parse(entry));
    if (parsed.success && parsed.data.to.toLowerCase() === wanted) {
      messages.push(parsed.data);
    }
  }
  return messages.reverse();
}

export async function readMailMode(): Promise<MailMode> {
  const stored = await withCache((cache) => cache.get(MODE_KEY));
  const parsed = MailMode.safeParse(stored);
  return parsed.success ? parsed.data : "ok";
}

export async function writeMailMode(mode: MailMode): Promise<void> {
  await withCache(async (cache) => {
    await cache.set(MODE_KEY, mode);
  });
}
