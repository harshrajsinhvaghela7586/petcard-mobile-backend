import Task from "../models/Task.js";
import TaskCompletion from "../models/TaskCompletion.js";
import {
  asyncHandler,
  ok,
  ApiError,
  notFoundError,
  encodeCursor,
  decodeCursor,
} from "../utils/http.js";
import { validate, field, t, clientToday, todayKey, daysBetween, addDays } from "../utils/schema.js";
import MobileUser from "../models/MobileUser.js";
import Pet from "../models/Pet.js";
import { isObjectId } from "../utils/validators.js";
import { TASK_CATEGORIES, LIMITS } from "../config/rewards.js";
import {
  buildTaskFields,
  completeTask,
  serializeTask,
  alarmsForPets,
  tasksForDay,
  tasksForRange,
} from "../services/taskService.js";
import HealthRecord from "../models/HealthRecord.js";
import Memory from "../models/Memory.js";

const recurrenceSpec = t.object({
  type: field(t.oneOf(["once", "daily", "weekly"])),
  daysOfWeek: field(t.array(t.int({ min: 0, max: 6 }), { max: 7 })),
  startDate: field(t.dateKey({ maxFutureDays: 366 })),
  endDate: field(t.dateKey({ maxFutureDays: 3 * 366 }), { nullable: true }),
});

const reminderSpec = t.object({
  enabled: field(t.bool()),
  minutesBefore: field(t.int({ min: 0, max: 1440 })),
  sound: field(t.bool()),
  vibrate: field(t.bool()),
});

export const TASK_SPEC = {
  title: field(t.string({ max: 80 })),
  note: field(t.string({ max: 300, allowEmpty: true, multiline: true })),
  category: field(t.oneOf(TASK_CATEGORIES)),
  recurrence: field(recurrenceSpec),
  timeOfDay: field(t.time(), { nullable: true }),
  reminder: field(reminderSpec),
};

const userPrefs = async (userId) => {
  const user = await MobileUser.findById(userId).select("reminderPrefs").lean();
  return user?.reminderPrefs ?? null;
};

const taskIdOf = (req) => {
  if (!isObjectId(req.params.taskId)) throw notFoundError("Task not found.");
  return req.params.taskId;
};

const findTask = async (req) => {
  const task = await Task.findOne({ _id: taskIdOf(req), pet: req.petId, archivedAt: null }).lean();
  if (!task) throw notFoundError("Task not found.");
  return task;
};

/* GET /api/pets/:petId/tasks?date=YYYY-MM-DD   Tasks for one day, with completion state. */
export const listTasksForDay = asyncHandler(async (req, res) => {
  const { date } = validate(req.query, { date: field(t.dateKey()) });
  const day = date ?? clientToday(req);
  ok(res, { date: day, tasks: await tasksForDay(req.petId, day) });
});

/* GET /api/pets/:petId/tasks/all   Every active task (manage screen). */
export const listAllTasks = asyncHandler(async (req, res) => {
  const tasks = await Task.find({ pet: req.petId, archivedAt: null }).sort({ createdAt: 1 }).lean();
  ok(res, { tasks: tasks.map((task) => serializeTask(task)) });
});

/* POST /api/pets/:petId/tasks */
export const createTask = asyncHandler(async (req, res) => {
  const data = validate(req.body, {
    ...TASK_SPEC,
    title: field(TASK_SPEC.title.rule, { required: true }),
    category: field(TASK_SPEC.category.rule, { required: true }),
  });

  const active = await Task.countDocuments({ pet: req.petId, archivedAt: null });
  if (active >= LIMITS.activeTasksPerPet) {
    throw new ApiError(403, `A pet can have up to ${LIMITS.activeTasksPerPet} active tasks.`, {
      code: "TASK_LIMIT",
    });
  }

  const task = await Task.create({
    pet: req.petId,
    createdBy: req.user.id,
    note: "",
    ...buildTaskFields(data, null, (await userPrefs(req.user.id)) ?? {}),
  });
  ok(res, { task: serializeTask(task.toObject()) }, 201);
});

/* PATCH /api/pets/:petId/tasks/:taskId */
export const updateTask = asyncHandler(async (req, res) => {
  const data = validate(req.body, TASK_SPEC);
  const existing = await findTask(req);
  const task = await Task.findOneAndUpdate(
    { _id: existing._id, pet: req.petId },
    { $set: buildTaskFields(data, existing, await userPrefs(req.user.id)) },
    { new: true }
  ).lean();
  ok(res, { task: serializeTask(task) });
});

/* DELETE /api/pets/:petId/tasks/:taskId   (archived: history and rewards stay intact) */
export const archiveTask = asyncHandler(async (req, res) => {
  const existing = await findTask(req);
  await Task.updateOne({ _id: existing._id, pet: req.petId }, { $set: { archivedAt: new Date() } });
  ok(res, { message: "Task removed." });
});

