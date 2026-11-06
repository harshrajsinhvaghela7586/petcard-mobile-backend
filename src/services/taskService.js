import mongoose from "mongoose";
import Task from "../models/Task.js";
import TaskCompletion from "../models/TaskCompletion.js";
import Pet from "../models/Pet.js";
import { ApiError } from "../utils/http.js";
import { addDays, daysBetween, dayOfWeek, todayKey } from "../utils/schema.js";
import { occursOn, buildAlarms, describeRepeat, describeReminder, reminderOf } from "./reminderService.js";
import { notify } from "./notificationService.js";
import { grant, getBalance } from "./rewardService.js";
import { syncPetAchievements } from "./achievementService.js";
import { rewardForCategory, DAILY_TASK_BONUS_POINTS, DAILY_TASK_BONUS_XP, STREAK_REWARDS } from "../config/rewards.js";
import {
  levelProgress,
} from "../config/rewards.js";

export { occursOn };

/** "19:05" -> "07:05 PM" */
export const timeLabel = (time) => {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export const serializeTask = (task, completion = null) => ({
  id: String(task._id),
  petId: String(task.pet),
  title: task.title,
  note: task.note,
  category: task.category,
  recurrence: {
    type: task.recurrence.type,
    daysOfWeek: task.recurrence.daysOfWeek || [],
    startDate: task.recurrence.startDate,
    endDate: task.recurrence.endDate || null,
  },
  timeOfDay: task.timeOfDay || null,
  timeLabel: timeLabel(task.timeOfDay),
  reminder: reminderOf(task),
  repeatLabel: describeRepeat(task.recurrence),
  reminderLabel: task.timeOfDay && reminderOf(task).enabled ? describeReminder(reminderOf(task).minutesBefore) : "No reminder",
  points: task.points,
  xp: task.xp,
  ...(completion !== undefined
    ? {
        completed: Boolean(completion),
        completedAt: completion?.createdAt ?? null,
        completedBy: completion ? String(completion.user) : null,
      }
    : {}),
});

/** A task may be completed for yesterday, today or tomorrow (UTC): covers every timezone. */
export function assertCompletableDate(date) {
  if (date < todayKey(-1) || date > todayKey(1)) {
    throw new ApiError(400, "You can only complete tasks for today.", { code: "DATE_OUT_OF_RANGE" });
  }
}

async function updateStreak(pet, date) {
  const last = pet.streak?.lastDate ?? null;
  if (last && date <= last) return { streak: pet.streak, advanced: false };

  const current = last && daysBetween(last, date) === 1 ? (pet.streak.current || 0) + 1 : 1;
  const longest = Math.max(pet.streak?.longest || 0, current);

  const updated = await Pet.findOneAndUpdate(
    { _id: pet._id, "streak.lastDate": last },
    { $set: { "streak.current": current, "streak.longest": longest, "streak.lastDate": date } },
    { new: true }
  )
    .select("streak")
    .lean();

  // Another completion advanced the streak first: use its result.
  if (!updated) {
    const fresh = await Pet.findById(pet._id).select("streak").lean();
    return { streak: fresh?.streak, advanced: false };
  }
  return { streak: updated.streak, advanced: true };
}

/**
 * Marks `task` done for `date`. Safe to call repeatedly: the unique
 * (task, date) index guarantees points and XP are granted at most once.
 */
export async function completeTask({ task, userId, date }) {
  assertCompletableDate(date);
  if (!occursOn(task, date)) {
    throw new ApiError(400, "This task is not scheduled for that day.", { code: "NOT_SCHEDULED" });
  }

  let completion;
  try {
    completion = await TaskCompletion.create({ task: task._id, pet: task.pet, user: userId, date });
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await TaskCompletion.findOne({ task: task._id, date }).lean();
      return { alreadyCompleted: true, completion: existing, reward: { points: 0, xp: 0 } };
    }
    throw error;
  }

  try {
    // The scheduled-day validation above prevents backdating/early completion.
    // A unique pet+date ledger key makes the daily bonus concurrency-safe.
    const points = DAILY_TASK_BONUS_POINTS;
    const xp = DAILY_TASK_BONUS_XP;
    let result = await grant({
      userId,
      petId: task.pet,
      kind: "task_complete",
      points,
      xp,
      key: `daily-task:${task.pet}:${date}`,
      date,
    });
    const awardedPoints = result.duplicate ? 0 : points;
    const awardedXp = result.duplicate ? 0 : xp;

    await TaskCompletion.updateOne(
      { _id: completion._id },
      { $set: { pointsAwarded: awardedPoints, xpAwarded: awardedXp } }
    );

    const petDoc = await Pet.findById(task.pet).select("name xp level streak").lean();
    const { streak, advanced } = await updateStreak(petDoc, date);

    let streakBonus = 0;
    let streakXp = 0;
    const milestone = STREAK_REWARDS[streak?.current];
    if (advanced && milestone) {
      const bonus = await grant({
        userId,
        petId: task.pet,
        kind: "streak_bonus",
        points: milestone.points,
        xp: milestone.xp,
        key: `streak:${task.pet}:${streak.current}`,
        date,
      });
      if (!bonus.duplicate) {
        streakBonus = milestone.points;
        streakXp = milestone.xp;
        await notify(String(userId), {
          type: "reward_received",
          title: `${milestone.title}: ${streak.current}-day streak!`,
          body: `${petDoc.name} earned ${milestone.points} Paw Points and ${milestone.xp} XP.`,
          data: { petId: String(task.pet), streak: String(streak.current) },
        });
      }
    }

    const freshPet = await Pet.findById(task.pet).select("xp level streak").lean();
    const balance = await getBalance(userId);
    await syncPetAchievements(userId, task.pet).catch(() => undefined);

    return {
      alreadyCompleted: false,
      completion: { ...completion.toObject(), pointsAwarded: awardedPoints, xpAwarded: awardedXp },
      reward: { points: awardedPoints, xp: awardedXp, streakBonus, streakXp, alreadyAwardedToday: result.duplicate },
      leveledUp: result.leveledUp ?? null,
      progress: levelProgress(freshPet.xp),
      streak: freshPet.streak,
      wallet: balance,
    };
  } catch (error) {
    // Leave no half-done completion behind: the user can simply tap again.
    await TaskCompletion.deleteOne({ _id: completion._id }).catch(() => {});
    throw error;
  }
}

