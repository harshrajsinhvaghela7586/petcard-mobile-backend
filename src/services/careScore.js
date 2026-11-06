import { breedProfile, ageInfo } from "../config/breeds.js";

/*
 * Pure functions (no database): daily goals and the Care Score.
 * Care Score (0-100) = Nutrition 35% + Hydration 30% + Activity 35%.
 * Every day starts at 0; only that day's logs count.
 */
export const SCORE_WEIGHTS = Object.freeze({ nutrition: 0.35, hydration: 0.3, activity: 0.35 });

const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);
const roundTo = (n, step) => Math.max(step, Math.round(n / step) * step);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

const DOG_FACTOR = { baby: 3.0, young: 2.0, adult: 1.6, senior: 1.4, unknown: 1.6 };
const CAT_FACTOR = { baby: 2.5, young: 1.8, adult: 1.2, senior: 1.1, unknown: 1.2 };
const ENERGY_ADJUST = { low: 0.9, medium: 1, high: 1.1, very_high: 1.2 };
const DEFAULT_WEIGHT = { dog: 12, cat: 4, rabbit: 2 };

function pickWeight(pet, profile) {
  if (pet.weightKg && pet.weightKg > 0) return { kg: pet.weightKg, assumed: false };
  const [lo, hi] = profile.kg || [];
  if (lo && hi) return { kg: Math.round(((lo + hi) / 2) * 10) / 10, assumed: true };
  return { kg: DEFAULT_WEIGHT[pet.type] ?? 10, assumed: true };
}

/** Daily targets for one pet. Owner-set `trackerGoals` always win. */
export function computeGoals(pet, today) {
  const type = pet.type === "cat" || pet.type === "rabbit" ? pet.type : "dog";
  const profile = breedProfile(type, pet.breed);
  const age = ageInfo(type, pet.birthDate, today, profile.size);
  const weight = pickWeight({ ...pet, type }, profile);
  const stage = age.stage;
  const custom = pet.trackerGoals || {};

  let food;
  let water;
  let meals;
  if (type === "dog") {
    const rer = 70 * weight.kg ** 0.75;
    food = (rer * DOG_FACTOR[stage] * (ENERGY_ADJUST[profile.energy] ?? 1)) / 3.6;
    water = weight.kg * 55;
    meals = stage === "baby" ? 4 : stage === "young" ? 3 : 2;
  } else if (type === "cat") {
    const rer = 70 * weight.kg ** 0.75;
    food = (rer * CAT_FACTOR[stage] * (ENERGY_ADJUST[profile.energy] ?? 1)) / 4.0;
    water = weight.kg * 50;
    meals = stage === "baby" ? 4 : stage === "young" ? 3 : 2;
  } else {
    food = weight.kg * (stage === "baby" || stage === "young" ? 30 : 15); // pellets; hay is unlimited
    water = weight.kg * 100;
    meals = 2;
  }

  let activity;
  if (type === "dog") {
    activity = { low: 30, medium: 60, high: 90, very_high: 120 }[profile.energy] ?? 60;
    if (profile.size === "toy") activity *= 0.6;
    else if (profile.size === "small") activity *= 0.8;
    if (profile.flags.includes("brachycephalic")) activity = Math.min(activity * 0.7, 45);
    if (stage === "baby") activity = clamp((age.months || 2) * 10, 15, 40);
    else if (stage === "young") activity *= 0.75;
    else if (stage === "senior") activity *= 0.7;
  } else if (type === "cat") {
    activity = { low: 20, medium: 30, high: 45, very_high: 60 }[profile.energy] ?? 30;
    if (stage === "baby" || stage === "young") activity = Math.max(activity, 45);
    if (stage === "senior") activity = Math.min(activity, 20);
  } else {
    activity = { low: 90, medium: 120, high: 150, very_high: 150 }[profile.energy] ?? 120;
    if (stage === "senior") activity = 90;
  }

  return {
    foodGrams: custom.foodGrams ?? round5(food),
    waterMl: custom.waterMl ?? roundTo(water, 10),
    activityMin: custom.activityMin ?? roundTo(activity, 5),
    mealsPerDay: custom.mealsPerDay ?? meals,
    sources: {
      food: custom.foodGrams ? "custom" : "auto",
      water: custom.waterMl ? "custom" : "auto",
      activity: custom.activityMin ? "custom" : "auto",
      meals: custom.mealsPerDay ? "custom" : "auto",
    },
    basis: { weightKg: weight.kg, weightAssumed: weight.assumed, stage, size: profile.size, energy: profile.energy },
  };
}

const pct = (n) => Math.round(clamp(n, 0, 100));

/** Eating about the goal is perfect; a lot less or a lot more both lose points. */
export function nutritionScore(actual, goal) {
  if (!goal || actual <= 0) return 0;
  const r = actual / goal;
  if (r <= 1) return pct(r * 100);
  if (r <= 1.2) return 100;
  return pct(100 - (r - 1.2) * 150);
}
export function hydrationScore(actual, goal) {
  if (!goal || actual <= 0) return 0;
  const r = actual / goal;
  if (r <= 1) return pct(r * 100);
  if (r <= 1.6) return 100;
  return pct(Math.max(50, 100 - (r - 1.6) * 60));
}
export const activityScore = (actual, goal) => (!goal || actual <= 0 ? 0 : pct((actual / goal) * 100));

export function careLabel(score, anyLogged) {
  if (!anyLogged) return { key: "not_started", text: "Let's get started!" };
  if (score >= 85) return { key: "great", text: "Great Care!" };
  if (score >= 70) return { key: "good", text: "Good Care" };
  if (score >= 40) return { key: "fair", text: "Needs a little more care" };
  return { key: "low", text: "Needs attention" };
}

/** totals: amounts logged that day; goals: { foodGrams, waterMl, activityMin } */
export function scoreDay(totals, goals) {
  const food = totals.food || 0;
  const water = totals.water || 0;
  const activity = totals.activity || 0;
  const nutrition = nutritionScore(food, goals.foodGrams);
  const hydration = hydrationScore(water, goals.waterMl);
  const act = activityScore(activity, goals.activityMin);
  const score = Math.round(nutrition * SCORE_WEIGHTS.nutrition + hydration * SCORE_WEIGHTS.hydration + act * SCORE_WEIGHTS.activity);
  const anyLogged = food > 0 || water > 0 || activity > 0;
  return {
    score,
    label: careLabel(score, anyLogged),
    breakdown: { nutrition, hydration, activity: act },
    remaining: {
      foodGrams: Math.max(0, Math.round(goals.foodGrams - food)),
      waterMl: Math.max(0, Math.round(goals.waterMl - water)),
      activityMin: Math.max(0, Math.round(goals.activityMin - activity)),
    },
  };
}

export function careTip(petName, result, goals) {
  const { breakdown: b, remaining: r } = result;
  if (result.label.key === "not_started") return `Log ${petName}'s first meal, water or activity to start today's score.`;
  if (result.score >= 85) return `Keep up the great work! Consistency leads to a happier, healthier ${petName}.`;
  const lowest = Object.entries(b).sort((x, y) => x[1] - y[1])[0][0];
  if (lowest === "nutrition") return r.foodGrams > 0 ? `${petName} still needs about ${r.foodGrams} g of food today.` : `Check ${petName}'s portions: too much food also lowers the score.`;
  if (lowest === "hydration") return r.waterMl > 0 ? `Offer ${petName} about ${r.waterMl} ml more water today.` : `${petName} is drinking plenty today.`;
  return r.activityMin > 0 ? `${petName} needs about ${r.activityMin} more minutes of activity today.` : `${petName} got enough activity today.`;
}
