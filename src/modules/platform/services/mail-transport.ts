/**
 * The mail transport (PLT-20, DEC-033): one SMTP relay with STARTTLS, or TLS on
 * port 465.
 *
 * The app sends nothing to a relay that offers no STARTTLS on a port other than
 * 465 (PLT-20.AC3): `requireTLS` makes the client refuse to send in clear text,
 * and the certificate of the relay is always checked. A relay with a private
 * certificate authority works through `NODE_EXTRA_CA_CERTS` of the process, so
 * no setting of the app switches a check off (the demo relay of the B1
 * contract).
 *
 * A failure is an `AppError` with a fixed reason. It never holds the recipient
 * or the text that the relay answered, because the text can name the recipient.
 *
 * With the test seams open (FND-03 rule 4) the transport is a fake that keeps the
 * messages in Redis and fails as its mode says (`/api/test/mail`).
 */
import "server-only";

import { type Transporter, createTransport } from "nodemailer";

import { getConfig, isTestSeamEnabled } from "@/lib/config";
import { now } from "@/lib/clock";
import { AppError } from "@/lib/errors";

import { appendCapturedMail, readMailMode } from "../repositories/test-mail-repository";

/** The message that the transport sends: plain text, no image, no tracking link (PLT-20 rule 5). */
export interface OutgoingMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface MailTransport {
  /** @throws AppError `UP-5000` (the relay refused, or offers no STARTTLS), `UP-5500` (no relay), `UP-5501` (late relay). */
  send(mail: OutgoingMail): Promise<void>;
}

/** TLS from the first byte, instead of STARTTLS. */
const IMPLICIT_TLS_PORT = 465;

const CONNECTION_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 20_000;

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (transporter === undefined) {
    const config = getConfig();
    const implicitTls = config.SMTP_PORT === IMPLICIT_TLS_PORT;
    transporter = createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: implicitTls,
      // On any other port, a relay without STARTTLS gets no message (PLT-20.AC3).
      requireTLS: !implicitTls,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: CONNECTION_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
      tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    });
  }
  return transporter;
}

const UNAVAILABLE_ERROR_CODES: ReadonlySet<string> = new Set([
  "ECONNECTION",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ESOCKET",
  "EDNS",
]);

const TIMEOUT_ERROR_CODES: ReadonlySet<string> = new Set(["ETIMEDOUT", "ESOCKETTIMEDOUT"]);

/** Maps an error of the client to the code of the registry, with a fixed reason. */
export function toMailFailure(error: unknown): AppError {
  const code = typeof error === "object" && error !== null ? Reflect.get(error, "code") : undefined;
  const text = error instanceof Error ? error.message : "";
  if (code === "ETLS" || /certificate|self.signed|handshake|TLS|SSL/i.test(text)) {
    // The relay offers no STARTTLS, or its certificate is not one that the app trusts (PLT-20.AC3).
    return new AppError("UP-5000", "Upstream response unusable", {
      reason: "the mail relay offers no STARTTLS or its certificate is refused",
    });
  }
  if (typeof code === "string" && TIMEOUT_ERROR_CODES.has(code)) {
    return new AppError("UP-5501", "Upstream timed out", { reason: "the mail relay did not answer in time" });
  }
  if (typeof code === "string" && UNAVAILABLE_ERROR_CODES.has(code)) {
    return new AppError("UP-5500", "Upstream unavailable", { reason: "the mail relay is not reachable" });
  }
  return new AppError("UP-5000", "Upstream response unusable", { reason: "the mail relay refused the message" });
}

const smtpTransport: MailTransport = {
  async send(mail) {
    try {
      await getTransporter().sendMail({
        from: getConfig().MAIL_FROM,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
      });
    } catch (error) {
      throw toMailFailure(error);
    }
  },
};

/**
 * The fake transport of the test seams (FND-03 rule 4). It keeps the message in
 * Redis, where `GET /api/test/mail` reads it, or fails as the mode says: `refuse`
 * as a relay that refuses the message (`UP-5000`), `down` as a relay that is not
 * there (`UP-5500`), `timeout` as a relay that answers late (`UP-5501`).
 */
const fakeTransport: MailTransport = {
  async send(mail) {
    const mode = await readMailMode();
    switch (mode) {
      case "ok":
        await appendCapturedMail({ ...mail, sentAt: now().toISOString() });
        return;
      case "refuse":
        throw new AppError("UP-5000", "Upstream response unusable", { reason: "the mail relay refused the message" });
      case "down":
        throw new AppError("UP-5500", "Upstream unavailable", { reason: "the mail relay is not reachable" });
      case "timeout":
        throw new AppError("UP-5501", "Upstream timed out", { reason: "the mail relay did not answer in time" });
    }
  },
};

/** The transport of the process: the fake when the test seams are on, the SMTP relay otherwise. */
export function getMailTransport(): MailTransport {
  return isTestSeamEnabled() ? fakeTransport : smtpTransport;
}
