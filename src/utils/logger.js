/*
 * Tiny structured logger with automatic redaction.
 * Never log raw request bodies, headers or full error objects.
 */

const SENSITIVE_KEY = /(pass(word)?|otp|token|secret|authorization|cookie|hash|api[_-]?key|credential)/i;
const MAX_DEPTH = 4;
const MAX_STRING = 300;

function redact(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value !== "object") return value;
  if (value instanceof Error) return serializeError(value);
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redact(val, depth + 1);
  }
  return out;
}

export function serializeError(error) {
  if (!error || typeof error !== "object") return { message: String(error).slice(0, MAX_STRING) };
  return {
    name: error.name,
    code: error.code,
    message: String(error.message || "").slice(0, MAX_STRING),
  };
}

export function maskEmail(email) {
  const value = String(email || "");
  const at = value.lastIndexOf("@");
  if (at < 1) return "***";
  return `${value[0]}***${value.slice(at)}`;
}

function write(level, message, meta) {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...(meta ? redact(meta) : {}),
  });
  (level === "error" ? process.stderr : process.stdout).write(`${line}\n`);
}

export const log = {
  info: (message, meta) => write("info", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  error: (message, meta) => write("error", message, meta),
};