/* POST /api/pets/:petId/tasks/:taskId/complete   { date? }  (idempotent) */
export const complete = asyncHandler(async (req, res) => {
  const { date } = validate(req.body, { date: field(t.dateKey()) });
  const task = await findTask(req);
  const result = await completeTask({ task, userId: req.user.id, date: date ?? todayKey() });
  ok(res, result, result.alreadyCompleted ? 200 : 201);
});

/* GET /api/pets/:petId/tasks/history?cursor&limit   Completed tasks, newest first. */
export const history = asyncHandler(async (req, res) => {
  const q = validate(req.query, {
    limit: field(t.int({ min: 1, max: 50, coerce: true })),
    cursor: field(t.string({ max: 300 })),
  });
  const limit = q.limit ?? 20;
  const cursor = decodeCursor(q.cursor);

  const filter = { pet: req.petId };
  if (cursor) {
    if (!isObjectId(cursor.id)) throw new ApiError(400, "Invalid cursor.", { code: "INVALID_CURSOR" });
    filter._id = { $lt: cursor.id };
  }

  const rows = await TaskCompletion.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  const page = rows.slice(0, limit);

  const tasks = await Task.find({ _id: { $in: page.map((r) => r.task) } }).select("title category").lean();
  const titles = new Map(tasks.map((x) => [String(x._id), x]));

  ok(res, {
    items: page.map((r) => ({
      id: String(r._id),
      taskId: String(r.task),
      title: titles.get(String(r.task))?.title ?? "Removed task",
      category: titles.get(String(r.task))?.category ?? "other",
      date: r.date,
      completedBy: String(r.user),
      completedAt: r.createdAt,
      points: r.pointsAwarded,
      xp: r.xpAwarded,
    })),
    nextCursor: rows.length > limit ? encodeCursor({ id: String(page[page.length - 1]._id) }) : null,
  });
});

/* GET /api/pets/:petId/calendar?from&to   Tasks, health due dates and memories per day (max 62 days). */
export const calendar = asyncHandler(async (req, res) => {
  const { from, to } = validate(req.query, {
    from: field(t.dateKey(), { required: true }),
    to: field(t.dateKey(), { required: true }),
  });
  const span = daysBetween(from, to);
  if (span < 0 || span > 61) {
    throw new ApiError(400, "Choose a range of up to 62 days.", { code: "INVALID_RANGE" });
  }

  const [tasks, health, memories] = await Promise.all([
    tasksForRange(req.petId, from, to),
    HealthRecord.find({
      pet: req.petId,
      $or: [{ date: { $gte: from, $lte: to } }, { nextDueDate: { $gte: from, $lte: to } }],
    })
      .select("type title date nextDueDate")
      .limit(500)
      .lean(),
    Memory.find({ pet: req.petId, date: { $gte: from, $lte: to } })
      .select("date title photo.url")
      .limit(500)
      .lean(),
  ]);

  const days = {};
  const bucket = (d) => (days[d] ??= { tasks: [], health: [], memories: [] });
  for (const [d, items] of Object.entries(tasks)) bucket(d).tasks = items;
  for (const h of (req.petRole === "owner" || req.petPermissions?.includes("view_health") ? health : [])) {
    if (h.date >= from && h.date <= to) {
      bucket(h.date).health.push({ id: String(h._id), type: h.type, title: h.title, kind: "record" });
    }
    if (h.nextDueDate && h.nextDueDate >= from && h.nextDueDate <= to) {
      bucket(h.nextDueDate).health.push({ id: String(h._id), type: h.type, title: h.title, kind: "due" });
    }
  }
  for (const m of (req.petRole === "owner" || req.petPermissions?.includes("view_memories") ? memories : [])) {
    bucket(m.date).memories.push({ id: String(m._id), title: m.title, photoUrl: m.photo?.url ?? null });
  }

  ok(res, { from, to, days });
});

/* GET /api/pets/:petId/reminders?from&to   Alarm times for this pet (default: today + 14 days). */
export const reminders = asyncHandler(async (req, res) => {
  const today = clientToday(req);
  const q = validate(req.query, { from: field(t.dateKey()), to: field(t.dateKey()) });
  const from = q.from ?? today;
  const to = q.to ?? addDays(from, 14);
  const span = daysBetween(from, to);
  if (span < 0 || span > 31) throw new ApiError(400, "Choose a range of up to 32 days.", { code: "INVALID_RANGE" });

  const [pet, prefs] = await Promise.all([Pet.findById(req.petId).select("name").lean(), userPrefs(req.user.id)]);
  const alarms = await alarmsForPets([req.petId], { from, to, prefs: prefs ?? {}, names: new Map([[String(req.petId), pet?.name ?? null]]) });
  ok(res, { from, to, alarms });
});
