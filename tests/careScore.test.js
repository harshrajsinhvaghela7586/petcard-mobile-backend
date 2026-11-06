import test from "node:test";
import assert from "node:assert/strict";
import { computeGoals, scoreDay, nutritionScore, careLabel, careTip } from "../src/services/careScore.js";

const TODAY = "2026-11-01";

test("a fresh day scores 0 and says so", () => {
  const goals = computeGoals({ type: "dog", breed: "Hungarian Vizsla", weightKg: 30, birthDate: "2022-01-01" }, TODAY);
  const r = scoreDay({}, goals);
  assert.equal(r.score, 0);
  assert.equal(r.label.key, "not_started");
  assert.deepEqual(r.breakdown, { nutrition: 0, hydration: 0, activity: 0 });
});
test("goals follow species, weight, age and breed", () => {
  const lab = computeGoals({ type: "dog", breed: "Border Collie", weightKg: 30, birthDate: "2020-01-01" }, TODAY);
  const pug = computeGoals({ type: "dog", breed: "Other", weightKg: 8, birthDate: "2020-01-01" }, TODAY);
  const puppy = computeGoals({ type: "dog", breed: "Border Collie", weightKg: 8, birthDate: "2026-08-01" }, TODAY);
  const cat = computeGoals({ type: "cat", breed: "Persian", weightKg: 4, birthDate: "2020-01-01" }, TODAY);
  const rabbit = computeGoals({ type: "rabbit", breed: "Holland Lop", weightKg: 1.7, birthDate: "2024-01-01" }, TODAY);
  assert.ok(lab.foodGrams > pug.foodGrams * 2);
  assert.ok(lab.activityMin > pug.activityMin);
  assert.ok(puppy.activityMin < lab.activityMin);
  assert.equal(puppy.mealsPerDay, 4);
  assert.ok(cat.waterMl >= 150 && cat.waterMl <= 300);
  assert.ok(rabbit.foodGrams >= 20 && rabbit.foodGrams <= 40);
  assert.equal(lab.sources.food, "auto");
});
test("owner goals override and weight falls back to the breed average", () => {
  const g = computeGoals({ type: "dog", breed: "Border Collie", trackerGoals: { foodGrams: 222, waterMl: 600, activityMin: 40 } }, TODAY);
  assert.deepEqual([g.foodGrams, g.waterMl, g.activityMin, g.sources.food], [222, 600, 40, "custom"]);
  const unknown = computeGoals({ type: "dog", breed: "", weightKg: null }, TODAY);
  assert.equal(unknown.basis.weightAssumed, true);
  assert.ok(unknown.foodGrams > 0);
});
test("scoring: full day, partial day, overfeeding", () => {
  const goals = { foodGrams: 300, waterMl: 600, activityMin: 60 };
  assert.equal(scoreDay({ food: 300, water: 600, activity: 60 }, goals).score, 100);
  const half = scoreDay({ food: 150, water: 300, activity: 30 }, goals);
  assert.equal(half.score, 50);
  assert.equal(half.remaining.foodGrams, 150);
  assert.ok(nutritionScore(600, 300) < 40);
  assert.equal(nutritionScore(330, 300), 100);
  assert.equal(careLabel(90, true).key, "great");
  assert.equal(careLabel(10, true).key, "low");
});
test("tip points at the weakest area", () => {
  const goals = { foodGrams: 300, waterMl: 600, activityMin: 60 };
  const r = scoreDay({ food: 300, water: 100, activity: 60 }, goals);
  assert.match(careTip("Milo", r, goals), /water/i);
});
