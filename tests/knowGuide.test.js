import test from "node:test";
import assert from "node:assert/strict";
import { BREEDS, PET_TYPES } from "../src/config/breeds.js";
import { GUIDE_PAGE_KEYS, allGuides, applyPetName, buildGuide, isValidSections } from "../src/services/KnowGuideContent.js";

const guides = allGuides();

test("every page has a generic guide and a guide for every breed", () => {
  const breeds = Object.values(BREEDS).flat().length;
  assert.equal(guides.length, GUIDE_PAGE_KEYS.length * (PET_TYPES.length + breeds));
  for (const species of PET_TYPES) {
    for (const key of GUIDE_PAGE_KEYS) {
      assert.ok(buildGuide(key, species, ""), `${key}/${species} generic`);
      for (const b of BREEDS[species]) assert.ok(buildGuide(key, species, b.key), `${key}/${species}/${b.key}`);
    }
  }
});

test("every guide is valid, complete and has no leftovers", () => {
  for (const g of guides) {
    const id = `${g.pageKey}/${g.species}/${g.breed || "generic"}`;
    assert.ok(isValidSections(g.sections), id);
    const text = JSON.stringify(g);
    assert.ok(!/undefined|NaN|\[object/.test(text), `${id} has a leftover`);
    assert.ok(!/\bMilo\b/.test(text), `${id} still says Milo`);
    assert.match(text, /\{\{petName\}\}/, `${id} never uses the pet name`);
  }
});

test("cats and rabbits get no dog-only advice", () => {
  for (const g of guides.filter((x) => x.species !== "dog")) {
    const text = JSON.stringify(g.sections);
    assert.ok(!/DHPP|kennel cough|\bleash\b|Bordetella/i.test(text), `${g.pageKey}/${g.species}/${g.breed}`);
  }
  for (const g of guides.filter((x) => x.species === "rabbit" && x.pageKey === "vaccination_guide")) {
    assert.ok(!/FVRCP/.test(JSON.stringify(g.sections)));
  }
});

test("a breed guide differs from the generic guide", () => {
  for (const species of PET_TYPES) {
    for (const key of GUIDE_PAGE_KEYS) {
      const generic = JSON.stringify(buildGuide(key, species, "").sections);
      for (const b of BREEDS[species]) assert.notEqual(JSON.stringify(buildGuide(key, species, b.key).sections), generic, `${key}/${b.key}`);
    }
  }
});

test("breed facts show up", () => {
  const text = (key, species, breed) => JSON.stringify(buildGuide(key, species, breed).sections);
  assert.match(text("common_health_issues", "dog", "japanese-akita"), /Bloat/);
  assert.match(text("common_health_issues", "cat", "persian"), /Polycystic/);
  assert.match(text("common_health_issues", "rabbit", "newzealand-bunny"), /Sore hocks/);
  assert.match(text("ear_cleaning", "rabbit", "holland-lop"), /Lop ears/);
  assert.match(text("bathing", "rabbit", "holland-lop"), /Never/);
});

test("applyPetName fills the name everywhere", () => {
  const out = applyPetName(buildGuide("daily_routine", "dog", "border-collie").sections, "Zoe");
  const text = JSON.stringify(out);
  assert.ok(text.includes("Zoe") && !text.includes("{{petName}}"));
});