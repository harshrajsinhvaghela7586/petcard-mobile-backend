import MobileUser from "../models/MobileUser.js";
import { verifyAccessToken } from "../utils/tokens.js";

const BEARER_RE = /^Bearer ([A-Za-z0-9._-]{20,2048})$/;

const reject = (res, code, message) =>
  res.status(401).json({ success: false, message, code });

/**
 * Authenticates a mobile user from `Authorization: Bearer <accessToken>`.
 * The user is re-read from the database on every request, so deleted,
 * unverified or logged-out-everywhere accounts lose access immediately
 * (tokenVersion mismatch), instead of staying valid until the token expires.
 */
export async function requireUser(req, res, next) {
  const match = BEARER_RE.exec(req.get("authorization") || "");
  if (!match) return reject(res, "AUTH_REQUIRED", "Please sign in to continue.");

  let payload;
  try {
    payload = verifyAccessToken(match[1]);
  } catch (error) {
    return error?.name === "TokenExpiredError"
      ? reject(res, "TOKEN_EXPIRED", "Your session expired. Please refresh and try again.")
      : reject(res, "AUTH_REQUIRED", "Please sign in to continue.");
  }

  try {
    const user = await MobileUser.findById(payload.sub)
      .select("_id name email phone isEmailVerified tokenVersion disabledAt")
      .lean();

    if (!user || user.disabledAt || !user.isEmailVerified || (user.tokenVersion || 0) !== payload.tv) {
      return reject(res, "AUTH_REQUIRED", "Please sign in to continue.");
    }

    req.user = {
      id: String(user._id),
      name: user.name,
      email: user.email,
      phone: user.phone,
      tokenVersion: user.tokenVersion || 0,
    };
    return next();
  } catch (error) {
    return next(error);
  }
}
