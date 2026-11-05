import test from "node:test";
import assert from "node:assert/strict";
process.env.JWT_SECRET ??= "x".repeat(40);
process.env.MONGODB_URI ??= "mongodb://localhost/test";
process.env.NODE_ENV = "test";
const { LANGUAGE_CODES } = await import("../src/config/countries.js");
const { LANGS } = await import("../src/services/translateService.js");
const { buildSystemPrompt } = await import("../src/services/assistantService.js");

test("every language the app offers can be saved on the account", () => {
  for (const code of ["en", ...Object.keys(LANGS)]) assert.ok(LANGUAGE_CODES.includes(code), `${code} missing from account languages`);
});
test("the AI assistant knows every app language", () => {
  assert.match(buildSystemPrompt({ name: "Milo", type: "dog", ageLabel: "2 years" }, "nl"), /Reply in Dutch/);
  assert.match(buildSystemPrompt({ name: "Milo", type: "dog", ageLabel: "2 years" }, "it"), /Reply in Italian/);
});
