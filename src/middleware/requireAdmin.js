import Admin from "../models/Admin.js";
import { verifyAdminToken } from "../utils/tokens.js";

export const ADMIN_COOKIE = "petcard_admin";

const reject = (res, message) => res.status(401).json({ success: false, message });

export async function requireAdmin(req, res, next) {
  const token = req.cookies?.[ADMIN_COOKIE];
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return reject(res, "Please log in.");
  }

  let payload;
  try {
    payload = verifyAdminToken(token);
  } catch {
    return reject(res, "Session expired. Please log in again.");
  }

  try {
    const admin = await Admin.findById(payload.sub)
      .select("_id name email verified tokenVersion")
      .lean();

    if (!admin || !admin.verified || (admin.tokenVersion || 0) !== payload.tv) {
      return reject(res, "Unauthorized.");
    }

    req.admin = { _id: admin._id, name: admin.name, email: admin.email, verified: admin.verified };
    return next();
  } catch (error) {
    return next(error);
  }
}
