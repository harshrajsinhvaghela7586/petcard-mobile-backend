import crypto from "node:crypto";
import KnowAdapted from "../models/KnowAdapted.js";
import { config } from "../config/env.js";
import { geminiGenerate } from "./geminiClient.js";
import { log, serializeError } from "../utils/logger.js";
import { findBreed, PET_TYPES } from "../config/breeds.js";

/*
 * The app ships each Know page written for a dog named "Milo". This service rewrites that page for the pet's
 * species and breed (cat, rabbit, Vizsla, Persian, ...) with Gemini, validates the result, and caches it in MongoDB
 * so the same page is only generated once per species + breed for everyone.
 */
const SECTION_TYPES = new Set(["about", "list", "timeline", "tip"]);
const MAX_BASE_BYTES = 40_000;
const inflight = new Map();

export const isValidSections = (v) =>
  Array.isArray(v) && v.length >= 1 && v.length <= 12 && v.every((s) => {
    if (!s || !SECTION_TYPES.has(s.type)) return false;
    if (s.type === "about") return typeof s.heading === "string" && typeof s.body === "string";
    if (s.type === "tip") return typeof s.title === "string" && typeof s.body === "string";
    if (s.type === "list") return typeof s.heading === "string" && Array.isArray(s.items) && s.items.length >= 1 && s.items.every((i) => typeof i?.title === "string");
    return typeof s.heading === "string" && Array.isArray(s.steps) && s.steps.length >= 1 && s.steps.every((i) => typeof i?.title === "string" && typeof i?.tag === "string");
  });

function promptFor({ pageKey, petType, breedLabel, base }) {
  const who = breedLabel ? `a ${breedLabel} (${petType})` : `a ${petType}`;
  return (
    `Below is the JSON of one pet-care guide page from a mobile app. It was written for a DOG named "Milo".\n` +
    `Rewrite it so it is accurate and genuinely useful for ${who}. Page: ${pageKey}.\n` +
    `Rules:\n- Keep EXACTLY the same JSON structure: same number and order of sections, same "type", "tone", "icon", "tag" and "action" values. Change only the human-readable text (heading, body, title, text, label, value, intro).\n` +
    `- Keep the pet's name as the literal word "Milo" wherever it appears; the app replaces it.\n` +
    `- ${petType === "dog" ? "" : `Remove dog-only advice (walks, leashes, kennel cough, etc.) and replace it with advice that is right for a ${petType}. `}` +
    `${breedLabel ? `Where useful, add ${breedLabel}-specific facts (coat, energy, size, common health concerns, temperament). ` : ""}` +
    `Facts must be correct and conservative. No medicine doses. Never promise a diagnosis; tell owners to ask a vet when unsure.\n` +
    `- Keep each text short (same length as the original). Use no markdown.\n` +
    `- Reply with ONLY the rewritten JSON array.\n\n${JSON.stringify(base)}`
  );
}

async function callGemini(prompt) {
  if (!config.gemini.enabled) return null;
  try {
    const response = await geminiGenerate(
      { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 8192, responseMimeType: "application/json" } },
      { timeoutMs: Math.max(config.gemini.timeoutMs, 45000) }
    );
    if (!response.ok) { log.warn("knowadapt.upstream_error", { status: response.status }); return null; }
    const body = await response.json();
    const raw = body?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ?? "";
    return JSON.parse(raw.replace(/^```json|```$/g, "").trim());
  } catch (error) {
    log.warn("knowadapt.failed", { error: serializeError(error) });
    return null;
  }
}

/** Returns adapted sections, or null (the app then keeps its built-in text). */
export async function adaptKnowPage({ pageKey, petType, breed, base }) {
  if (!PET_TYPES.includes(petType) || !/^[a-z_]{2,40}$/.test(pageKey)) return null;
  if (!isValidSections(base) || Buffer.byteLength(JSON.stringify(base)) > MAX_BASE_BYTES) return null;

  const known = findBreed(petType, breed);
  /* A plain dog page is already right for an unknown dog breed. */
  if (petType === "dog" && !known) return null;
  const breedKey = known ? known.label.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "";
  const baseHash = crypto.createHash("sha1").update(JSON.stringify(base)).digest("hex").slice(0, 10);
  const key = `${pageKey}:${petType}:${breedKey || "general"}:${baseHash}`;

  const cached = await KnowAdapted.findOne({ key }).select("sections").lean();
  if (cached?.sections?.length) return cached.sections;

  if (inflight.has(key)) return inflight.get(key);
  const job = (async () => {
    const result = await callGemini(promptFor({ pageKey, petType, breedLabel: known?.label ?? "", base }));
    if (!isValidSections(result) || result.length !== base.length) return null;
    await KnowAdapted.updateOne({ key }, { $set: { key, pageKey, petType, breed: breedKey, sections: result } }, { upsert: true }).catch(() => {});
    return result;
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}
