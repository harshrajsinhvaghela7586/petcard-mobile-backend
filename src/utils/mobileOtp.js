import crypto from "node:crypto";
import { config } from "../config/env.js";
import { isOtp } from "./validators.js";

export const OTP_MAX_ATTEMPTS = config.otp.maxAttempts;
export const OTP_RESEND_COOLDOWN_SECONDS = config.otp.resendCooldownSeconds;

export const makeOtp = () =>
  String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

export const otpExpiryDate = () =>
  new Date(Date.now() + config.otp.minutes * 60 * 1000);

/*
 * HMAC with a server-side key, bound to scope + purpose + email.
 * A leaked database cannot be brute-forced offline (a plain SHA-256 of a
 * 6-digit code can), and a code issued for one purpose/account can never
 * be replayed for another.
 */
export const hashOtp = (otp, context) =>
  crypto
    .createHmac("sha256", config.keys.otp)
    .update(`${context}\u0000${otp}`)
    .digest("hex");

export const matchesOtp = (otp, storedHash, context) => {
  if (!isOtp(otp) || typeof storedHash !== "string") return false;

  const a = Buffer.from(hashOtp(otp, context), "hex");
  const b = Buffer.from(storedHash, "hex");

  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
