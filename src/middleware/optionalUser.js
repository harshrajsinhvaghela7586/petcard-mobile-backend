import MobileUser from "../models/MobileUser.js";
import { verifyAccessToken } from "../utils/tokens.js";

const BEARER_RE = /^Bearer ([A-Za-z0-9._-]{20,2048})$/;

/**
 * Soft version of requireUser for public routes.
 * If a valid access token is sent, req.user is set (so the route can tell who is
 * scanning). Missing / invalid / expired tokens are simply ignored: the request
 * continues as an anonymous visitor and never fails here.
 */
export async function optionalUser(req, res, next) {
  /* The answer depends on who is asking, so it must never be shared from a cache. */
  res.setHeader("Vary", "Authorization");
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const match = BEARER_RE.exec(req.get("authorization") || "");
    if (!match) return next();
    const payload = verifyAccessToken(match[1]);
    const user = await MobileUser.findById(payload.sub).select("_id name tokenVersion disabledAt isEmailVerified").lean();
    if (user && !user.disabledAt && user.isEmailVerified && (user.tokenVersion || 0) === payload.tv) {
      req.user = { id: String(user._id), name: user.name };
    }
  } catch {
    /* anonymous */
  }
  next();
}
