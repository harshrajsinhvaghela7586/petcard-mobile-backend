import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";

import { config } from "./config/env.js";
import { requestContext, noStore, privateRevalidate, originGuard } from "./middleware/security.js";
import { trackWrites } from "./middleware/trackWrites.js";
import { apiLimiter } from "./middleware/rateLimiters.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

import { authRouter } from "./routes/auth.routes.js";
import { mobileAuthRouter } from "./routes/mobileAuthRoutes.js";
import { requireUser } from "./middleware/requireUser.js";
import { userApiLimiter, limitWrites, publicTranslateLimiter } from "./middleware/userLimiters.js";
import { meRouter } from "./routes/me.routes.js";
import { petsRouter } from "./routes/pets.routes.js";
import {
  catalogRouter,
  uploadsRouter,
  guardianInvitesRouter,
  guardianRequestsRouter,
} from "./routes/misc.routes.js";
import { adminManagementRouter } from "./routes/adminManagementRoutes.js";
import { publicQrRouter } from "./routes/publicQr.routes.js";
import { contactRouter } from "./routes/contact.routes.js";
import { meta } from "./controller/meController.js";
import { translate, translationBundle } from "./controller/translateController.js";

export function createApp() {
  const app = express();

  // Render terminates TLS in front of the app: trust exactly one proxy hop.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(requestContext);
  app.use(helmet());
const normalizeOrigin = (value) => {
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
};

const allowedOrigins = new Set(
  config.allowedOrigins
    .map(normalizeOrigin)
    .filter(Boolean)
);

// Admin frontend
allowedOrigins.add("https://petcard-mobile-admin.vercel.app");

app.use(
  cors({
    origin(origin, callback) {
      // Native mobile apps and server-to-server requests
      // generally don't send an Origin header.
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = normalizeOrigin(origin);

      if (normalizedOrigin && allowedOrigins.has(normalizedOrigin)) {
        return callback(null, true);
      }

      console.warn("CORS blocked origin:", origin);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With"
    ],
    maxAge: 600,
  })
);

  app.use(compression());
  app.use(express.json({ limit: "20kb", strict: true }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({
      ok: dbUp,
      name: "PetCard API",
      db: dbUp ? "up" : "down",
    });
  });

  app.use("/api", apiLimiter);
  app.get("/api/meta", meta);
  // Public and IP-rate-limited so language selection works on login/signup screens too.
  app.post("/api/translate", publicTranslateLimiter, translate);
  app.get("/api/translations/:lang", publicTranslateLimiter, translationBundle);
  app.use("/api/public", publicQrRouter);
  app.use("/api/contact", contactRouter);

  // Admin (cookie session)
  app.use("/api/auth", noStore, originGuard, authRouter);
  app.use("/api/admin", noStore, originGuard, adminManagementRouter);

  // Mobile (bearer tokens)
  app.use("/api/mobile-auth", noStore, mobileAuthRouter);

  // Authenticated app API: sign-in check first, then per-user rate limits.
  const authed = [privateRevalidate, requireUser, trackWrites, userApiLimiter, limitWrites];
  app.use("/api/me", ...authed, meRouter);
  app.use("/api/pets", ...authed, petsRouter);
  app.use("/api/catalog", privateRevalidate, requireUser, userApiLimiter, catalogRouter);
  app.use("/api/uploads", ...authed, uploadsRouter);
  app.use("/api/guardian-invites", ...authed, guardianInvitesRouter);
  app.use("/api/guardian-requests", ...authed, guardianRequestsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
