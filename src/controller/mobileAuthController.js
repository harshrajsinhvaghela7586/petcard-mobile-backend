import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import crypto from "node:crypto";

import { config } from "../config/env.js";
import MobileUser from "../models/MobileUser.js";
import PetMember from "../models/PetMember.js";
import { parsePhone, phoneFields, phoneView } from "../utils/phone.js";
import { LANGUAGE_CODES, DEFAULT_LANGUAGE, COUNTRY_BY_ISO } from "../config/countries.js";
import RefreshToken from "../models/RefreshToken.js";
import { issueOtp, consumeOtp } from "../services/otpService.js";
import { sendOtpMail } from "../services/mailer.js";
import {
  normalizeEmail,
  normalizeName,
  checkPassword,
  isLoginPassword,
  isOtp,
  isOpaqueToken,
} from "../utils/validators.js";
import {
  signAccessToken,
  newRefreshToken,
  hashToken,
} from "../utils/tokens.js";
import {
  isLocked,
  recordLoginFailure,
  clearLoginFailures,
} from "../utils/loginGuard.js";

const SCOPE = "mobile";
const BCRYPT_ROUNDS = 12;
const googleClient = new OAuth2Client();

/* Compared against when the account does not exist, so response time does not reveal it. */
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), BCRYPT_ROUNDS);

const OTP_FIELDS = {
  verify: {
    hash: "emailOtpHash",
    exp: "emailOtpExpiresAt",
    attempts: "emailOtpAttempts",
    sentAt: "emailOtpSentAt",
  },
  reset: {
    hash: "resetOtpHash",
    exp: "resetOtpExpiresAt",
    attempts: "resetOtpAttempts",
    sentAt: "resetOtpSentAt",
  },
};

const OTP_ERROR = "The code is invalid or expired. Request a new code and try again.";
const LOGIN_ERROR = "Incorrect email or password.";

/* ---------- helpers ---------- */

const bodyOf = (req) =>
  req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};

const fail = (res, status, message, extra = {}) =>
  res.status(status).json({ success: false, message, ...extra });

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  ...phoneView(user),
  country: user.country || "",
  language: user.language || DEFAULT_LANGUAGE,
});

const hasAnyPet = async (userId) => Boolean(await PetMember.exists({ user: userId }));

const sessionPayload = (accessToken, refreshToken) => ({
  token: accessToken, // kept for backward compatibility with the current app
  accessToken,
  refreshToken,
  tokenType: "Bearer",
  expiresIn: config.jwt.accessSeconds,
});

const userAgentOf = (req) => String(req.get("user-agent") || "").slice(0, 200);

async function startSession(user, req, family = crypto.randomUUID()) {
  const accessToken = signAccessToken(user);
  const refreshToken = newRefreshToken();

  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(refreshToken),
    family,
    expiresAt: new Date(Date.now() + config.jwt.refreshDays * 24 * 60 * 60 * 1000),
    userAgent: userAgentOf(req),
  });

  return sessionPayload(accessToken, refreshToken);
}

const revokeAllSessions = (userId) =>
  RefreshToken.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );

const pendingVerification = (res, expiresAt) =>
  fail(
    res,
    429,
    "A verification code was just sent to this email. Enter it, or try again when it expires.",
    {
      code: "VERIFICATION_PENDING",
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((new Date(expiresAt || Date.now() + 60_000).getTime() - Date.now()) / 1000)
      ),
    }
  );

/* ---------- signup / verify / resend ---------- */

