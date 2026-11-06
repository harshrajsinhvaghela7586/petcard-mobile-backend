/*
 * Input validation using anchored, bounded regular expressions.
 *
 * Rules that keep these regexes safe from ReDoS:
 *  - input length is capped BEFORE a regex runs
 *  - every quantifier is bounded or applies to a single character class
 *  - no nested unbounded quantifiers
 *
 * Every function returns a normalized value, or null / an error string when
 * the input is invalid. Non-string input (e.g. {"$gt": ""}) is always rejected,
 * which also blocks NoSQL operator injection.
 */

const EMAIL_MAX = 254;

const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?){1,8}$/;

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\p{N} '.’-]{0,99}$/u;
const PHONE_CHARS_RE = /^\+?[0-9 ()-]{7,25}$/;
const OTP_RE = /^\d{6}$/;
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;
const OPAQUE_TOKEN_RE = /^[A-Za-z0-9_-]{43,128}$/;
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

const COMMON_PASSWORDS = new Set([
  "password1",
  "password12",
  "password123",
  "password@123",
  "qwerty123",
  "iloveyou1",
  "admin123",
  "welcome1",
  "welcome123",
  "abc12345",
  "petcard123",
  "letmein123",
]);

export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 6 || email.length > EMAIL_MAX) return null;
  if (!EMAIL_RE.test(email)) return null;

  const local = email.slice(0, email.indexOf("@"));
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  if (/\.\d+$/.test(email)) return null; // numeric TLD

  return email;
}

export function normalizeName(value) {
  if (typeof value !== "string" || value.length > 400) return null;
  const name = value.normalize("NFC").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 100) return null;
  return NAME_RE.test(name) ? name : null;
}

/** Returns "" for empty (phone is optional), null for invalid, else "+919876543210". */
export function normalizePhone(value) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > 40) return null;

  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (!PHONE_CHARS_RE.test(trimmed)) return null;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;

  return (trimmed.startsWith("+") ? "+" : "") + digits;
}

/** Returns an error message, or null when the password is acceptable. */
export function checkPassword(value) {
  if (typeof value !== "string" || value.length === 0) return "Enter a password.";
  if (value.length < 8) return "Password must be at least 8 characters.";
  if (value.length > 64) return "Password must be at most 64 characters.";
  if (Buffer.byteLength(value, "utf8") > 72) {
    return "Password is too long. Use fewer special characters.";
  }
  if (CONTROL_CHARS_RE.test(value)) return "Password contains unsupported characters.";
  if (!/\p{L}/u.test(value) || !/\d/.test(value)) {
    return "Password must include at least one letter and one number.";
  }
  if (COMMON_PASSWORDS.has(value.toLowerCase())) {
    return "This password is too common. Choose a stronger one.";
  }
  return null;
}

/** Login only needs a sane bound; the strength rules apply when a password is set. */
export function isLoginPassword(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

export const isOtp = (value) => typeof value === "string" && OTP_RE.test(value);
export const isObjectId = (value) => typeof value === "string" && OBJECT_ID_RE.test(value);
export const isOpaqueToken = (value) => typeof value === "string" && OPAQUE_TOKEN_RE.test(value);

export const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Free-text search term for admin lists. Returns "" when absent. */
export function normalizeSearch(value) {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARS_RE, "").trim().slice(0, 100);
}

export function clampInt(value, { min, max, fallback }) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
