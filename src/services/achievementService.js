import AchievementUnlock from "../models/AchievementUnlock.js";
import Pet from "../models/Pet.js";
import TaskCompletion from "../models/TaskCompletion.js";
import HealthRecord from "../models/HealthRecord.js";
import Memory from "../models/Memory.js";
import { notify } from "./notificationService.js";

export const ACHIEVEMENTS = Object.freeze([
  { key: "first_pet", title: "First Pawprint", description: "Created your first pet profile", icon: "paw", target: 1, metric: "pet" },
  { key: "first_task", title: "First Step", description: "Completed your first care task", icon: "check-circle", target: 1, metric: "tasks" },
  { key: "tasks_10", title: "Task Tamer", description: "Completed 10 care tasks", icon: "clipboard-check", target: 10, metric: "tasks" },
  { key: "tasks_50", title: "Routine Builder", description: "Completed 50 care tasks", icon: "calendar-check", target: 50, metric: "tasks" },
  { key: "tasks_100", title: "Task Champion", description: "Completed 100 care tasks", icon: "medal", target: 100, metric: "tasks" },
  { key: "streak_7", title: "Silver Streak", description: "Reached a 7-day care streak", icon: "fire", target: 7, metric: "streak" },
  { key: "streak_15", title: "Golden Streak", description: "Reached a 15-day care streak", icon: "fire", target: 15, metric: "streak" },
  { key: "streak_30", title: "Monthly Care", description: "Reached a 30-day care streak", icon: "shield-star", target: 30, metric: "streak" },
  { key: "streak_60", title: "Diamond Dedication", description: "Reached a 60-day care streak", icon: "diamond-stone", target: 60, metric: "streak" },
  { key: "streak_90", title: "Royal Routine", description: "Reached a 90-day care streak", icon: "crown", target: 90, metric: "streak" },
  { key: "streak_180", title: "Elite Companion", description: "Reached a 180-day care streak", icon: "trophy", target: 180, metric: "streak" },
  { key: "streak_365", title: "Legendary Year", description: "Reached a 365-day care streak", icon: "star-circle", target: 365, metric: "streak" },
  { key: "health_1", title: "Health Aware", description: "Added your first health record", icon: "heart-pulse", target: 1, metric: "health" },
  { key: "health_5", title: "Health Hero", description: "Added 5 health records", icon: "shield-plus", target: 5, metric: "health" },
  { key: "health_10", title: "Wellness Keeper", description: "Added 10 health records", icon: "medical-bag", target: 10, metric: "health" },
  { key: "memory_1", title: "Memory Maker", description: "Saved your first pet memory", icon: "image", target: 1, metric: "memories" },
  { key: "memory_10", title: "Story Collector", description: "Saved 10 pet memories", icon: "book-heart", target: 10, metric: "memories" },
  { key: "level_5", title: "Pet Pro", description: "Reached level 5", icon: "trending-up", target: 5, metric: "level" },
  { key: "level_10", title: "Paw Legend", description: "Reached level 10", icon: "crown", target: 10, metric: "level" },
  { key: "sticker_1", title: "Style Setter", description: "Added your first sticker to the PetCard", icon: "sticker-emoji", target: 1, metric: "stickers" },
]);

export const ACHIEVEMENT_KEYS = ACHIEVEMENTS.map((a) => a.key);
export const ACHIEVEMENT_BY_KEY = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));

/** Read-only: the numbers every achievement is measured against. */
export async function petMetrics(petId, petDoc = null) {
  const [pet, tasks, health, memories] = await Promise.all([
    petDoc ?? Pet.findById(petId).select("name level streak stickerKeys").lean(),
    TaskCompletion.countDocuments({ pet: petId }),
    HealthRecord.countDocuments({ pet: petId }),
    Memory.countDocuments({ pet: petId }),
  ]);
  if (!pet) return null;
  return {
    pet,
    metrics: {
      pet: 1, tasks, health, memories,
      streak: pet.streak?.longest ?? pet.streak?.current ?? 0,
      level: pet.level ?? 1,
      stickers: pet.stickerKeys?.length ?? 0,
    },
  };
}

/** Pure: definitions + metrics + unlocked map -> the list the app/admin shows. */
export const buildAchievementList = (metrics, unlockedMap) =>
  ACHIEVEMENTS.map((item) => ({
    ...item,
    progress: Math.min(metrics[item.metric] ?? 0, item.target),
    done: unlockedMap.has(item.key),
    unlockedAt: unlockedMap.get(item.key) ?? null,
  }));

/** Read-only status for one pet (admin and anywhere that must not unlock anything). */
export async function achievementStatus(petId) {
  const [found, rows] = await Promise.all([
    petMetrics(petId),
    AchievementUnlock.find({ pet: petId }).select("key unlockedAt").lean(),
  ]);
  if (!found) return null;
  const unlocked = new Map();
  for (const r of rows) {
    const prev = unlocked.get(r.key);
    if (!prev || r.unlockedAt < prev) unlocked.set(r.key, r.unlockedAt);
  }
  return { metrics: found.metrics, achievements: buildAchievementList(found.metrics, unlocked) };
}

/** Unlocks anything newly earned (and notifies), then returns the full list. */
export async function syncPetAchievements(userId, petId) {
  const found = await petMetrics(petId);
  if (!found) return [];
  const { pet, metrics } = found;

  for (const definition of ACHIEVEMENTS) {
    if (metrics[definition.metric] < definition.target) continue;
    try {
      await AchievementUnlock.create({ user: userId, pet: petId, key: definition.key });
      await notify(String(userId), {
        type: "achievement_unlocked",
        title: `Achievement unlocked: ${definition.title}`,
        body: `${pet.name} ${definition.description.toLowerCase()}.`,
        data: { petId: String(petId), achievementKey: definition.key },
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }
  const unlocked = await AchievementUnlock.find({ user: userId, pet: petId }).select("key unlockedAt").lean();
  return buildAchievementList(metrics, new Map(unlocked.map((row) => [row.key, row.unlockedAt])));
}