export const signup = async (req, res, next) => {
  try {
    const b = bodyOf(req);

    const name = normalizeName(b.name);
    const email = normalizeEmail(b.email);
    const parsedPhone = parsePhone({ phone: b.phone, country: b.country, dialCode: b.phoneCountryCode ?? b.dialCode });
    const passwordError = checkPassword(b.password);
    const language = typeof b.language === "string" && LANGUAGE_CODES.includes(b.language.toLowerCase()) ? b.language.toLowerCase() : DEFAULT_LANGUAGE;
    const countryOnly = typeof b.country === "string" && COUNTRY_BY_ISO.has(b.country.toUpperCase()) ? b.country.toUpperCase() : "";

    if (!name) {
      return fail(res, 400, "Enter your name using letters, spaces, apostrophes, dots or hyphens.", { field: "name" });
    }
    if (!email) return fail(res, 400, "Enter a valid email address.", { field: "email" });
    if (!parsedPhone.ok) return fail(res, 400, parsedPhone.message, { field: "phone" });
    const contact = { ...phoneFields(parsedPhone), ...(parsedPhone.empty && countryOnly ? { country: countryOnly } : {}), language };
    if (passwordError) return fail(res, 400, passwordError, { field: "password" });

    const existing = await MobileUser.findOne({ email })
      .select("isEmailVerified +emailOtpExpiresAt")
      .lean();

    if (existing?.isEmailVerified) {
      return fail(res, 409, "An account with this email already exists.");
    }

    /*
     * An unverified signup with a live code is never overwritten. Otherwise
     * someone could replace the password of a half-finished signup, and the
     * real owner would then verify the email for the attacker's password.
     */
    const now = new Date();
    if (existing?.emailOtpExpiresAt && new Date(existing.emailOtpExpiresAt) > now) {
      return pendingVerification(res, existing.emailOtpExpiresAt);
    }

    const passwordHash = await bcrypt.hash(b.password, BCRYPT_ROUNDS);

    if (!existing) {
      try {
        await MobileUser.create({ name, email, passwordHash, ...contact });
      } catch (error) {
        if (error?.code === 11000) return pendingVerification(res);
        throw error;
      }
    } else {
      const updated = await MobileUser.findOneAndUpdate(
        {
          _id: existing._id,
          isEmailVerified: false,
          $or: [
            { emailOtpExpiresAt: { $exists: false } },
            { emailOtpExpiresAt: { $lte: now } },
          ],
        },
        { $set: { name, passwordHash, ...contact } },
        { new: true }
      )
        .select("_id")
        .lean();

      if (!updated) return pendingVerification(res);
    }

    const result = await issueOtp({
      Model: MobileUser,
      fields: OTP_FIELDS,
      scope: SCOPE,
      purpose: "verify",
      email,
      filter: { isEmailVerified: false },
    });

    if (result.status === "cooldown") {
      return fail(res, 429, "Please wait before requesting another code.", {
        code: "OTP_COOLDOWN",
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }
    if (result.status !== "sent") {
      return fail(res, 400, "We couldn't start verification for this email.");
    }

    sendOtpMail({ to: email, otp: result.otp, purpose: "verify" });

    return res.status(201).json({
      success: true,
      message: "Verification code sent to your email.",
      email,
      expiresInSeconds: config.otp.minutes * 60,
      resendAfterSeconds: config.otp.resendCooldownSeconds,
    });
  } catch (error) {
    return next(error);
  }
};

export const verifyOtp = async (req, res, next) => {
  try {
    const b = bodyOf(req);
    const email = normalizeEmail(b.email);
    const otp = typeof b.otp === "string" ? b.otp.trim() : "";

    if (!email || !isOtp(otp)) return fail(res, 400, OTP_ERROR);

    const result = await consumeOtp({
      Model: MobileUser,
      fields: OTP_FIELDS,
      scope: SCOPE,
      purpose: "verify",
      email,
      otp,
      filter: { isEmailVerified: false },
      set: { isEmailVerified: true },
    });

    if (result.status === "ok") {
      return res.json({ success: true, message: "Email verified. You can now sign in." });
    }
    if (result.status === "locked") {
      return fail(res, 429, "Too many incorrect codes. Request a new code.", { code: "OTP_LOCKED" });
    }
    return fail(res, 400, OTP_ERROR);
  } catch (error) {
    return next(error);
  }
};

export const resendOtp = async (req, res, next) => {
  try {
    const email = normalizeEmail(bodyOf(req).email);
    if (!email) return fail(res, 400, "Enter a valid email address.");

    const result = await issueOtp({
      Model: MobileUser,
      fields: OTP_FIELDS,
      scope: SCOPE,
      purpose: "verify",
      email,
      filter: { isEmailVerified: false },
    });

    if (result.status === "cooldown") {
      return fail(res, 429, "Please wait a moment before requesting another code.", {
        code: "OTP_COOLDOWN",
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }

    if (result.status === "sent") {
      sendOtpMail({ to: email, otp: result.otp, purpose: "verify" });
    }

    // Same answer whether or not the account exists (no account enumeration).
    return res.json({
      success: true,
      message: "If this email is waiting for verification, a new code has been sent.",
      expiresInSeconds: config.otp.minutes * 60,
      resendAfterSeconds: config.otp.resendCooldownSeconds,
    });
  } catch (error) {
    return next(error);
  }
};

/* ---------- login / sessions ---------- */

export const login = async (req, res, next) => {
  try {
    const b = bodyOf(req);
    const email = normalizeEmail(b.email);

    if (!email || !isLoginPassword(b.password)) {
      return fail(res, 400, "Enter your email and password.");
    }

    const user = await MobileUser.findOne({ email })
      .select("+passwordHash +loginFailures +lockUntil")
      .lean();

    if (user && isLocked(user)) {
      return fail(res, 429, "Too many failed attempts. Try again in a few minutes.", {
        code: "ACCOUNT_LOCKED",
      });
    }

    // Always run bcrypt so unknown emails cost the same time as wrong passwords.
    const passwordOk = await bcrypt.compare(b.password, user?.passwordHash || DUMMY_HASH);

    if (!user || !passwordOk) {
      if (user) await recordLoginFailure(MobileUser, user._id);
      return fail(res, 401, LOGIN_ERROR);
    }

    if (user.disabledAt) return fail(res, 403, "This account has been disabled. Please contact PetCard support.");

    if (!user.isEmailVerified) {
      return fail(res, 403, "Please verify your email before signing in.", {
        code: "EMAIL_NOT_VERIFIED",
      });
    }

    if (user.loginFailures > 0 || user.lockUntil) {
      await clearLoginFailures(MobileUser, user._id);
    }

    const session = await startSession(user, req);
    const hasPet = await hasAnyPet(user._id);
    MobileUser.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }).catch(() => {});

    return res.json({
      success: true,
      message: "Signed in successfully.",
      ...session,
      user: publicUser(user),
      // Until the first pet exists, the app only shows "Complete pet setup".
      hasPet,
      needsPetSetup: !hasPet,
    });
  } catch (error) {
    return next(error);
  }
};


/* ---------- Google OAuth (native mobile login + signup) ---------- */

export const googleSignIn = async (req, res, next) => {
  try {
    const idToken = typeof bodyOf(req).idToken === "string" ? bodyOf(req).idToken.trim() : "";
    if (!idToken || idToken.length > 8192) return fail(res, 400, "A valid Google ID token is required.");
    const audiences = config.googleOAuthClientIds;
    if (!audiences.length) return fail(res, 503, "Google sign-in is not configured on the server.");

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({ idToken, audience: audiences });
      payload = ticket.getPayload();
    } catch {
      return fail(res, 401, "Google authentication failed. Please try again.");
    }

    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      return fail(res, 401, "Google must provide a verified email address.");
    }

    const email = normalizeEmail(payload.email);
    const name = normalizeName(payload.name || payload.given_name || email.split("@")[0]);
    if (!email || !name) return fail(res, 400, "Google account profile is incomplete.");

    let user = await MobileUser.findOne({ $or: [{ googleId: payload.sub }, { email }] })
      .select("+googleId +passwordHash +loginFailures +lockUntil")
      .lean();

    if (user?.disabledAt) return fail(res, 403, "This account has been disabled. Please contact PetCard support.");
    if (user && user.googleId && user.googleId !== payload.sub) {
      return fail(res, 409, "This email is already linked to another Google account.");
    }

    if (!user) {
      try {
        const created = await MobileUser.create({
          name,
          email,
          googleId: payload.sub,
          isEmailVerified: true,
          lastLoginAt: new Date(),
          // Google-authenticated accounts do not need a local password.
        });
        user = await MobileUser.findById(created._id).select("+googleId").lean();
      } catch (error) {
        if (error?.code !== 11000) throw error;
        user = await MobileUser.findOne({ email }).select("+googleId +passwordHash +loginFailures +lockUntil").lean();
        if (!user) throw error;
      }
    }

    if (user.googleId && user.googleId !== payload.sub) {
      return fail(res, 409, "This email is already linked to another Google account.");
    }

    if (!user.googleId || !user.isEmailVerified) {
      await MobileUser.updateOne(
        { _id: user._id },
        { $set: { googleId: payload.sub, isEmailVerified: true, name: user.name || name, lastLoginAt: new Date() },
          $unset: { emailOtpHash: 1, emailOtpExpiresAt: 1, emailOtpAttempts: 1, emailOtpSentAt: 1 } }
      );
      user = { ...user, googleId: payload.sub, isEmailVerified: true, name: user.name || name };
    } else {
      await MobileUser.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
    }

    const session = await startSession(user, req);
    const hasPet = await hasAnyPet(user._id);
    return res.json({
      success: true,
      message: "Signed in with Google successfully.",
      ...session,
      user: publicUser(user),
      hasPet,
      needsPetSetup: !hasPet,
    });
  } catch (error) {
    return next(error);
  }
};