/** Tasks (with completion state) for one day. */
export async function tasksForDay(petId, date) {
  const tasks = await Task.find({ pet: petId, archivedAt: null, "recurrence.startDate": { $lte: date } }).lean();
  const due = tasks.filter((t) => occursOn(t, date));
  const done = due.length
    ? await TaskCompletion.find({ pet: petId, date, task: { $in: due.map((t) => t._id) } })
        .select("task user createdAt")
        .lean()
    : [];
  const byTask = new Map(done.map((c) => [String(c.task), c]));

  due.sort((a, b) => (a.timeOfDay || "99:99").localeCompare(b.timeOfDay || "99:99") || a.title.localeCompare(b.title));
  return due.map((t) => serializeTask(t, byTask.get(String(t._id)) ?? null));
}

/** Calendar range expansion (max ~62 days, validated by the caller). */
export async function tasksForRange(petId, from, to) {
  const tasks = await Task.find({ pet: petId, archivedAt: null, "recurrence.startDate": { $lte: to } }).lean();
  const completions = await TaskCompletion.find({ pet: petId, date: { $gte: from, $lte: to } })
    .select("task date")
    .lean();
  const doneSet = new Set(completions.map((c) => `${c.task}:${c.date}`));

  const days = {};
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const items = [];
    for (const t of tasks) {
      if (occursOn(t, d)) {
        items.push({
          id: String(t._id),
          title: t.title,
          category: t.category,
          timeOfDay: t.timeOfDay || null,
          completed: doneSet.has(`${t._id}:${d}`),
        });
      }
    }
    if (items.length) days[d] = items;
  }
  return days;
}

/** Normalizes validated input into the stored shape (points/xp always come from the server). */
export function buildTaskFields(data, existing = null, prefs = null) {
  const prev = existing?.recurrence;
  const incoming = data.recurrence || {};
  const type = incoming.type ?? prev?.type ?? "daily";
  const startDate = incoming.startDate ?? prev?.startDate ?? todayKey(-1);
  const endDate = incoming.endDate !== undefined ? incoming.endDate : prev?.endDate ?? null;

  if (endDate && endDate < startDate) {
    throw new ApiError(400, "The end date cannot be before the start date.", {
      code: "VALIDATION_ERROR",
      extra: { fields: { "recurrence.endDate": "Must be on or after the start date." } },
    });
  }

  let daysOfWeek = [];
  if (type === "weekly") {
    daysOfWeek = (incoming.daysOfWeek ?? prev?.daysOfWeek ?? []).slice().sort((a, b) => a - b);
    if (!daysOfWeek.length) daysOfWeek = [dayOfWeek(startDate)];
  }

  const fields = { recurrence: { type, daysOfWeek, startDate, endDate: type === "once" ? null : endDate } };
  /* Reminder: ring/vibrate before the task time, on the days the task occurs. */
  const finalTime = data.timeOfDay !== undefined ? data.timeOfDay : existing?.timeOfDay ?? null;
  const prevReminder = existing?.reminder;
  const base = {
    enabled: prevReminder?.enabled ?? Boolean(finalTime),
    minutesBefore: prevReminder?.minutesBefore ?? prefs?.defaultMinutesBefore ?? 0,
    sound: prevReminder?.sound ?? prefs?.sound ?? true,
    vibrate: prevReminder?.vibrate ?? prefs?.vibrate ?? true,
  };
  const reminder = { ...base, ...(data.reminder || {}) };
  if (reminder.enabled && !finalTime) {
    if (data.reminder?.enabled) {
      throw new ApiError(400, "Choose a time to use a reminder.", {
        code: "VALIDATION_ERROR",
        extra: { fields: { timeOfDay: "Choose a time to use a reminder." } },
      });
    }
    reminder.enabled = false; // the time was removed: the alarm can no longer ring
  }
  fields.reminder = reminder;
  if (data.title !== undefined) fields.title = data.title;
  if (data.note !== undefined) fields.note = data.note;
  if (data.timeOfDay !== undefined) fields.timeOfDay = data.timeOfDay;
  if (data.category !== undefined) {
    const reward = rewardForCategory(data.category);
    fields.category = data.category;
    fields.points = reward.points;
    fields.xp = reward.xp;
  }
  return fields;
}

/** Alarms for several pets between two local dates (the app schedules local notifications from these). */
export async function alarmsForPets(petIds, { from, to, prefs = {}, names = new Map(), limit = 300 }) {
  if (!petIds.length) return [];
  const tasks = await Task.find({
    pet: { $in: petIds },
    archivedAt: null,
    timeOfDay: { $ne: null },
    "recurrence.startDate": { $lte: to },
  }).lean();
  return buildAlarms(tasks, { from, to, prefs, limit }).map((a) => ({ ...a, petName: names.get(a.petId) ?? null }));
}
