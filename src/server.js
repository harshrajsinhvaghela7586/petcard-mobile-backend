import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";

import { authRouter } from "./routes/auth.routes.js";
import { mobileAuthRouter } from "./routes/mobileAuthRoutes.js";
import { adminUserRouter } from "./routes/adminUserRoutes.js";

const app = express();

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (_, res) =>
  res.json({ ok: true, name: "PetCard Admin API" })
);

app.use("/api/auth", authRouter);
app.use("/api/mobile-auth", mobileAuthRouter);
app.use("/api/admin/users", adminUserRouter);

const port = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() =>
    app.listen(port, () =>
      console.log(`API listening on ${port}`)
    )
  )
  .catch((err) => {
    console.error("Mongo connection failed", err);
    process.exit(1);
  });