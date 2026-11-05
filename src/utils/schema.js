/*
 * Tiny declarative request validation (no dependencies), consistent with
 * validators.js: whitelist only, strict types, bounded lengths, no operator
 * objects ever reach MongoDB.
 *
 *   const data = validate(req.body, {
 *     name: field(t.string({ max: 40 }), { required: true }),
 *     notes: field(t.string({ max: 500, allowEmpty: true, multiline: true }), { nullable: true }),
 *   });
 *
 * - unknown keys are dropped
 * - missing optional keys are omitted from the result (perfect for PATCH)
 * - `null` is only accepted when `nullable: true`
 */

import { ApiError } from "./http.js";

class FieldError extends Error {}
const bad = (message) => {
  throw new FieldError(message);
};

const CONTROL_SINGLE_LINE = /[\u0000-\u001f\u007f]/;
const CONTROL_MULTI_LINE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidDateKey(value) {
  if (typeof value !== "string") return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 2200) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export const t = {
  string({ min = 1, max = 200, pattern, message, allowEmpty = false, multiline = false } = {}) {
    return (raw) => {
      if (typeof raw !== "string") bad("Must be text.");
      if (raw.length > max * 4 + 50) bad(`Must be at most ${max} characters.`);
      let s = raw.normalize("NFC");
      s = multiline ? s.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ") : s.replace(/\s+/g, " ");
      s = s.trim();
      if (s === "") {
        if (allowEmpty) return "";
        bad("This field is required.");
      }
      if (s.length < min) bad(`Must be at least ${min} characters.`);
      if (s.length > max) bad(`Must be at most ${max} characters.`);
      if ((multiline ? CONTROL_MULTI_LINE : CONTROL_SINGLE_LINE).test(s)) {
        bad("Contains unsupported characters.");
      }
      if (pattern && !pattern.test(s)) bad(message || "Invalid format.");
      return s;
    };
  },

  /** lowercase slug / catalogue key, e.g. "dog", "sticker_01" */
  key({ max = 60 } = {}) {
    const re = new RegExp(`^[a-z0-9][a-z0-9_-]{0,${max - 1}}$`);
    return (raw) => {
      if (typeof raw !== "string") bad("Must be text.");
      const s = raw.trim().toLowerCase();
      if (!re.test(s)) bad("Invalid value.");
      return s;
    };
  },

  int({ min = -2_147_483_648, max = 2_147_483_647, coerce = false } = {}) {
    return (raw) => {
      let n = raw;
      if (coerce && typeof raw === "string" && /^-?\d{1,10}$/.test(raw.trim())) n = Number(raw);
      if (typeof n !== "number" || !Number.isInteger(n)) bad("Must be a whole number.");
      if (n < min || n > max) bad(`Must be between ${min} and ${max}.`);
      return n;
    };
  },

  number({ min = -1e9, max = 1e9, decimals = 2 } = {}) {
    return (raw) => {
      if (typeof raw !== "number" || !Number.isFinite(raw)) bad("Must be a number.");
      if (raw < min || raw > max) bad(`Must be between ${min} and ${max}.`);
      const f = 10 ** decimals;
      return Math.round(raw * f) / f;
    };
  },

  bool({ coerce = false } = {}) {
    return (raw) => {
      if (typeof raw === "boolean") return raw;
      if (coerce && raw === "true") return true;
      if (coerce && raw === "false") return false;
      return bad("Must be true or false.");
    };
  },

  oneOf(values) {
    const set = new Set(values);
    return (raw) => {
      if (typeof raw !== "string" || !set.has(raw)) bad(`Must be one of: ${values.join(", ")}.`);
      return raw;
    };
  },

  /** "YYYY-MM-DD" calendar date, returned as the same string. */
  dateKey({ allowFuture = true, maxFutureDays } = {}) {
    return (raw) => {
      if (!isValidDateKey(raw)) bad("Use a valid date in YYYY-MM-DD format.");
      if (!allowFuture && raw > todayKey(1)) bad("Date cannot be in the future.");
      if (maxFutureDays !== undefined && raw > todayKey(maxFutureDays + 1)) {
        bad("Date is too far in the future.");
      }
      return raw;
    };
  },

  /**
   * Birth date typed/picked on a phone. Accepts "YYYY-MM-DD", an ISO datetime
   * (date part is kept), "DD MMM YYYY" (14 May 2023), "DD/MM/YYYY" and
   * "DD-MM-YYYY", and always returns "YYYY-MM-DD".
   */
  birthDate({ allowFuture = false } = {}) {
    const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const pad = (n) => String(n).padStart(2, "0");
    return (raw) => {
      if (typeof raw !== "string") bad("Use a valid date in YYYY-MM-DD format.");
      const v = raw.trim();
      let key = null;
      let m;
      if ((m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(v))) key = `${m[1]}-${m[2]}-${m[3]}`;
      else if ((m = /^(\d{1,2})[\s/.-]+([A-Za-z]{3,9})[\s/.,-]+(\d{4})$/.exec(v))) {
        const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
        if (mo) key = `${m[3]}-${pad(mo)}-${pad(m[1])}`;
      } else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v))) key = `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
      if (!key || !isValidDateKey(key)) bad("Use a valid date in YYYY-MM-DD format.");
      if (!allowFuture && key > todayKey(1)) bad("Date cannot be in the future.");
      return key;
    };
  },

  time() {
    return (raw) => {
      if (typeof raw !== "string" || !TIME_RE.test(raw)) bad("Use a valid time in HH:mm format.");
      return raw;
    };
  },

  objectId() {
    return (raw) => {
      if (typeof raw !== "string" || !OBJECT_ID_RE.test(raw)) bad("Invalid id.");
      return raw;
    };
  },

  array(rule, { max = 20, min = 0, unique = true } = {}) {
    return (raw) => {
      if (!Array.isArray(raw)) bad("Must be a list.");
      if (raw.length > max) bad(`At most ${max} items allowed.`);
      if (raw.length < min) bad(`At least ${min} items required.`);
      const out = raw.map((item) => rule(item));
      if (unique && new Set(out).size !== out.length) bad("Duplicate items are not allowed.");
      return out;
    };
  },

  /** nested object validated with another spec */
  object(spec) {
    return (raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) bad("Invalid value.");
      const { data, errors } = run(raw, spec);
      const keys = Object.keys(errors);
      if (keys.length) bad(`${keys[0]}: ${errors[keys[0]]}`);
      return data;
    };
  },
};

export const field = (rule, { required = false, nullable = false } = {}) => ({
  rule,
  required,
  nullable,
});

function run(raw, spec) {
  const data = {};
  const errors = {};

  for (const [name, def] of Object.entries(spec)) {
    const value = raw[name];

    if (value === undefined) {
      if (def.required) errors[name] = "This field is required.";
      continue;
    }
    if (value === null) {
      if (def.nullable) data[name] = null;
      else errors[name] = "This field cannot be empty.";
      continue;
    }
    try {
      data[name] = def.rule(value);
    } catch (error) {
      if (error instanceof FieldError) errors[name] = error.message;
      else throw error;
    }
  }
  return { data, errors };
}

export function validate(raw, spec) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const { data, errors } = run(source, spec);
  const names = Object.keys(errors);
  if (names.length) {
    throw new ApiError(400, "Please check the highlighted fields.", {
      code: "VALIDATION_ERROR",
      extra: { fields: errors },
    });
  }
  return data;
}

/* ---------- date helpers (all dates are UTC "YYYY-MM-DD" keys) ---------- */

export const toKey = (date) => date.toISOString().slice(0, 10);

/** today (UTC) shifted by `offsetDays` */
export const todayKey = (offsetDays = 0) =>
  toKey(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000));

export const addDays = (key, days) => {
  const [y, m, d] = key.split("-").map(Number);
  return toKey(new Date(Date.UTC(y, m - 1, d + days)));
};

export const dayOfWeek = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

export const daysBetween = (fromKey, toKeyValue) => {
  const [y1, m1, d1] = fromKey.split("-").map(Number);
  const [y2, m2, d2] = toKeyValue.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
};

/** The app's local "today" (?today=YYYY-MM-DD), accepted only within ±1 day of UTC today. */
export function clientToday(req) {
  const raw = req.query?.today;
  if (isValidDateKey(raw) && raw >= todayKey(-1) && raw <= todayKey(1)) return raw;
  return todayKey();
}