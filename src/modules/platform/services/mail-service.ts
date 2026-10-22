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
 *
 * The code mail of the public lookup (`sendCodeMail`) is the one message that
 * the caller waits for: the visitor's answer carries the code of its failure
 * (IFU-50 rule 4, DEC-097). It has no link, and one body in Turkish and English
 * (PLT-20 rule 2, IFU-50.AC2).
 */
import "server-only";

import { getConfig } from "@/lib/config";
import type { Transaction } from "@/lib/transaction";
import { AppError, CODE_MEANINGS, type ErrorCode } from "@/lib/errors";
import type { Language } from "@/lib/i18n/languages";
import { logger } from "@/lib/logging";

import { type OutgoingMail, getMailTransport } from "./mail-transport";

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

/** The code of a failed send. A refusal or an unusable answer is `UP-5000`, a relay that is not there `UP-5500`, a late relay `UP-5501`. */
function codeOfFailure(error: unknown): ErrorCode {
  return error instanceof AppError && (error.code === "UP-5500" || error.code === "UP-5501") ? error.code : "UP-5000";
}

/**
 * Sends one message now. It never throws: a failed send is logged with its
 * `UP-` code and without the email address of the recipient, and the business
 * change stays (PLT-20.AC2, AC3). The log record holds the template and a fixed
 * reason, never the recipient and never the text of the relay, which can name it.
 *
 * @returns Whether the relay took the message.
 */
export async function deliverMail(template: MailTemplate, mail: OutgoingMail): Promise<boolean> {
  try {
    await getMailTransport().send(mail);
    return true;
  } catch (error) {
    logger.failure(codeOfFailure(error), {
      tail: {
        template,
        reason: error instanceof AppError && error.reason !== null ? error.reason : "the relay did not take the message",
      },
    });
    return false;
  }
}

/**
 * Puts a message in the transaction. It goes out after the commit, and a
 * rollback drops it (DEC-033).
 *
 * @param tx The transaction of the change.
 * @param options `detached`: the caller does not wait for the send, so the time of
 * its answer says nothing about the mail (ACC-11.AC1).
 */
export function queueMail(tx: Transaction, message: MailMessage, options: { readonly detached?: boolean } = {}): Promise<void> {
  const rendered = renderMail(message, getConfig().PUBLIC_BASE_URL);
  const mail: OutgoingMail = { to: message.to, subject: rendered.subject, text: rendered.text };
  tx.afterCommit(
    async () => {
      await deliverMail(message.template, mail);
    },
    { detached: options.detached === true },
  );
  return Promise.resolve();
}

/** What the code mail holds (IFU-50.AC2): the code, and the catalog number and the LOT number of the request. */
export interface CodeMailMessage {
  readonly to: string;
  /** The six-digit verification code. It goes into the body and nowhere else. */
  readonly code: string;
  readonly catalogNumber: string;
  readonly lotNumber: string;
}

/**
 * A number as the mail shows it: on one line, with no control character, so a
 * visitor cannot add lines of their own to a message that goes to another
 * person (PLT-20 rule 5).
 */
function oneLine(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 || code === 0x2028 || code === 0x2029 ? " " : character;
  }).join("");
}

/**
 * Renders the code mail: Turkish, then English, in one body, with no link
 * (PLT-20 rule 2, IFU-50.AC2).
 */
export function renderCodeMail(message: CodeMailMessage): RenderedMail {
  const catalogNumber = oneLine(message.catalogNumber);
  const lotNumber = oneLine(message.lotNumber);
  return {
    subject: "Bioeksen Portal doğrulama kodu / verification code",
    text: [
      "Merhaba,",
      "",
      "Bioeksen Portal'da kullanım talimatı (IFU) sorgusu için doğrulama kodunuz:",
      "",
      message.code,
      "",
      `Katalog numarası: ${catalogNumber}`,
      `LOT numarası: ${lotNumber}`,
      "",
      "Kod 10 dakika geçerlidir ve yalnızca bir kez çalışır. Bu isteği siz yapmadıysanız bu iletiyi yok sayın.",
      "",
      "----",
      "",
      "Hello,",
      "",
      "Your verification code for the Bioeksen Portal instructions for use (IFU) lookup is:",
      "",
      message.code,
      "",
      `Catalog number: ${catalogNumber}`,
      `LOT number: ${lotNumber}`,
      "",
      "The code is valid for 10 minutes and works only once. If you did not ask for it, ignore this message.",
    ].join("\n"),
  };
}

/**
 * Sends the code mail now and waits for the relay (IFU-50 rule 4, DEC-097). The
 * caller runs it after the commit of the verification.
 *
 * A failure is logged with its `UP-` code, the template and a fixed reason, and
 * never the recipient, the code or the text of the relay (PLT-20 rule 4,
 * FND-05 rule 5). The error goes to the caller, so the answer carries the same
 * code.
 *
 * @throws AppError `UP-5500` (no relay), `UP-5501` (late relay), `UP-5000` (the relay refused the message).
 */
export async function sendCodeMail(message: CodeMailMessage): Promise<void> {
  const rendered = renderCodeMail(message);
  try {
    await getMailTransport().send({ to: message.to, subject: rendered.subject, text: rendered.text });
  } catch (error) {
    const code = codeOfFailure(error);
    const reason = error instanceof AppError && error.reason !== null ? error.reason : "the relay did not take the message";
    logger.failure(code, { tail: { template: "verificationCode", reason } });
    throw new AppError(code, CODE_MEANINGS[code], { reason });
  }
}
