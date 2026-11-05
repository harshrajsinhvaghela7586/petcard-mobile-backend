import { ApiError, notFoundError } from "./http.js";
import { clampInt, escapeRegex, isObjectId, normalizeSearch } from "./validators.js";
import { isValidDateKey } from "./schema.js";

/*
 * Shared query helpers for the admin API: pagination, sorting, filters.
 * Everything coming from the query string is whitelisted and bounded
 * before it reaches MongoDB (no operators, no unbounded regexes).
 */

export const MAX_PAGE = 100_000;

export function pageArgs(req, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = clampInt(req.query.page, { min: 1, max: MAX_PAGE, fallback: 1 });
  const limit = clampInt(req.query.limit, { min: 1, max: maxLimit, fallback: defaultLimit });
  return { page, limit, skip: (page - 1) * limit };
}

export const paginationOf = (page, limit, total) => {
  const pages = Math.max(1, Math.ceil(total / limit));
  return { page, limit, total, pages, hasPrev: page > 1, hasNext: page < pages };
};

export const searchOf = (req, key = "search") => normalizeSearch(req.query[key]);

/** Case-insensitive "contains" regex over escaped user text. */
export const containsRx = (text) => new RegExp(escapeRegex(text), "i");

/** OR-search over fields. An email-looking term uses an anchored (index-friendly) prefix match. */
export function searchFilter(text, fields, { emailField } = {}) {
  if (!text) return null;
  if (emailField && text.includes("@")) return { [emailField]: new RegExp(`^${escapeRegex(text.toLowerCase())}`) };
  const rx = containsRx(text);
  return { $or: fields.map((f) => ({ [f]: rx })) };
}

export function enumOf(value, allowed, label = "value") {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new ApiError(400, `Invalid ${label}. Use one of: ${allowed.join(", ")}.`, { code: "VALIDATION_ERROR" });
  }
  return value;
}

export function boolOf(value) {
  if (value === undefined || value === "") return undefined;
  if (value === "true" || value === "1" || value === true) return true;
  if (value === "false" || value === "0" || value === false) return false;
  throw new ApiError(400, "Use true or false.", { code: "VALIDATION_ERROR" });
}

export function intOf(value, { min = 0, max = 1_000_000_000 } = {}) {
  if (value === undefined || value === "") return undefined;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new ApiError(400, `Number must be between ${min} and ${max}.`, { code: "VALIDATION_ERROR" });
  }
  return n;
}

export function idOf(value, label = "Item") {
  if (!isObjectId(value)) throw notFoundError(`${label} not found.`);
  return value;
}

/** Optional id filter from the query string (invalid ids are a 400, not an empty list). */
export function idFilter(value, label = "id") {
  if (value === undefined || value === "") return undefined;
  if (!isObjectId(value)) throw new ApiError(400, `Invalid ${label}.`, { code: "VALIDATION_ERROR" });
  return value;
}

export function dateKeyOf(value, label = "date") {
  if (value === undefined || value === "") return undefined;
  if (!isValidDateKey(value)) throw new ApiError(400, `Use ${label} as YYYY-MM-DD.`, { code: "VALIDATION_ERROR" });
  return value;
}

/** from/to (YYYY-MM-DD) -> { $gte, $lt } on a Date field. `to` is inclusive. */
export function dateRangeOf(req, fromKey = "from", toKey = "to") {
  const from = dateKeyOf(req.query[fromKey], fromKey);
  const to = dateKeyOf(req.query[toKey], toKey);
  if (from && to && to < from) throw new ApiError(400, "`to` cannot be before `from`.", { code: "VALIDATION_ERROR" });
  if (!from && !to) return undefined;
  const range = {};
  if (from) range.$gte = new Date(`${from}T00:00:00.000Z`);
  if (to) range.$lt = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86_400_000);
  return range;
}

/** from/to as plain YYYY-MM-DD string bounds (for fields stored as date keys). */
export function dateKeyRangeOf(req, fromKey = "from", toKey = "to") {
  const from = dateKeyOf(req.query[fromKey], fromKey);
  const to = dateKeyOf(req.query[toKey], toKey);
  if (from && to && to < from) throw new ApiError(400, "`to` cannot be before `from`.", { code: "VALIDATION_ERROR" });
  if (!from && !to) return undefined;
  return { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
}

/** ?sort=field&order=asc|desc -> a Mongo sort with a stable _id tiebreaker. */
export function sortOf(req, allowed, fallback = { field: "createdAt", order: -1 }) {
  const requested = req.query.sort;
  let field = fallback.field;
  if (requested !== undefined && requested !== "") {
    if (typeof requested !== "string" || !allowed.includes(requested)) {
      throw new ApiError(400, `Invalid sort. Use one of: ${allowed.join(", ")}.`, { code: "VALIDATION_ERROR" });
    }
    field = requested;
  }
  const order = req.query.order === "asc" ? 1 : req.query.order === "desc" ? -1 : fallback.order;
  return { field, order, spec: field === "_id" ? { _id: order } : { [field]: order, _id: order } };
}

/** Exact count for filtered lists; the cheap collection estimate when there is no filter. */
export const countFast = (Model, filter) =>
  filter && Object.keys(filter).length ? Model.countDocuments(filter) : Model.estimatedDocumentCount();

/** Drops undefined values so an unset filter never reaches MongoDB. */
export const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

/** Combines non-empty filters with $and (keeps each part index-friendly). */
export function allOf(...parts) {
  const list = parts.filter((p) => p && Object.keys(p).length);
  if (!list.length) return {};
  return list.length === 1 ? list[0] : { $and: list };
}

/** Standard list runner: find + count in parallel, lean, projected. */
export async function runPaged(Model, { filter = {}, sort, skip, limit, select, populate, page }) {
  let q = Model.find(filter).sort(sort).skip(skip).limit(limit);
  if (select) q = q.select(select);
  if (populate) q = q.populate(populate);
  const [items, total] = await Promise.all([q.lean(), countFast(Model, filter)]);
  return { items, pagination: paginationOf(page, limit, total) };
}

/** Map of id -> value helper for batch lookups. */
export const byId = (rows, key = "_id") => new Map(rows.map((r) => [String(r[key]), r]));
