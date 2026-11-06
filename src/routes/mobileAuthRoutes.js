import { Router } from "express";

import {
  signup,
  verifyOtp,
  resendOtp,
  login,
  googleSignIn,
  refresh,
  logout,
  logoutAll,
  me,
  changePassword,
  forgotPassword,
  resetPassword,
} from "../controller/mobileAuthController.js";
import { requireUser } from "../middleware/requireUser.js";
import { createAuthLimiters } from "../middleware/rateLimiters.js";

export const mobileAuthRouter = Router();

const rl = createAuthLimiters();

/* Public */
mobileAuthRouter.post("/signup", ...rl.signup, signup);
mobileAuthRouter.post("/verify-otp", ...rl.verifyOtp, verifyOtp);
mobileAuthRouter.post("/resend-otp", ...rl.resendOtp, resendOtp);
mobileAuthRouter.post("/login", ...rl.login, login);
mobileAuthRouter.post("/google", ...rl.login, googleSignIn);
mobileAuthRouter.post("/refresh", ...rl.refresh, refresh);
mobileAuthRouter.post("/logout", ...rl.refresh, logout);
mobileAuthRouter.post("/forgot-password", ...rl.forgotPassword, forgotPassword);
mobileAuthRouter.post("/reset-password", ...rl.resetPassword, resetPassword);

/* Authenticated */
mobileAuthRouter.get("/me", requireUser, me);
mobileAuthRouter.post("/logout-all", requireUser, logoutAll);
mobileAuthRouter.post("/change-password", requireUser, ...rl.changePassword, changePassword);
