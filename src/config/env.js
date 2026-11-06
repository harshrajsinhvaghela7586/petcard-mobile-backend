import "dotenv/config";
import crypto from "node:crypto";

/*
 * Single source of truth for configuration.
 * Everything is validated once at startup; the app refuses to boot
 * with an unsafe production configuration.
 */

const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";
const isTest = NODE_ENV === "test";

const warnings = [];

const WEAK_SECRETS = new Set([
  "secret",
  "changeme",
  "password",
  "jwtsecret",
  "mysecret",
  "your-secret",
  "your_jwt_secret",
  "jwt@secretkey#123",
]);

function readString(name, { required = false } = {}) {
  const value = String(process.env[name] ?? "").trim();
  if (required && !value) throw new Error(`${name} is required.`);
  return value;
}

function readInt(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return n;
}

function readBool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = String(raw).trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be "true" or "false".`);
}

/* ---------- Secrets ---------- */

const jwtSecret = readString("JWT_SECRET", { required: true });
if (jwtSecret.length < 32 || WEAK_SECRETS.has(jwtSecret.toLowerCase())) {
  const message =
    "JWT_SECRET is weak. Use at least 32 random characters, e.g. " +
    "node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"";
  if (isProd) throw new Error(message);
  warnings.push(message);
}

/* One master secret, separate derived keys per purpose, so an admin
 * cookie can never be replayed as a mobile token (and vice versa). */
const deriveKey = (purpose) =>
  Buffer.from(
    crypto.hkdfSync("sha256", jwtSecret, "petcard-salt-v1", `petcard:${purpose}`, 32)
  );

/* ---------- Web / CORS / cookies ---------- */

const adminOrigins = readString("ADMIN_ORIGIN") || "http://localhost:3000";
const allowedOrigins = adminOrigins
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

for (const origin of allowedOrigins) {
  if (!/^https?:\/\/[^\s/]+$/.test(origin)) {
    throw new Error(`ADMIN_ORIGIN contains an invalid origin: ${origin}`);
  }
}
if (isProd && allowedOrigins.some((o) => /localhost|127\.0\.0\.1/.test(o))) {
  warnings.push("ADMIN_ORIGIN still points to localhost in production.");
}

const cookieSecure = readBool("COOKIE_SECURE", isProd);
const cookieSameSite = (readString("COOKIE_SAMESITE") || "lax").toLowerCase();
if (!["lax", "strict", "none"].includes(cookieSameSite)) {
  throw new Error('COOKIE_SAMESITE must be "lax", "strict" or "none".');
}
if (cookieSameSite === "none" && !cookieSecure) {
  throw new Error('COOKIE_SAMESITE="none" requires COOKIE_SECURE=true.');
}
if (isProd && !cookieSecure) {
  warnings.push("COOKIE_SECURE is false in production. Admin cookies must be Secure over HTTPS.");
}

/* ---------- OTP / tokens ---------- */

for (const legacy of ["MOBILE_OTP_MINUTES", "JWT_EXPIRES_IN"]) {
  if (process.env[legacy]) {
    warnings.push(
      `${legacy} is no longer used. OTP expiry is OTP_EXPIRES_MINUTES; access tokens use ACCESS_TOKEN_MINUTES and REFRESH_TOKEN_DAYS.`
    );
  }
}

const otpMinutes = readInt("OTP_EXPIRES_MINUTES", 2, 1, 30);
const accessMinutes = readInt("ACCESS_TOKEN_MINUTES", 15, 5, 120);
const refreshDays = readInt("REFRESH_TOKEN_DAYS", 30, 1, 90);
const adminSessionDays = readInt("ADMIN_SESSION_DAYS", 7, 1, 30);

/* ---------- Mail ---------- */

const smtpHost = readString("SMTP_HOST");
const smtpUser = readString("SMTP_USER");
const smtpPass = String(process.env.SMTP_PASS ?? "");
const smtpPort = readInt("SMTP_PORT", 465, 1, 65535);
const smtpSecure = readBool("SMTP_SECURE", smtpPort === 465);

const dryRun = readBool("MAIL_DRY_RUN", isTest || (!isProd && !smtpHost));
if (!dryRun && (!smtpHost || !smtpUser || !smtpPass)) {
  throw new Error("SMTP_HOST, SMTP_USER and SMTP_PASS are required unless MAIL_DRY_RUN=true.");
}

const FROM_OK = /^(?:[^<>@\r\n"]{1,80}<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>|[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)$/;
function normalizeFrom(raw) {
  const value = raw.trim();
  if (!value) return smtpUser;
  if (FROM_OK.test(value)) return value;
  const m = /^(.{1,80}?)\s+([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/.exec(value);
  if (m && !/[\r\n]/.test(value)) {
    warnings.push('MAIL_FROM was missing angle brackets and was auto-corrected. Use: PetCard <you@example.com>');
    return `${m[1].trim()} <${m[2]}>`;
  }
  warnings.push("MAIL_FROM is invalid; falling back to SMTP_USER.");
  return smtpUser;
}
const mailFrom = normalizeFrom(readString("MAIL_FROM") || readString("SMTP_FROM"));
const supportEmail = readString("SUPPORT_EMAIL") || smtpUser;

/* ---------- Cloudinary (image uploads) ---------- */

const cloudName = readString("CLOUD_NAME");
const cloudKey = readString("CLOUD_KEY");
const cloudSecret = readString("CLOUD_SECRET");
const cloudinaryEnabled = Boolean(cloudName && cloudKey && cloudSecret);
if (!cloudinaryEnabled) {
  warnings.push("CLOUD_NAME / CLOUD_KEY / CLOUD_SECRET not fully set: photo uploads are disabled.");
}

/* ---------- Push / invites / app ---------- */

const pushEnabled = readBool("PUSH_ENABLED", !isTest);
const inviteMinutes = readInt("GUARDIAN_INVITE_MINUTES", 24 * 60, 5, 7 * 24 * 60);
const appScheme = readString("APP_SCHEME") || "petcard";
if (!/^[a-z][a-z0-9+.-]{1,30}$/.test(appScheme)) {
  throw new Error("APP_SCHEME must be a valid URL scheme such as petcard.");
}

/* ---------- AI assistant (Gemini) + background jobs ---------- */

const geminiKey = readString("GEMINI_API_KEY");
const geminiModel = readString("GEMINI_MODEL") || "gemini-2.5-flash";
if (!/^[A-Za-z0-9._-]{3,60}$/.test(geminiModel)) throw new Error("GEMINI_MODEL is invalid.");
if (!geminiKey) warnings.push("GEMINI_API_KEY is not set: the pet assistant is disabled.");
const jobsEnabled = readBool("JOBS_ENABLED", !isTest);
const publicBaseUrl = (readString("PUBLIC_BASE_URL") || "").replace(/\/+$/, "");
const googleOAuthClientIds = readString("GOOGLE_OAUTH_CLIENT_IDS").split(",").map((v) => v.trim()).filter(Boolean);
if (publicBaseUrl && !/^https?:\/\//.test(publicBaseUrl)) throw new Error("PUBLIC_BASE_URL must start with http:// or https://");

/* ---------- Database ---------- */

const mongoUri = readString("MONGODB_URI", { required: true });

export const config = Object.freeze({
  nodeEnv: NODE_ENV,
  isProd,
  isTest,
  port: readInt("PORT", 5000, 1, 65535),
  mongoUri,
  allowedOrigins,
  cookie: Object.freeze({ secure: cookieSecure, sameSite: cookieSameSite }),
  otp: Object.freeze({ minutes: otpMinutes, maxAttempts: 5, resendCooldownSeconds: 30 }),
  jwt: Object.freeze({
    issuer: "petcard-api",
    accessSeconds: accessMinutes * 60,
    refreshDays,
    adminSessionDays,
  }),
  keys: Object.freeze({
    mobileJwt: deriveKey("mobile-jwt"),
    adminJwt: deriveKey("admin-jwt"),
    otp: deriveKey("otp-hmac"),
  }),
  cloudinary: Object.freeze({
    enabled: cloudinaryEnabled,
    cloudName,
    apiKey: cloudKey,
    apiSecret: cloudSecret,
    uploadPreset: readString("CLOUDINARY_UPLOAD_PRESET"),
    rootFolder: `petcard/${NODE_ENV}`,
  }),
  push: Object.freeze({ enabled: pushEnabled }),
  gemini: Object.freeze({ enabled: Boolean(geminiKey), apiKey: geminiKey, model: geminiModel, timeoutMs: readInt("GEMINI_TIMEOUT_MS", 20000, 3000, 60000) }),
  jobs: Object.freeze({ enabled: jobsEnabled }),
  publicBaseUrl,
  googleOAuthClientIds: Object.freeze(googleOAuthClientIds),
  guardian: Object.freeze({ inviteMinutes, appScheme }),
  smtp: Object.freeze({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    user: smtpUser,
    pass: smtpPass,
    from: mailFrom,
    supportEmail,
    dryRun,
  }),
});

export const configWarnings = Object.freeze([...warnings]);
