/*
 * Pre-translates every UI string of the app (data/ui-strings.json) into all supported languages and stores
 * the result in MongoDB, so a language switch is instant and complete (served by GET /api/translations/:lang).
 *
 *   1. in the frontend:  node scripts/extract-ui-strings.cjs     (refreshes data/ui-strings.json)
 *   2. in the backend:   npm run seed:translations               (needs MONGODB_URI and GEMINI_API_KEY)
 *      npm run seed:translations -- hi es                        (only some languages)
 *
 * Safe to re-run: strings that are already translated are skipped.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { translateTexts, LANGS } from "../src/services/translateService.js";
import { config } from "../src/config/env.js";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "ui-strings.json");
if (!process.env.MONGODB_URI) { console.error("MONGODB_URI is not set."); process.exit(1); }
if (!config.gemini.enabled) { console.error("GEMINI_API_KEY is not set."); process.exit(1); }

const strings = JSON.parse(fs.readFileSync(file, "utf8")).filter((t) => t.length <= 600);
const wanted = process.argv.slice(2).filter((a) => LANGS[a]);
const langs = wanted.length ? wanted : Object.keys(LANGS);
const BATCH = 25;

await mongoose.connect(process.env.MONGODB_URI);
for (const lang of langs) {
  let done = 0;
  for (let i = 0; i < strings.length; i += BATCH) {
    const chunk = strings.slice(i, i + BATCH);
    let got = await translateTexts(lang, chunk);
    // One retry for strings the model skipped.
    const missing = chunk.filter((t) => !got[t]);
    if (missing.length) got = { ...got, ...(await translateTexts(lang, missing)) };
    done += chunk.filter((t) => got[t]).length;
    process.stdout.write(`\r${lang}: ${done}/${strings.length}`);
  }
  console.log(`\r${lang}: ${done}/${strings.length} translated${done < strings.length ? " (re-run to fill the rest)" : ""}`);
}
await mongoose.disconnect();
