import crypto from "node:crypto";
import Translation from "../models/Translation.js";
import { config } from "../config/env.js";
import { log, serializeError } from "../utils/logger.js";

export const LANGS = Object.freeze({ hi: "Hindi", es: "Spanish", fr: "French", de: "German", nl: "Dutch", it: "Italian" });
export const MAX_TEXTS = 60;
export const MAX_TEXT_LENGTH = 600;

const hashOf = (text) => crypto.createHash("sha1").update(text).digest("hex");
const memory = new Map(); // `${lang}:${hash}` -> text
const MEMORY_MAX = 20000;

/** Asks Gemini to translate a list of short UI strings. Returns an array of the same length, or null on failure. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function translateWithGemini(lang, texts, fetchImpl = fetch, retries = 0) {
  if (!config.gemini.enabled) return null;
  const prompt =
    `Translate each string in the JSON array into ${LANGS[lang]}. This is the text of a pet-care mobile app. ` +
    `Keep emojis, numbers, units, line breaks and placeholders like {name} exactly as they are. Do not translate pet names, people's names or brand names (PetCard, Paw Points). ` +
    `Keep the same tone and a similar length. Reply with ONLY a JSON array of ${texts.length} strings in the same order.\n\n${JSON.stringify(texts)}`;
  try {
    let response;
    for (let attempt = 0; ; attempt++) {
      try {
      response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.gemini.model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": config.gemini.apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "STRING" } } },
        }),
        signal: AbortSignal.timeout(retries > 0 ? 150000 : Math.max(config.gemini.timeoutMs, 30000)),
      });
      } catch (error) {
        if (attempt < retries) { log.warn("translate.retry_after_error", { attempt: attempt + 1, error: serializeError(error) }); await sleep(5000); continue; }
        throw error;
      }
      // Bulk seeding waits and retries when Gemini says "too many requests"; normal app requests do not wait.
      if ((response.status === 429 || response.status === 503) && attempt < retries) {
        const wait = Number(response.headers?.get?.("retry-after")) * 1000 || Math.min(20000 * (attempt + 1), 90000);
        log.warn("translate.rate_limited_waiting", { seconds: Math.round(wait / 1000), attempt: attempt + 1 });
        await sleep(wait);
        continue;
      }
      break;
    }
    if (!response.ok) {
      const detail = await response.clone().json().catch(() => null);
      log.warn("translate.upstream_error", { status: response.status, model: config.gemini.model, reason: String(detail?.error?.message ?? "").slice(0, 200) });
      return null;
    }
    const body = await response.json();
    const raw = body?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ?? "";
    const parsed = JSON.parse(raw.replace(/^```json|```$/g, "").trim());
    if (!Array.isArray(parsed) || parsed.length !== texts.length || parsed.some((x) => typeof x !== "string" || !x.trim() || x.length > 1500)) return null;
    return parsed;
  } catch (error) {
    log.warn("translate.failed", { error: serializeError(error) });
    return null;
  }
}

/**
 * If a batch comes back unusable (e.g. malformed JSON because of one tricky string), retry it in two halves,
 * down to single strings, so one bad string can never block its neighbours. Returns an array with `null`
 * for strings that still failed.
 */
async function translateSplitting(lang, texts, fetchImpl, retries) {
  const result = await translateWithGemini(lang, texts, fetchImpl, retries);
  if (result) return result;
  if (texts.length === 1) return [null];
  const mid = Math.ceil(texts.length / 2);
  const left = await translateSplitting(lang, texts.slice(0, mid), fetchImpl, retries);
  const right = await translateSplitting(lang, texts.slice(mid), fetchImpl, retries);
  return [...left, ...right];
}

/**
 * translate("fr", ["Hello", ...]) -> { "Hello": "Bonjour", ... }
 * Only strings that could be translated are in the result; the app keeps the English text for the rest.
 */
export async function translateTexts(lang, texts, { fetchImpl, retries = 0 } = {}) {
  if (!LANGS[lang]) return {};
  const unique = [...new Set(texts.map((t) => String(t).trim()).filter((t) => t && t.length <= MAX_TEXT_LENGTH))].slice(0, MAX_TEXTS);
  const out = {};
  const missing = [];

  for (const text of unique) {
    const hit = memory.get(`${lang}:${hashOf(text)}`);
    if (hit) out[text] = hit;
    else missing.push(text);
  }
  if (missing.length) {
    const rows = await Translation.find({ lang, hash: { $in: missing.map(hashOf) } }).select("hash text").lean();
    const byHash = new Map(rows.map((r) => [r.hash, r.text]));
    const stillMissing = [];
    for (const text of missing) {
      const found = byHash.get(hashOf(text));
      if (found) {
        out[text] = found;
        if (memory.size < MEMORY_MAX) memory.set(`${lang}:${hashOf(text)}`, found);
      } else stillMissing.push(text);
    }
    if (stillMissing.length) {
      const result = await translateSplitting(lang, stillMissing, fetchImpl, retries);
      if (result) {
        const docs = stillMissing.map((source, i) => ({ lang, hash: hashOf(source), source, text: result[i]?.trim() })).filter((d) => d.text);
        docs.forEach((d) => { out[d.source] = d.text; if (memory.size < MEMORY_MAX) memory.set(`${lang}:${d.hash}`, d.text); });
        await Translation.bulkWrite(docs.map((d) => ({ updateOne: { filter: { lang, hash: d.hash }, update: { $setOnInsert: d }, upsert: true } })), { ordered: false }).catch(() => {});
      }
    }
  }
  return out;
}

/* Whole language bundle: every string already translated for `lang` -> { "English": "Translated" }. Cached for 60 s. */
const bundleCache = new Map(); // lang -> { at, data }
export async function languageBundle(lang) {
  if (!LANGS[lang]) return null;
  const hit = bundleCache.get(lang);
  if (hit && Date.now() - hit.at < 60_000) return hit.data;
  const rows = await Translation.find({ lang }).select("source text").lean();
  const data = {};
  for (const r of rows) data[r.source] = r.text;
  bundleCache.set(lang, { at: Date.now(), data });
  return data;
}