    import { Router } from "express";
    import bcrypt from "bcryptjs";
    import crypto from "node:crypto";

    import Admin from "../models/Admin.js";
    import { ADMIN_COOKIE, requireAdmin } from "../middleware/requireAdmin.js";
    import { createAuthLimiters } from "../middleware/rateLimiters.js";
    import { issueOtp, consumeOtp } from "../services/otpService.js";
    import { sendOtpMail } from "../services/mailer.js";
    import {
      normalizeEmail,
      normalizeName,
      checkPassword,
      isLoginPassword,
      isOtp,
    } from "../utils/validators.js";
    import { signAdminToken, adminCookieOptions } from "../utils/tokens.js";
    import { isLocked, recordLoginFailure, clearLoginFailures } from "../utils/loginGuard.js";

    export const authRouter = Router();

    const SCOPE = "admin";
    const BCRYPT_ROUNDS = 12;
    const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), BCRYPT_ROUNDS);

    const OTP_FIELDS = {
      verify: { hash: "otpHash", exp: "otpExpires", attempts: "otpAttempts", sentAt: "otpSentAt" },
      reset: { hash: "resetHash", exp: "resetExpires", attempts: "resetAttempts", sentAt: "resetSentAt" },
    };

    const OTP_ERROR = "Invalid or expired code.";

    const rl = createAuthLimiters();

    const bodyOf = (req) =>
      req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};

    const fail = (res, status, message, extra = {}) =>
      res.status(status).json({ success: false, message, ...extra });

    const setSessionCookie = (res, admin) =>
      res.cookie(ADMIN_COOKIE, signAdminToken(admin), adminCookieOptions());

    /* ---------- setup / signup ---------- */

    authRouter.get("/setup-status", async (_req, res, next) => {
      try {
        res.json({ needsSetup: (await Admin.estimatedDocumentCount()) === 0 });
      } catch (error) {
        next(error);
      }
    });

    authRouter.post("/signup", ...rl.signup, async (req, res, next) => {
      try {
        const b = bodyOf(req);
        const name = normalizeName(b.name);
        const email = normalizeEmail(b.email);
        const passwordError = checkPassword(b.password);

        if (!name || !email || passwordError) {
          return fail(res, 400, passwordError || "Enter your name and a valid email address.");
        }

        // Only the very first administrator can self-register.
        if ((await Admin.countDocuments()) > 0) {
          return fail(res, 403, "Admin signup is closed. Ask an existing administrator.");
        }

        try {
          await Admin.create({
            name,
            email,
            passwordHash: await bcrypt.hash(b.password, BCRYPT_ROUNDS),
          });
        } catch (error) {
          if (error?.code === 11000) {
            return fail(res, 403, "Admin signup is closed. Ask an existing administrator.");
          }
          throw error;
        }

        const result = await issueOtp({
          Model: Admin,
          fields: OTP_FIELDS,
          scope: SCOPE,
          purpose: "verify",
          email,
          filter: { verified: false },
        });
        if (result.status === "sent") sendOtpMail({ to: email, otp: result.otp, purpose: "verify" });

        return res.status(201).json({
          success: true,
          message: "Verification code sent to your email.",
          email,
        });
      } catch (error) {
        return next(error);
      }
    });

    authRouter.post("/verify-otp", ...rl.verifyOtp, async (req, res, next) => {
      try {
        const b = bodyOf(req);
        const email = normalizeEmail(b.email);
        const otp = typeof b.otp === "string" ? b.otp.trim() : "";
        if (!email || !isOtp(otp)) return fail(res, 400, OTP_ERROR);

        const result = await consumeOtp({
          Model: Admin,
          fields: OTP_FIELDS,
          scope: SCOPE,
          purpose: "verify",
          email,
          otp,
          filter: { verified: false },
          set: { verified: true },
        });

        if (result.status === "locked") {
          return fail(res, 429, "Too many incorrect codes. Request a new code.");
        }
        if (result.status !== "ok") return fail(res, 400, OTP_ERROR);

        setSessionCookie(res, result.doc);
        return res.json({
          success: true,
          message: "Email verified.",
          admin: { name: result.doc.name, email: result.doc.email },
        });
      } catch (error) {
        return next(error);
      }
    });

    authRouter.post("/resend-otp", ...rl.resendOtp, async (req, res, next) => {
      try {
        const email = normalizeEmail(bodyOf(req).email);
        if (!email) return fail(res, 400, "Enter a valid email address.");

        const result = await issueOtp({
          Model: Admin,
          fields: OTP_FIELDS,
          scope: SCOPE,
          purpose: "verify",
          email,
          filter: { verified: false },
        });

        if (result.status === "cooldown") {
          return fail(res, 429, "Please wait a moment before requesting another code.", {
            retryAfterSeconds: result.retryAfterSeconds,
          });
        }
        if (result.status === "sent") sendOtpMail({ to: email, otp: result.otp, purpose: "verify" });

        return res.json({
          success: true,
          message: "If the account needs verification, a new code has been sent.",
        });
      } catch (error) {
        return next(error);
      }
    });

    /* ---------- login / session ---------- */

    authRouter.post("/login", ...rl.login, async (req, res, next) => {
      try {
        const b = bodyOf(req);
        const email = normalizeEmail(b.email);
        if (!email || !isLoginPassword(b.password)) {
          return fail(res, 400, "Email and password are required.");
        }

        const admin = await Admin.findOne({ email })
          .select("+passwordHash +loginFailures +lockUntil")
          .lean();

        if (admin && isLocked(admin)) {
          return fail(res, 429, "Too many failed attempts. Try again in a few minutes.");
        }

        const ok = await bcrypt.compare(b.password, admin?.passwordHash || DUMMY_HASH);
        if (!admin || !ok) {
          if (admin) await recordLoginFailure(Admin, admin._id);
          return fail(res, 401, "Invalid email or password.");
        }

        if (!admin.verified) return fail(res, 403, "Please verify your email first.");

        if (admin.loginFailures > 0 || admin.lockUntil) {
          await clearLoginFailures(Admin, admin._id);
        }

        setSessionCookie(res, admin);
        return res.json({
          success: true,
          admin: { id: admin._id, name: admin.name, email: admin.email },
        });
      } catch (error) {
        return next(error);
      }
    });

    authRouter.get("/me", requireAdmin, (req, res) => res.json({ admin: req.admin }));

    authRouter.post("/logout", (_req, res) => {
      const { maxAge: _maxAge, ...options } = adminCookieOptions();
      res.clearCookie(ADMIN_COOKIE, options);
      res.json({ success: true, message: "Logged out." });
    });

    /* ---------- password reset ---------- */

    authRouter.post("/forgot-password", ...rl.forgotPassword, async (req, res, next) => {
      try {
        const email = normalizeEmail(bodyOf(req).email);
        if (!email) return fail(res, 400, "Email is required.");

        const result = await issueOtp({
          Model: Admin,
          fields: OTP_FIELDS,
          scope: SCOPE,
          purpose: "reset",
          email,
          filter: { verified: true },
        });
        if (result.status === "sent") sendOtpMail({ to: email, otp: result.otp, purpose: "reset" });

        return res.json({
          success: true,
          message: "If the email is registered and verified, a reset code has been sent.",
        });
      } catch (error) {
        return next(error);
      }
    });

    authRouter.post("/reset-password", ...rl.resetPassword, async (req, res, next) => {
      try {
        const b = bodyOf(req);
        const email = normalizeEmail(b.email);
        const otp = typeof b.otp === "string" ? b.otp.trim() : "";
        // The admin panel historically sends `password`; accept `newPassword` too.
        const newPassword = b.password ?? b.newPassword;

        const passwordError = checkPassword(newPassword);
        if (passwordError) return fail(res, 400, passwordError);
        if (!email || !isOtp(otp)) return fail(res, 400, OTP_ERROR);

        const result = await consumeOtp({
          Model: Admin,
          fields: OTP_FIELDS,
          scope: SCOPE,
          purpose: "reset",
          email,
          otp,
          filter: { verified: true },
          buildSet: async () => ({
            passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
            loginFailures: 0,
          }),
          inc: { tokenVersion: 1 },
        });

        if (result.status === "locked") {
          return fail(res, 429, "Too many incorrect codes. Request a new code.");
        }
        if (result.status !== "ok") return fail(res, 400, OTP_ERROR);

        await Admin.updateOne({ _id: result.doc._id }, { $unset: { lockUntil: 1 } });

        return res.json({ success: true, message: "Password updated. Please log in." });
      } catch (error) {
        return next(error);
      }
    });
