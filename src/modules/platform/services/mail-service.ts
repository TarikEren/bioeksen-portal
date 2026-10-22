/**
 * Mail (PLT-20, DEC-033).
 *
 * `queueMail` takes the message in the transaction of the change, and the
 * message goes out after the transaction commits, never inside it. A failed
 * send never undoes the business change, and its log record carries a `UP-`
 * code and no email address of the recipient (PLT-20 rule 4).
 *
 * The invitation and the reset use the preferred language of the user. A link
 * starts with `PUBLIC_BASE_URL`, never with the host of the request (PLT-20
 * rule 3), and holds the token in the URL fragment (DEC-138). A message holds
 * no image and no tracking link (PLT-20 rule 5).
 */
import "server-only";

import { getConfig } from "@/lib/config";
import type { Language } from "@/lib/i18n/languages";
import { identityMock } from "@/lib/mock/identity";
import type { MockTransaction } from "@/lib/mock/transaction";

export type MailTemplate = "invitation" | "passwordReset";

export interface MailMessage {
  readonly template: MailTemplate;
  readonly to: string;
  readonly language: Language;
  /** The token in clear text. It goes into the link and nowhere else. */
  readonly token: string;
}

export interface RenderedMail {
  readonly subject: string;
  readonly text: string;
}

const LINK_PATHS: Readonly<Record<MailTemplate, string>> = {
  invitation: "/invitation",
  passwordReset: "/password-reset/complete",
};

const TEXTS: Readonly<Record<MailTemplate, Readonly<Record<Language, (link: string) => RenderedMail>>>> = {
  invitation: {
    tr: (link) => ({
      subject: "Bioeksen Portal hesabınız hazır",
      text: `Merhaba,\n\nBioeksen Portal için bir hesap açıldı. Şifrenizi belirlemek için bağlantıyı 14 gün içinde açın:\n\n${link}\n\nBu bağlantı yalnızca bir kez çalışır.`,
    }),
    en: (link) => ({
      subject: "Your Bioeksen Portal account is ready",
      text: `Hello,\n\nAn account was created for you on Bioeksen Portal. Open the link within 14 days to set your password:\n\n${link}\n\nThe link works only once.`,
    }),
  },
  passwordReset: {
    tr: (link) => ({
      subject: "Bioeksen Portal şifre sıfırlama",
      text: `Merhaba,\n\nŞifrenizi sıfırlamak için bağlantıyı 1 saat içinde açın:\n\n${link}\n\nBu bağlantı yalnızca bir kez çalışır. Bu isteği siz yapmadıysanız bu iletiyi yok sayın.`,
    }),
    en: (link) => ({
      subject: "Bioeksen Portal password reset",
      text: `Hello,\n\nOpen the link within 1 hour to reset your password:\n\n${link}\n\nThe link works only once. If you did not ask for this, ignore this message.`,
    }),
  },
};

/** Renders a message in the language given. The link starts with `PUBLIC_BASE_URL` (PLT-20.AC1). */
export function renderMail(message: MailMessage, publicBaseUrl: string): RenderedMail {
  const base = new URL(publicBaseUrl).origin;
  const link = `${base}${LINK_PATHS[message.template]}#token=${message.token}`;
  return TEXTS[message.template][message.language](link);
}

/**
 * Puts a message in the transaction. It goes out after the commit.
 *
 * @param tx The transaction of the change.
 */
// MOCK: PLT-20
export function queueMail(tx: MockTransaction, message: MailMessage): Promise<void> {
  const rendered = renderMail(message, getConfig().PUBLIC_BASE_URL);
  tx.afterCommit(() => {
    identityMock().outbox.push({ to: message.to, subject: rendered.subject, text: rendered.text, sentAt: new Date() });
  });
  return Promise.resolve();
}
