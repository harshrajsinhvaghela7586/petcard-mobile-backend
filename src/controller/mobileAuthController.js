import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import MobileUser from "../models/MobileUser.js";

import {
  makeOtp,
  hashOtp,
  matchesOtp,
  sendOtpEmail,
} from "../utils/mobileOtp.js";

const expiry = () =>
  new Date(
    Date.now() +
      Number(process.env.MOBILE_OTP_MINUTES || 10) * 60 * 1000
  );

const cleanEmail = (email) =>
  String(email || "").trim().toLowerCase();

const emailValid = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const sendError = (res, status, message) =>
  res.status(status).json({
    success: false,
    message,
  });

// Signup
export const signup = async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = cleanEmail(req.body.email);
    const phone = String(req.body.phone || "").trim();
    const password = String(req.body.password || "");

    if (!name || !emailValid(email) || password.length < 8) {
      return sendError(
        res,
        400,
        "Enter your name, a valid email, and a password with at least 8 characters."
      );
    }

    const existingUser = await MobileUser.exists({
      email,
      isEmailVerified: true,
    });

    if (existingUser) {
      return sendError(
        res,
        409,
        "An account with this email already exists."
      );
    }

    const otp = makeOtp();
    const passwordHash = await bcrypt.hash(password, 12);

    let user = await MobileUser.findOne({ email });

    if (!user) {
      user = new MobileUser({
        name,
        email,
        phone,
        passwordHash,
      });
    } else {
      Object.assign(user, {
        name,
        phone,
        passwordHash,
      });
    }

    user.isEmailVerified = false;
    user.emailOtpHash = hashOtp(otp);
    user.emailOtpExpiresAt = expiry();

    await user.save();

    await sendOtpEmail({
      to: email,
      otp,
    });

    return res.status(201).json({
      success: true,
      message: "Verification code sent to your email.",
      email,
    });
  } catch (error) {
    next(error);
  }
};

// Verify signup OTP
export const verifyOtp = async (req, res, next) => {
  try {
    const email = cleanEmail(req.body.email);
    const otp = String(req.body.otp || "").trim();

    const user = await MobileUser.findOne({ email }).select(
      "+emailOtpHash +emailOtpExpiresAt"
    );

    if (
      !user ||
      !user.emailOtpHash ||
      !user.emailOtpExpiresAt ||
      user.emailOtpExpiresAt < new Date() ||
      !matchesOtp(otp, user.emailOtpHash)
    ) {
      return sendError(
        res,
        400,
        "The code is invalid or expired. Request a new code and try again."
      );
    }

    user.isEmailVerified = true;
    user.emailOtpHash = undefined;
    user.emailOtpExpiresAt = undefined;

    await user.save();

    return res.json({
      success: true,
      message: "Email verified. You can now sign in.",
    });
  } catch (error) {
    next(error);
  }
};

// Resend signup OTP
export const resendOtp = async (req, res, next) => {
  try {
    const email = cleanEmail(req.body.email);

    const user = await MobileUser.findOne({ email });

    if (!user || user.isEmailVerified) {
      return sendError(
        res,
        400,
        "We couldn't resend a code for this email. Check the address or sign in."
      );
    }

    const otp = makeOtp();

    user.emailOtpHash = hashOtp(otp);
    user.emailOtpExpiresAt = expiry();

    await user.save();

    await sendOtpEmail({
      to: email,
      otp,
    });

    return res.json({
      success: true,
      message: "A new verification code has been sent.",
    });
  } catch (error) {
    next(error);
  }
};

// Login
export const login = async (req, res, next) => {
  try {
    const email = cleanEmail(req.body.email);
    const password = String(req.body.password || "");

    const user = await MobileUser.findOne({ email }).select(
      "+passwordHash"
    );

    if (
      !user ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      return sendError(
        res,
        401,
        "Incorrect email or password."
      );
    }

    if (!user.isEmailVerified) {
      return sendError(
        res,
        403,
        "Please verify your email before signing in."
      );
    }

    if (!process.env.JWT_SECRET) {
      return sendError(
        res,
        500,
        "Authentication is not configured."
      );
    }

    const token = jwt.sign(
      {
        sub: user._id.toString(),
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "30d",
      }
    );

    return res.json({
      success: true,
      message: "Signed in successfully.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Forgot password
export const forgotPassword = async (req, res, next) => {
  try {
    const email = cleanEmail(req.body.email);

    const user = await MobileUser.findOne({ email });

    // Generic response prevents account enumeration.
    if (user && user.isEmailVerified) {
      const otp = makeOtp();

      user.resetOtpHash = hashOtp(otp);
      user.resetOtpExpiresAt = expiry();

      await user.save();

      await sendOtpEmail({
        to: email,
        otp,
        purpose: "reset",
      });
    }

    return res.json({
      success: true,
      message:
        "If a verified account exists for this email, a reset code has been sent.",
    });
  } catch (error) {
    next(error);
  }
};

// Reset password
export const resetPassword = async (req, res, next) => {
  try {
    const email = cleanEmail(req.body.email);
    const otp = String(req.body.otp || "").trim();
    const newPassword = String(req.body.newPassword || "");

    if (newPassword.length < 8) {
      return sendError(
        res,
        400,
        "Password must be at least 8 characters."
      );
    }

    const user = await MobileUser.findOne({ email }).select(
      "+resetOtpHash +resetOtpExpiresAt"
    );

    if (
      !user ||
      !user.resetOtpHash ||
      !user.resetOtpExpiresAt ||
      user.resetOtpExpiresAt < new Date() ||
      !matchesOtp(otp, user.resetOtpHash)
    ) {
      return sendError(
        res,
        400,
        "The code is invalid or expired. Request a new code."
      );
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.resetOtpHash = undefined;
    user.resetOtpExpiresAt = undefined;

    await user.save();

    return res.json({
      success: true,
      message: "Password reset successfully. Please sign in.",
    });
  } catch (error) {
    next(error);
  }
};