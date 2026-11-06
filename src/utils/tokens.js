import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";

const AUD_MOBILE = "petcard-mobile";
const AUD_ADMIN = "petcard-admin";
const ALGORITHMS = ["HS256"];

/* ---------- Mobile access token (short lived) ---------- */

export const signAccessToken = (user) =>
  jwt.sign({ tv: user.tokenVersion || 0 }, config.keys.mobileJwt, {
    algorithm: "HS256",
    subject: String(user._id),
    issuer: config.jwt.issuer,
    audience: AUD_MOBILE,
    expiresIn: config.jwt.accessSeconds,
  });

export const verifyAccessToken = (token) =>
  jwt.verify(token, config.keys.mobileJwt, {
    algorithms: ALGORITHMS,
    issuer: config.jwt.issuer,
    audience: AUD_MOBILE,
  });

/* ---------- Admin session token (httpOnly cookie) ---------- */

export const signAdminToken = (admin) =>
  jwt.sign({ tv: admin.tokenVersion || 0 }, config.keys.adminJwt, {
    algorithm: "HS256",
    subject: String(admin._id),
    issuer: config.jwt.issuer,
    audience: AUD_ADMIN,
    expiresIn: `${config.jwt.adminSessionDays}d`,
  });

export const verifyAdminToken = (token) =>
  jwt.verify(token, config.keys.adminJwt, {
    algorithms: ALGORITHMS,
    issuer: config.jwt.issuer,
    audience: AUD_ADMIN,
  });

/* ---------- Opaque refresh token (stored hashed) ---------- */

export const newRefreshToken = () => crypto.randomBytes(48).toString("base64url");

export const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const adminCookieOptions = () => ({
  httpOnly: true,
  secure: config.cookie.secure,
  sameSite: config.cookie.sameSite,
  path: "/",
  maxAge: config.jwt.adminSessionDays * 24 * 60 * 60 * 1000,
});
