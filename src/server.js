import mongoose from "mongoose";

import { config, configWarnings } from "./config/env.js";
import { createApp } from "./app.js";
import { verifyMailTransport } from "./services/mailer.js";
import { startJobs } from "./jobs/healthReminders.js";
import { log, serializeError } from "./utils/logger.js";

for (const warning of configWarnings) log.warn("config.warning", { warning });

process.on("unhandledRejection", (reason) => {
  log.error("unhandled_rejection", { error: serializeError(reason) });
});

process.on("uncaughtException", (error) => {
  log.error("uncaught_exception", { error: serializeError(error) });
  process.exit(1);
});

async function start() {
  await mongoose.connect(config.mongoUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5_000,
    socketTimeoutMS: 45_000,
    autoIndex: process.env.MONGO_AUTO_INDEX !== "false",
  });

  const app = createApp();
  const server = app.listen(config.port, () => {
    log.info("server.listening", { port: config.port, env: config.nodeEnv });
  });

  verifyMailTransport();
  const stopJobs = config.jobs.enabled ? startJobs() : () => {};

  // Render sends SIGTERM on deploys: stop accepting requests, then close the DB.
  const shutdown = (signal) => {
    log.info("server.shutdown", { signal });
    stopJobs();
    server.close(async () => {
      await mongoose.disconnect().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((error) => {
  log.error("startup.failed", { error: serializeError(error) });
  process.exit(1);
});
