import { config } from "../config/env.js";
import { log } from "../utils/logger.js";

/*
 * One place that talks to Gemini. If the main model is down, overloaded (429) or slow,
 * the next model in GEMINI_FALLBACK_MODELS is tried, so the assistant / translations keep working.
 * Returns the first usable HTTP response (or the last failed one); throws only if every model had a network error.
 */
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

export async function geminiGenerate(body, { fetchImpl = fetch, timeoutMs = config.gemini.timeoutMs } = {}) {
  const models = [config.gemini.model, ...config.gemini.fallbackModels];
  let lastResponse = null;
  let lastError = null;
  for (let i = 0; i < models.length; i += 1) {
    const model = models[i];
    try {
      const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": config.gemini.apiKey },
        body: JSON.stringify(body),
        // Later models get a shorter budget so the whole chain stays within a sane time.
        signal: AbortSignal.timeout(i === 0 ? timeoutMs : Math.min(timeoutMs, 15000)),
      });
      if (response.ok || !RETRYABLE.has(response.status)) return response;
      lastResponse = response;
      log.warn("gemini.model_failed", { model, status: response.status });
    } catch (error) {
      lastError = error;
      log.warn("gemini.model_unreachable", { model, name: error?.name });
    }
  }
  if (lastResponse) return lastResponse;
  throw lastError ?? new Error("Gemini unavailable");
}
