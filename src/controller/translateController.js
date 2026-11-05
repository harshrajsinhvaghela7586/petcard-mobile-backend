import { asyncHandler, ok, ApiError } from "../utils/http.js";
import { adaptKnowPage } from "../services/knowAdaptService.js";
import { translateTexts, languageBundle, LANGS, MAX_TEXTS, MAX_TEXT_LENGTH } from "../services/translateService.js";

/* POST /api/me/translate   { lang: "fr", texts: ["Good morning", ...] }  ->  { lang, translations: { "Good morning": "Bonjour" } } */
export const translate = asyncHandler(async (req, res) => {
  const { lang, texts } = req.body ?? {};
  if (typeof lang !== "string" || !LANGS[lang]) throw new ApiError(400, "Unsupported language.", { code: "VALIDATION_ERROR" });
  if (!Array.isArray(texts) || texts.length === 0 || texts.length > MAX_TEXTS || texts.some((t) => typeof t !== "string" || t.length > MAX_TEXT_LENGTH)) {
    throw new ApiError(400, `Send 1 to ${MAX_TEXTS} texts of up to ${MAX_TEXT_LENGTH} characters.`, { code: "VALIDATION_ERROR" });
  }
  ok(res, { lang, translations: await translateTexts(lang, texts) });
});

/* POST /api/me/know-adapt   { pageKey, petType, breed, sections }  ->  { sections } | { sections: null } */
export const knowAdapt = asyncHandler(async (req, res) => {
  const { pageKey, petType, breed, sections } = req.body ?? {};
  if (typeof pageKey !== "string" || typeof petType !== "string") throw new ApiError(400, "pageKey and petType are required.", { code: "VALIDATION_ERROR" });
  const out = await adaptKnowPage({ pageKey, petType, breed: typeof breed === "string" ? breed.slice(0, 60) : "", base: sections });
  res.setHeader("Cache-Control", "private, max-age=3600");
  ok(res, { sections: out });
});

/* GET /api/translations/:lang  ->  { lang, translations: { "English": "Translated", ... } }   (public, so login/signup can use it) */
export const translationBundle = asyncHandler(async (req, res) => {
  const lang = String(req.params.lang || "").toLowerCase();
  if (!LANGS[lang]) throw new ApiError(400, "Unsupported language.", { code: "VALIDATION_ERROR" });
  res.setHeader("Cache-Control", "public, max-age=300");
  ok(res, { lang, translations: await languageBundle(lang) });
});
