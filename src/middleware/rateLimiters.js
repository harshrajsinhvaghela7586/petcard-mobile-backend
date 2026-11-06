import rateLimit from "express-rate-limit";
import { normalizeEmail } from "../utils/validators.js";

/*
 * Rate limiting layers:
 *  1. apiLimiter        - broad per-IP ceiling for the whole API
 *  2. per-route IP      - slows scripted abuse from one address
 *  3. per-route email   - stops distributed attacks on ONE account
 *  4. DB-level counters - OTP attempts and login lockout (see otpService / loginGuard)
 *
 * NOTE: the default store is in-process memory. That is correct for a single
 * Render instance. If you scale to several instances, switch the `store`
 * to a shared one (e.g. Redis) so counters are common to all of them.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function build({ windowMs, limit, message, keyGenerator, skip, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests,
    ...(keyGenerator ? { keyGenerator } : {}),
    ...(skip ? { skip } : {}),
    handler: (req, res) => {
      const reset = req.rateLimit?.resetTime;
      const retryAfterSeconds = reset
        ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000))
        : 60;

      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        success: false,
        message,
        code: "RATE_LIMITED",
        retryAfterSeconds,
      });
    },
  });
}

const emailKey = (req) => `email:${normalizeEmail(req.body?.email)}`;
const skipWithoutEmail = (req) => !normalizeEmail(req.body?.email);

const byIp = (opts) => build(opts);
const byEmail = (opts) =>
  build({ ...opts, keyGenerator: emailKey, skip: skipWithoutEmail });

export const apiLimiter = build({
  windowMs: 15 * MINUTE,
  limit: 600,
  message: "Too many requests. Please slow down and try again shortly.",
});

/**
 * Builds a fresh set of auth limiters. Called once for mobile and once for
 * admin so their counters never share state.
 * Each entry is an array: spread it into the route (`...rl.login`).
 */
export function createAuthLimiters() {
  return {
    signup: [
      byIp({ windowMs: HOUR, limit: 10, message: "Too many sign-up attempts. Try again later." }),
      byEmail({ windowMs: HOUR, limit: 4, message: "Too many sign-up attempts for this email. Try again later." }),
    ],
    verifyOtp: [
      byIp({ windowMs: 15 * MINUTE, limit: 30, message: "Too many verification attempts. Try again later." }),
      byEmail({ windowMs: 15 * MINUTE, limit: 12, message: "Too many verification attempts. Request a new code." }),
    ],
    resendOtp: [
      byIp({ windowMs: HOUR, limit: 15, message: "Too many code requests. Try again later." }),
      byEmail({ windowMs: HOUR, limit: 6, message: "Too many code requests for this email. Try again later." }),
    ],
    login: [
      byIp({ windowMs: 15 * MINUTE, limit: 40, skipSuccessfulRequests: true, message: "Too many sign-in attempts. Try again later." }),
      byEmail({ windowMs: 15 * MINUTE, limit: 10, skipSuccessfulRequests: true, message: "Too many sign-in attempts for this account. Try again later." }),
    ],
    forgotPassword: [
      byIp({ windowMs: HOUR, limit: 10, message: "Too many reset requests. Try again later." }),
      byEmail({ windowMs: HOUR, limit: 4, message: "Too many reset requests for this email. Try again later." }),
    ],
    resetPassword: [
      byIp({ windowMs: 15 * MINUTE, limit: 30, message: "Too many attempts. Try again later." }),
      byEmail({ windowMs: 15 * MINUTE, limit: 12, message: "Too many attempts. Request a new code." }),
    ],
    refresh: [
      byIp({ windowMs: 15 * MINUTE, limit: 90, message: "Too many session requests. Try again later." }),
    ],
    changePassword: [
      build({
        windowMs: 15 * MINUTE,
        limit: 6,
        message: "Too many password change attempts. Try again later.",
        // Runs after requireUser, so req.user is always set.
        keyGenerator: (req) => `user:${req.user?.id ?? "anonymous"}`,
        skip: (req) => !req.user,
      }),
    ],
  };
}
