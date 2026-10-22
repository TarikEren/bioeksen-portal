/**
 * The schemas of the platform seams (FND-03 rule 4). This file is pure.
 */
import { z } from "zod";

/** What the fake mail transport does with the next message: `ok` keeps it; the others fail as a relay fails. */
export const MAIL_MODES = ["ok", "refuse", "down", "timeout"] as const;
export const MailMode = z.enum(MAIL_MODES);
export type MailMode = z.infer<typeof MailMode>;
