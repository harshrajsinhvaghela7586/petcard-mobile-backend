import { config } from "../config/env.js";
import { log, serializeError } from "../utils/logger.js";

export function notFound(_req, res) {
  res.status(404).json({ success: false, message: "Not found." });
}

/*
 * Central error handler: clients only ever see a safe, generic message plus a
 * request id they can quote to support. Details go to the (redacted) log.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = 500;
  let message = "Something went wrong. Please try again.";
  let extra = {};

  if (err?.name === "ApiError") {
    status = err.status;
    message = err.message;
    extra = { ...(err.code ? { code: err.code } : {}), ...(err.extra || {}) };
  } else if (err?.type === "entity.parse.failed") {
    status = 400;
    message = "Invalid request body.";
  } else if (err?.type === "entity.too.large") {
    status = 413;
    message = "Request body is too large.";
  } else if (err?.name === "ValidationError" || err?.name === "CastError") {
    status = 400;
    message = "Invalid request.";
  } else if (err?.code === 11000) {
    status = 409;
    message = "This record already exists.";
  } else if (
    err?.name === "JsonWebTokenError" ||
    err?.name === "TokenExpiredError" ||
    err?.name === "NotBeforeError"
  ) {
    status = 401;
    message = "Please sign in again.";
  }

  if (status >= 500) {
    log.error("request.failed", {
      id: req.id,
      method: req.method,
      path: String(req.originalUrl || "").split("?")[0],
      error: serializeError(err),
    });
  }

  if (res.headersSent) return;

  res.status(status).json({
    success: false,
    message,
    ...extra,
    requestId: req.id,
    ...(config.isProd ? {} : { debug: serializeError(err).name }),
  });
}