export const refresh = async (req, res, next) => {
  try {
    const presented = bodyOf(req).refreshToken;
    const expired = () =>
      fail(res, 401, "Your session expired. Please sign in again.", { code: "SESSION_EXPIRED" });

    if (!isOpaqueToken(presented)) return expired();

    const stored = await RefreshToken.findOne({ tokenHash: hashToken(presented) }).lean();
    if (!stored) return expired();

    // Reuse of an already-rotated token means it may have been stolen: kill the whole family.
    if (stored.revokedAt) {
      await RefreshToken.updateMany(
        { family: stored.family, revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );
      return expired();
    }

    if (new Date(stored.expiresAt).getTime() <= Date.now()) return expired();

    // Atomic rotation: only one concurrent request can consume this token.
    const consumed = await RefreshToken.findOneAndUpdate(
      { _id: stored._id, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    ).lean();
    if (!consumed) return expired();

    const user = await MobileUser.findById(stored.user)
      .select("_id tokenVersion isEmailVerified")
      .lean();

    if (!user || !user.isEmailVerified) {
      await RefreshToken.updateMany(
        { family: stored.family, revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );
      return expired();
    }

    const session = await startSession(user, req, stored.family);
    return res.json({ success: true, ...session });
  } catch (error) {
    return next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const presented = bodyOf(req).refreshToken;

    if (isOpaqueToken(presented)) {
      const stored = await RefreshToken.findOne({ tokenHash: hashToken(presented) })
        .select("family")
        .lean();

      if (stored) {
        await RefreshToken.updateMany(
          { family: stored.family, revokedAt: null },
          { $set: { revokedAt: new Date() } }
        );
      }
    }

    // Always succeeds: the client must be able to clear its local session.
    return res.json({ success: true, message: "Signed out." });
  } catch (error) {
    return next(error);
  }
};

export const logoutAll = async (req, res, next) => {
  try {
    await MobileUser.updateOne({ _id: req.user.id }, { $inc: { tokenVersion: 1 } });
    await revokeAllSessions(req.user.id);
    return res.json({ success: true, message: "Signed out of all devices." });
  } catch (error) {
    return next(error);
  }
};

export const me = async (req, res, next) => {
  try {
    const [user, hasPet] = await Promise.all([
      MobileUser.findById(req.user.id).select("name email phone country phoneCountryCode phoneNational language").lean(),
      hasAnyPet(req.user.id),
    ]);
    return res.json({ success: true, user: publicUser(user ?? { _id: req.user.id, ...req.user }), hasPet, needsPetSetup: !hasPet });
  } catch (error) {
    return next(error);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const b = bodyOf(req);

    if (!isLoginPassword(b.currentPassword)) {
      return fail(res, 400, "Enter your current password.", { field: "currentPassword" });
    }
    const passwordError = checkPassword(b.newPassword);
    if (passwordError) return fail(res, 400, passwordError, { field: "newPassword" });
    if (b.newPassword === b.currentPassword) {
      return fail(res, 400, "Choose a password different from your current one.", { field: "newPassword" });
    }

    const user = await MobileUser.findById(req.user.id).select("+passwordHash").lean();
    if (user && !user.passwordHash) {
      return fail(res, 400, "This account uses Google sign-in. Use Forgot Password to set a password first.");
    }
    if (!user || !(await bcrypt.compare(b.currentPassword, user.passwordHash))) {
      return fail(res, 401, "Your current password is incorrect.", { field: "currentPassword" });
    }

    const passwordHash = await bcrypt.hash(b.newPassword, BCRYPT_ROUNDS);

    const updated = await MobileUser.findByIdAndUpdate(
      user._id,
      { $set: { passwordHash }, $inc: { tokenVersion: 1 } },
      { new: true }
    )
      .select("_id name email phone tokenVersion")
      .lean();

    // Every other device is signed out; this device continues with fresh tokens.
    await revokeAllSessions(user._id);
    const session = await startSession(updated, req);

    return res.json({ success: true, message: "Password updated.", ...session });
  } catch (error) {
    return next(error);
  }
};

/* ---------- password reset ---------- */

export const forgotPassword = async (req, res, next) => {
  try {
    const email = normalizeEmail(bodyOf(req).email);
    if (!email) return fail(res, 400, "Enter a valid email address.");

    const result = await issueOtp({
      Model: MobileUser,
      fields: OTP_FIELDS,
      scope: SCOPE,
      purpose: "reset",
      email,
      filter: { isEmailVerified: true },
    });

    if (result.status === "sent") {
      sendOtpMail({ to: email, otp: result.otp, purpose: "reset" });
    }

    // Identical response for unknown, unverified, cooldown and success.
    return res.json({
      success: true,
      message: "If a verified account exists for this email, a reset code has been sent.",
      expiresInSeconds: config.otp.minutes * 60,
      resendAfterSeconds: config.otp.resendCooldownSeconds,
    });
  } catch (error) {
    return next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const b = bodyOf(req);
    const email = normalizeEmail(b.email);
    const otp = typeof b.otp === "string" ? b.otp.trim() : "";
    const passwordError = checkPassword(b.newPassword);

    if (passwordError) return fail(res, 400, passwordError, { field: "newPassword" });
    if (!email || !isOtp(otp)) return fail(res, 400, OTP_ERROR);

    const result = await consumeOtp({
      Model: MobileUser,
      fields: OTP_FIELDS,
      scope: SCOPE,
      purpose: "reset",
      email,
      otp,
      filter: { isEmailVerified: true },
      // bcrypt only runs after the code is proven correct.
      buildSet: async () => ({
        passwordHash: await bcrypt.hash(b.newPassword, BCRYPT_ROUNDS),
        loginFailures: 0,
      }),
      inc: { tokenVersion: 1 },
    });

    if (result.status === "locked") {
      return fail(res, 429, "Too many incorrect codes. Request a new code.", { code: "OTP_LOCKED" });
    }
    if (result.status !== "ok") return fail(res, 400, OTP_ERROR);

    await MobileUser.updateOne({ _id: result.doc._id }, { $unset: { lockUntil: 1 } });
    await revokeAllSessions(result.doc._id);

    return res.json({ success: true, message: "Password reset successfully. Please sign in." });
  } catch (error) {
    return next(error);
  }
};
