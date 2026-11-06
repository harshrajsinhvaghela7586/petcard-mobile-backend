import crypto from "node:crypto";
import { config } from "../config/env.js";
import { log } from "../utils/logger.js";

/** Assigns a request id (returned in X-Request-Id) and logs one safe line per request. */
export function requestContext(req, res, next) {
  req.id = crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);

  const started = process.hrtime.bigint();
  res.on("finish", () => {
    // Query strings can carry sensitive values, so only the path is logged.
    const path = req.originalUrl.split("?")[0];
    if (path === "/api/health") return;
    log.info("http", {
      id: req.id,
      method: req.method,
      path,
      status: res.statusCode,
      ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
    });
  });

  next();
}

/** Auth responses carry tokens/codes and must never be cached by proxies or browsers. */
export function noStore(_req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  next();
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF defense for cookie-authenticated (admin) routes: browsers always send
 * Origin on cross-site unsafe requests. A mismatching Origin is rejected;
 * non-browser clients (no Origin) cannot ride on a victim's cookie anyway.
 */
export function originGuard(req, res, next) {
  if (!UNSAFE_METHODS.has(req.method)) return next();

  const origin = req.get("origin");
  if (origin && !config.allowedOrigins.includes(origin.replace(/\/+$/, ""))) {
    return res.status(403).json({ success: false, message: "Request blocked." });
  }
  return next();
}
