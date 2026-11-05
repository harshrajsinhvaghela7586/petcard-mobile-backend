/*
 * Small HTTP helpers shared by every controller.
 */

export class ApiError extends Error {
  /**
   * @param {number} status HTTP status
   * @param {string} message safe, user-facing message
   * @param {{ code?: string, extra?: object }} [options]
   */
  constructor(status, message, { code, extra } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (message, options) => new ApiError(400, message, options);
export const forbidden = (message = "You do not have permission to do that.", options) =>
  new ApiError(403, message, options);
export const notFoundError = (message = "Not found.", options) => new ApiError(404, message, options);
export const conflict = (message, options) => new ApiError(409, message, options);

/** Express 4 does not catch rejected promises: wrap every async handler. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export const ok = (res, body = {}, status = 200) =>
  res.status(status).json({ success: true, ...body });

/** Cursor pagination: opaque, validated, tamper-safe (it only narrows a query the user may already run). */
export function encodeCursor(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

export function decodeCursor(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" || raw.length > 300 || !/^[A-Za-z0-9_-]+$/.test(raw)) {
    throw badRequest("Invalid cursor.", { code: "INVALID_CURSOR" });
  }
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("shape");
    return value;
  } catch {
    throw badRequest("Invalid cursor.", { code: "INVALID_CURSOR" });
  }
}
