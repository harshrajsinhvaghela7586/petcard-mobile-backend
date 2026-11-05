import test from "node:test";
import assert from "node:assert/strict";
import { KNOW_PAGE_KEYS, buildKnowPage, buildKnowIndex } from "../src/services/knowService.js";

const TYPES = new Set(["about", "list", "timeline", "tip"]);
const pets = [
  { _id: "1", name: "Milo", type: "dog", breed: "Golden Retriever", birthDate: "2022-03-01", weightKg: 30 },
  { _id: "2", name: "Luna", type: "cat", breed: "Persian", birthDate: "2025-09-01", weightKg: 2 },
  { _id: "3", name: "Coco", type: "rabbit", breed: "Holland Lop", birthDate: "2018-01-01", weightKg: 1.7 },
  { _id: "4", name: "Rex", type: "dog", breed: "", birthDate: null, weightKg: null },
  { _id: "5", name: "Bruno", type: "dog", breed: "Pug", birthDate: "2026-07-01", weightKg: 3 },
];

test("every guide renders valid sections for every species, age and breed", () => {
  for (const pet of pets) {
    for (const key of KNOW_PAGE_KEYS) {
      const page = buildKnowPage(key, pet, "2026-11-01");
      assert.ok(page, `${pet.name}/${key}`);
      assert.ok(page.sections.length >= 2);
      for (const s of page.sections) {
        assert.ok(TYPES.has(s.type), `${key}: bad type ${s.type}`);
        const text = JSON.stringify(s);
        assert.ok(!text.includes("undefined") && !text.includes("NaN"), `${pet.name}/${key} has undefined/NaN: ${text.slice(0, 120)}`);
      }
      assert.match(page.footer, new RegExp(pet.name));
    }
  }
});
test("content depends on the pet", () => {
  const dog = JSON.stringify(buildKnowPage("feeding", pets[0], "2026-11-01"));
  const rabbit = JSON.stringify(buildKnowPage("feeding", pets[2], "2026-11-01"));
  assert.match(dog, /dog/i);
  assert.match(rabbit, /hay/i);
  assert.match(JSON.stringify(buildKnowPage("emergency", pets[1], "2026-11-01")), /urinary/i);
  assert.match(JSON.stringify(buildKnowPage("emergency", pets[2], "2026-11-01")), /stasis/i);
  assert.equal(buildKnowPage("nope", pets[0], "2026-11-01"), null);
  assert.equal(buildKnowIndex(pets[0], "2026-11-01").groups.length, 2);
});
