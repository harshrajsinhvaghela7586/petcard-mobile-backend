import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
  signup,
  verifyOtp,
  resendOtp,
  login,
  forgotPassword,
  resetPassword,
} from "../controller/mobileAuthController.js";

export const mobileAuthRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

mobileAuthRouter.use(authLimiter);

mobileAuthRouter.post("/signup", signup);
mobileAuthRouter.post("/verify-otp", verifyOtp);
mobileAuthRouter.post("/resend-otp", resendOtp);
mobileAuthRouter.post("/login", login);
mobileAuthRouter.post("/forgot-password", forgotPassword);
mobileAuthRouter.post("/reset-password", resetPassword);