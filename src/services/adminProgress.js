import Pet from "../models/Pet.js";
import PetMember from "../models/PetMember.js";
import AchievementUnlock from "../models/AchievementUnlock.js";
import RewardWallet from "../models/RewardWallet.js";
import { LEVEL_THRESHOLDS, FRAME_UNLOCKS, MAX_LEVEL, levelProgress } from "../config/rewards.js";
import { ACHIEVEMENTS } from "./achievementService.js";

/*
 * Level / achievement numbers for the admin panel. Everything here is a
 * batch lookup keyed by the ids on the current page (never one query per row).
 *
 * A pet has XP and a level. A USER has no XP of their own, so their level is
 * the level of their highest-level pet, and their XP is the sum of the XP of the
 * pets they own.
 */

const oid = (id) => (typeof id === "string" ? id : String(id));

export const petProgress = (pet) => {
  const p = levelProgress(pet.xp || 0);
  return {
    level: p.level,
    xp: p.xp,
    xpIntoLevel: p.xpIntoLevel,
    xpForNextLevel: p.xpForNextLevel,
    nextLevelXp: p.nextLevelXp,
    isMaxLevel: p.isMaxLevel,
    streak: { current: pet.streak?.current ?? 0, longest: pet.streak?.longest ?? 0 },
  };
};

/** userId -> { petCount, totalXp, level (highest pet level), bestStreak } for OWNED pets. */
export async function ownerStats(userIds) {
  if (!userIds.length) return new Map();
  const rows = await Pet.aggregate([
    { $match: { owner: { $in: userIds } } },
    {
      $group: {
        _id: "$owner",
        petCount: { $sum: 1 },
        totalXp: { $sum: "$xp" },
        level: { $max: "$level" },
        bestStreak: { $max: "$streak.longest" },
      },
    },
  ]);
  return new Map(rows.map((r) => [oid(r._id), { petCount: r.petCount, totalXp: r.totalXp || 0, level: r.level || 1, bestStreak: r.bestStreak || 0 }]));
}

export async function achievementCountsBy(field, ids) {
  if (!ids.length) return new Map();
  const rows = await AchievementUnlock.aggregate([
    { $match: { [field]: { $in: ids } } },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [oid(r._id), r.count]));
}

export async function walletsOf(userIds) {
  if (!userIds.length) return new Map();
  const rows = await RewardWallet.find({ user: { $in: userIds } }).select("user pawPoints lifetimePoints").lean();
  return new Map(rows.map((w) => [oid(w.user), { pawPoints: w.pawPoints, lifetimePoints: w.lifetimePoints }]));
}

/** Pets each user is a member of (owner or co-guardian) -> count. */
export async function membershipCounts(userIds) {
  if (!userIds.length) return new Map();
  const rows = await PetMember.aggregate([
    { $match: { user: { $in: userIds } } },
    { $group: { _id: "$user", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [oid(r._id), r.count]));
}

export const EMPTY_WALLET = Object.freeze({ pawPoints: 0, lifetimePoints: 0 });

/** Adds { petCount, level, totalXp, achievements, wallet } to every user row. */
export async function attachUserProgress(users) {
  const ids = users.map((u) => u._id);
  const [stats, ach, wallets] = await Promise.all([ownerStats(ids), achievementCountsBy("user", ids), walletsOf(ids)]);
  return users.map((u) => {
    const s = stats.get(oid(u._id));
    return {
      ...u,
      petCount: s?.petCount ?? 0,
      level: s?.level ?? 0, // 0 = no pet yet
      totalXp: s?.totalXp ?? 0,
      bestStreak: s?.bestStreak ?? 0,
      achievements: ach.get(oid(u._id)) ?? 0,
      wallet: wallets.get(oid(u._id)) ?? EMPTY_WALLET,
    };
  });
}

/** Adds { progress, achievements } to every pet row. */
export async function attachPetProgress(pets) {
  const ach = await achievementCountsBy("pet", pets.map((p) => p._id));
  return pets.map((p) => ({ ...p, progress: petProgress(p), achievements: ach.get(oid(p._id)) ?? 0 }));
}

/** The fixed level table (admin reference screen). */
export const levelTable = () =>
  LEVEL_THRESHOLDS.map((xp, i) => ({
    level: i + 1,
    xpRequired: xp,
    nextLevelXp: i + 1 >= MAX_LEVEL ? null : LEVEL_THRESHOLDS[i + 1],
    frameUnlocked: FRAME_UNLOCKS[i + 1] ?? null,
  }));

/** How many pets sit on each level (one grouped query, uses the level index). */
export async function levelDistribution() {
  const rows = await Pet.aggregate([{ $group: { _id: "$level", pets: { $sum: 1 } } }]);
  const byLevel = new Map(rows.map((r) => [r._id, r.pets]));
  return levelTable().map((row) => ({ ...row, pets: byLevel.get(row.level) ?? 0 }));
}

export const ACHIEVEMENT_DEFINITIONS = ACHIEVEMENTS;
