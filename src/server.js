import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";

import { authRouter } from "./routes/auth.routes.js";
import { mobileAuthRouter } from "./routes/mobileAuthRoutes.js";
import { adminUserRouter } from "./routes/adminUserRoutes.js";

const app = express();

// Render reverse proxy
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  cors({
    origin: process.env.ADMIN_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);

// Smaller responses = faster on mobile networks.
app.use(compression());

app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.get("/api/health", (_, res) =>
  res.json({
    ok: true,
    name: "PetCard Admin API",
  })
);

// Admin
app.use("/api/auth", authRouter);
app.use("/api/admin/users", adminUserRouter);

// Mobile
app.use("/api/mobile-auth", mobileAuthRouter);


const port = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() =>
    app.listen(port, () => {
      console.log(`API listening on ${port}`);
    })
  )
  .catch((err) => {
    console.error("Mongo connection failed", err);
    process.exit(1);
  });
