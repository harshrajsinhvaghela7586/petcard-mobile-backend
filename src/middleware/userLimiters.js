import rateLimit from "express-rate-limit";

/*
 * Per-user rate limits for authenticated routes (they run AFTER requireUser, so
 * the key is the user id: behind NAT/Render's shared IPs, users never throttle
 * each other). In-memory store: fine for one instance, see rateLimiters.js.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const build = ({ windowMs, limit, message }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => `user:${req.user?.id ?? "anonymous"}`,
    handler: (req, res) => {
      const reset = req.rateLimit?.resetTime;
      const retryAfterSeconds = reset ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000)) : 60;
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({ success: false, message, code: "RATE_LIMITED", retryAfterSeconds });
    },
  });

/** Everything authenticated: generous, only stops runaway clients. */
export const userApiLimiter = build({
  windowMs: MINUTE,
  limit: 240,
  message: "You are doing that too quickly. Please wait a moment.",
});

export const writeLimiter = build({
  windowMs: MINUTE,
  limit: 60,
  message: "You are doing that too quickly. Please wait a moment.",
});

export const uploadSignLimiter = build({
  windowMs: HOUR,
  limit: 40,
  message: "Too many uploads. Try again later.",
});

export const inviteCreateLimiter = build({
  windowMs: HOUR,
  limit: 15,
  message: "Too many invites created. Try again later.",
});

export const inviteRedeemLimiter = build({
  windowMs: 15 * MINUTE,
  limit: 15,
  message: "Too many attempts. Try again later.",
});

export const referralLimiter = build({
  windowMs: HOUR,
  limit: 8,
  message: "Too many attempts. Try again later.",
});

export const accountDeleteLimiter = build({
  windowMs: 15 * MINUTE,
  limit: 5,
  message: "Too many attempts. Try again later.",
});

/** Gemini calls cost money: a normal chat never needs more than this. */
export const assistantLimiter = build({
  windowMs: 10 * MINUTE,
  limit: 30,
  message: "You are asking very quickly. Please wait a few minutes and try again.",
});

/** Screen text is translated in batches and cached on the server, so a normal user needs few of these. */
export const translateLimiter = build({
  windowMs: 10 * MINUTE,
  limit: 120,
  message: "Too many translation requests. Please wait a few minutes.",
});


/** Public UI translation is also used before login; rate-limit by IP rather than a shared anonymous user key. */
export const publicTranslateLimiter = rateLimit({
  windowMs: 10 * MINUTE,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many translation requests. Please wait a few minutes.", code: "RATE_LIMITED" },
});

/** Rewriting a guide with AI is slow: results are cached per species + breed, so real use stays far below this. */
export const knowAdaptLimiter = build({
  windowMs: 10 * MINUTE,
  limit: 40,
  message: "Too many guide requests. Please wait a few minutes.",
});

/** Applies the write limiter to POST/PUT/PATCH/DELETE only. */
export const limitWrites = (req, res, next) =>
  req.method === "GET" || req.method === "HEAD" ? next() : writeLimiter(req, res, next);
