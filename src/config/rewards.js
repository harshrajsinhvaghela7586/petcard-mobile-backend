/*
 * Game rules in ONE place. The server is the only authority for points, XP,
 * levels and costs: the app displays these values, it never decides them.
 * Adjust the numbers here to match your design; nothing else needs to change.
 */

/** Task categories are validated by the server. Individual tasks do not mint rewards. */
export const CATEGORY_REWARDS = Object.freeze({
  food: { points: 0, xp: 0 },
  water: { points: 0, xp: 0 },
  walk: { points: 0, xp: 0 },
  play: { points: 0, xp: 0 },
  grooming: { points: 0, xp: 0 },
  training: { points: 0, xp: 0 },
  medication: { points: 0, xp: 0 },
  vet: { points: 0, xp: 0 },
  hygiene: { points: 0, xp: 0 },
  other: { points: 0, xp: 0 },
  
});
export const TASK_CATEGORIES = Object.freeze(Object.keys(CATEGORY_REWARDS));
export const rewardForCategory = (category) => CATEGORY_REWARDS[category] || CATEGORY_REWARDS.other;

/** One daily task bonus per pet, only for a task scheduled on that local date. */
export const DAILY_TASK_BONUS_POINTS = 10;
export const DAILY_TASK_BONUS_XP = 30;
export const DAILY_TASK_POINT_CAP = DAILY_TASK_BONUS_POINTS;

/** Exact streak milestones and rewards from the approved product rules. */
export const STREAK_REWARDS = Object.freeze({
  7: { points: 15, xp: 50, title: "Silver Paw" },
  15: { points: 20, xp: 75, title: "Golden Paw" },
  30: { points: 30, xp: 100, title: "Platinum Paw" },
  60: { points: 40, xp: 125, title: "Diamond Paw" },
  90: { points: 50, xp: 150, title: "Royal Paw" },
  180: { points: 75, xp: 250, title: "Elite Paw" },
  365: { points: 150, xp: 500, title: "Legendary Paw" },
});
export const STREAK_BONUS_EVERY = 0; // Legacy compatibility; milestone map is authoritative.
export const STREAK_BONUS_POINTS = 0;

/** Cumulative XP thresholds shown in the approved level table. */
export const LEVEL_THRESHOLDS = Object.freeze([0, 700, 1600, 2700, 4000, 5500, 7200, 9100, 11200, 13500]);
export const MAX_LEVEL = LEVEL_THRESHOLDS.length;
export const LEVEL_UP_BONUS_PER_LEVEL = 0;
export const FRAME_UNLOCKS = Object.freeze({
  2: "frame_silver", 3: "frame_gold", 4: "frame_platinum", 5: "frame_diamond",
  6: "frame_royal", 7: "frame_elite", 8: "frame_legendary", 9: "frame_mythic", 10: "frame_celestial",
});
/** Every frame a pet has earned at `level` (all levels up to it, so a multi-level XP jump never skips one). */
export const framesForLevel = (level) => [
  "frame_default",
  ...Object.entries(FRAME_UNLOCKS).filter(([lv]) => Number(lv) <= level).map(([, key]) => key),
];
export const xpToReach = (level) => LEVEL_THRESHOLDS[Math.max(0, Math.min(MAX_LEVEL - 1, level - 1))] ?? LEVEL_THRESHOLDS[MAX_LEVEL - 1];
export function levelForXp(xp) {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i += 1) if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
  return level;
}
export function levelProgress(xp) {
  const level = levelForXp(xp);
  const floor = xpToReach(level);
  const ceiling = level >= MAX_LEVEL ? floor : xpToReach(level + 1);
  return { level, xp, levelStartXp: floor, nextLevelXp: ceiling, xpIntoLevel: xp - floor, xpForNextLevel: Math.max(0, ceiling - floor), isMaxLevel: level >= MAX_LEVEL };
}

/** Sticker slot rules retained for existing catalogue flows. */
export const FREE_STICKER_SLOTS = 7;
export const EXTRA_STICKER_SLOT_COSTS = Object.freeze([15, 20, 30]);
export const MAX_STICKER_SLOTS = FREE_STICKER_SLOTS + EXTRA_STICKER_SLOT_COSTS.length;

/** Referral: reward the referrer only after the referred account qualifies. */
export const REFERRAL_REFERRER_POINTS = 200;
export const REFERRAL_REFEREE_POINTS = 0;
export const REFERRAL_WINDOW_DAYS = 7;
export const REFERRAL_MAX_REWARDED_PER_USER = 50;

/** Limits that keep one account from creating unbounded data. */
export const LIMITS = Object.freeze({
  petsPerOwner: 2,
  guardiansPerPet: 2,
  activeTasksPerPet: 40,
  healthRecordsPerPet: 500,
  memoriesPerPet: 2000,
  activeInvitesPerPet: 5,
  devicesPerUser: 10,

});
