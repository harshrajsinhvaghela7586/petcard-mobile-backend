import Pet from "../models/Pet.js";
import HealthRecord from "../models/HealthRecord.js";
import { addDays } from "../utils/schema.js";
import { levelProgress } from "../config/rewards.js";
import { tasksForDay, tasksForRange } from "./taskService.js";
import { trackerSummary } from "./trackerService.js";
import { effectiveStreak } from "./petService.js";
import { serializeHealth } from "./healthService.js";

const has = (role, permissions, permission) =>
  role === "owner" || permissions?.includes("*") || permissions?.includes(permission);

/** Health records still to do, overdue first. */
export async function dueHealth(petId, today, { limit = 10, overdueDays = 30, horizonDays = 365 } = {}) {
  return HealthRecord.find({
    pet: petId,
    completedAt: null,
    nextDueDate: { $gte: addDays(today, -overdueDays), $lte: addDays(today, horizonDays) },
  })
    .sort({ nextDueDate: 1, _id: 1 })
    .limit(limit)
    .lean();
}

/** One call for the Home screen. Sections a guardian may not see are left out (not empty). */
export async function buildHome({ petId, today, role, permissions }) {
  const canTasks = has(role, permissions, "view_tasks");
  const canHealth = has(role, permissions, "view_health");

  const [pet, tracker, todayTasks, weekRange, health] = await Promise.all([
    Pet.findById(petId).select("name type breed gender birthDate weightKg avatarKey avatarLocalId photo activeFrameKey activeStickerKey xp level streak").lean(),
    canTasks ? trackerSummary({ petId, date: today, today, withEntries: false }) : Promise.resolve(null),
    canTasks ? tasksForDay(petId, today) : Promise.resolve([]),
    canTasks ? tasksForRange(petId, addDays(today, 1), addDays(today, 7)) : Promise.resolve({}),
    canHealth ? dueHealth(petId, today, { limit: 8 }) : Promise.resolve([]),
  ]);
  if (!pet) return null;

  const completed = todayTasks.filter((x) => x.completed).length;
  const pending = todayTasks.filter((x) => !x.completed);
  const upcomingTasks = Object.entries(weekRange)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([date, items]) => items.map((item) => ({ ...item, date })))
    .slice(0, 8);
  const healthDue = health.map((r) => serializeHealth(r, today));

  return {
    date: today,
    pet: {
      id: String(pet._id), name: pet.name, type: pet.type, breed: pet.breed || "", gender: pet.gender,
      birthDate: pet.birthDate || null, weightKg: pet.weightKg ?? null,
      avatarKey: pet.avatarKey || null, avatarLocalId: pet.avatarLocalId || null,
      photoUrl: pet.photo?.url || null,
      activeFrameKey: pet.activeFrameKey || "frame_default",
      activeStickerKey: pet.activeStickerKey || null,
    },
    progress: levelProgress(pet.xp || 0),
    streak: effectiveStreak(pet.streak, today),
    ...(tracker
      ? {
          careScore: { score: tracker.careScore.score, label: tracker.careScore.label, breakdown: tracker.careScore.breakdown, tip: tracker.careScore.tip },
          tracker: { totals: tracker.totals, goals: tracker.goals },
        }
      : {}),
    ...(canTasks
      ? {
          tasks: {
            total: todayTasks.length, completed, remaining: pending.length,
            progress: todayTasks.length ? Math.round((completed / todayTasks.length) * 100) / 100 : 0,
            next: pending.slice(0, 6),
          },
          upcomingTasks,
        }
      : {}),
    ...(canHealth
      ? { upcomingHealth: healthDue, overdueHealthCount: healthDue.filter((h) => h.due?.status === "overdue").length }
      : {}),
  };
}
