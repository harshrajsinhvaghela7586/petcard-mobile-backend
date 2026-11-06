import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { config } from "../config/env.js";
import { log, maskEmail, serializeError } from "../utils/logger.js";
import { otpEmail } from "./emailTemplates.js";

/*
 * One shared pooled transporter (the old code created a new connection per OTP).
 * Delivery is fire-and-forget with bounded retries, so API responses never wait
 * on SMTP. Authorization never depends on delivery: the OTP lives in the database.
 */

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  transporter = config.smtp.dryRun
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: { user: config.smtp.user, pass: config.smtp.pass },
        pool: true,
        maxConnections: 3,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });

  return transporter;
}

/** Local/dev workflow: set MAIL_DRY_RUN=true (default when SMTP_HOST is unset outside production). */
export const outbox = [];
const OUTBOX_LIMIT = 50;

const TRANSIENT_CODES = new Set([
  "ETIMEDOUT",
  "ECONNECTION",
  "ECONNRESET",
  "ESOCKET",
  "EAI_AGAIN",
  "EDNS",
]);

const isTransient = (error) =>
  TRANSIENT_CODES.has(error?.code) ||
  (typeof error?.responseCode === "number" &&
    error.responseCode >= 400 &&
    error.responseCode < 500);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function deliver(message, { attempts = 3 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await getTransporter().sendMail({ from: config.smtp.from, ...message });
      return { ok: true, attempt };
    } catch (error) {
      if (attempt === attempts || !isTransient(error)) {
        return { ok: false, attempt, error };
      }
      await sleep(500 * 4 ** (attempt - 1));
    }
  }
  return { ok: false, attempt: attempts };
}

const inFlight = new Set();

/**
 * Queue a message without blocking the caller.
 * `dedupeKey` drops exact duplicate jobs that are still in flight.
 */
export function queueMail(message, { dedupeKey } = {}) {
  const key = dedupeKey ? crypto.createHash("sha256").update(dedupeKey).digest("hex") : null;
  if (key && inFlight.has(key)) return;
  if (key) inFlight.add(key);

  if (config.smtp.dryRun) {
    outbox.push({ to: message.to, subject: message.subject, text: message.text, at: new Date() });
    if (outbox.length > OUTBOX_LIMIT) outbox.shift();
    if (!config.isProd && !config.isTest) {
      // Local development only: lets you read the code without an SMTP server.
      process.stdout.write(`[mail dry-run] to=${message.to}\n${message.text}\n`);
    }
  }

  deliver(message)
    .then((result) => {
      if (result.ok) {
        log.info("mail.sent", { to: maskEmail(message.to), attempt: result.attempt, dryRun: config.smtp.dryRun });
      } else {
        log.error("mail.failed", {
          to: maskEmail(message.to),
          attempt: result.attempt,
          error: serializeError(result.error),
        });
      }
    })
    .finally(() => {
      if (key) inFlight.delete(key);
    });
}

/** purpose: "verify" | "reset" */
export function sendOtpMail({ to, otp, purpose }) {
  const { subject, text, html } = otpEmail({
    otp,
    purpose,
    minutes: config.otp.minutes,
  });

  queueMail({ to, subject, text, html }, { dedupeKey: `otp|${to}|${purpose}|${otp}` });
}

/** Called once at boot in production so SMTP problems show up in the logs early. */
export function verifyMailTransport() {
  if (config.smtp.dryRun) {
    log.warn("mail.dry_run_enabled", { note: "No real emails will be sent." });
    return;
  }
  getTransporter()
    .verify()
    .then(() => log.info("mail.transport_ready"))
    .catch((error) => log.error("mail.transport_unavailable", { error: serializeError(error) }));
}
