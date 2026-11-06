import Task from "../../models/Task.js";
import TaskCompletion from "../../models/TaskCompletion.js";
import HealthRecord from "../../models/HealthRecord.js";
import Pet from "../../models/Pet.js";
import { asyncHandler, ok, ApiError } from "../../utils/http.js";
import { todayKey, addDays, daysBetween } from "../../utils/schema.js";
import { occursOn } from "../../services/taskService.js";
import { serializeHealth } from "../../services/healthService.js";
import { dateKeyOf, enumOf, boolOf } from "../../utils/adminQuery.js";
import { HEALTH_TYPES } from "../../models/HealthRecord.js";
import { petScope } from "./healthController.js";

const MAX_DAYS = 62;
const ITEM_CAP = 500;

/*
 * GET /api/admin/calendar?from&to&pet&owner&petType&type=all|tasks|health&items=true
 *
 * One day-by-day view of what is scheduled:
 *  - health: records due (nextDueDate) in the range, plus how many are overdue/done.
 *  - tasks:  completions per day for everyone; with a pet/owner filter the scheduled
 *            occurrences are expanded too (so you see "3 scheduled, 2 done").
 * Without a pet/owner filter, task occurrences are not expanded (that would mean
 * walking every task of every pet), only completions are counted.
 */
export const calendar = asyncHandler(async (req, res) => {
  const today = todayKey();
  const from = dateKeyOf(req.query.from, "from") ?? today;
  const to = dateKeyOf(req.query.to, "to") ?? addDays(from, 30);
  if (to < from) throw new ApiError(400, "`to` cannot be before `from`.", { code: "VALIDATION_ERROR" });
  if (daysBetween(from, to) > MAX_DAYS) throw new ApiError(400, `Choose a range of at most ${MAX_DAYS} days.`, { code: "RANGE_TOO_LARGE" });

  const kind = enumOf(req.query.type, ["all", "tasks", "health"], "type") ?? "all";
  const withItems = boolOf(req.query.items) === true;
  const scope = await petScope(req);
  const scoped = Object.keys(scope).length > 0;
  const healthType = enumOf(req.query.healthType, HEALTH_TYPES, "healthType");

  const days = {};
  const day = (d) => (days[d] ??= { date: d, tasks: { scheduled: null, completed: 0, items: [] }, health: { due: 0, overdue: 0, completed: 0, items: [] } });
  for (let d = from; d <= to; d = addDays(d, 1)) day(d);

  const jobs = [];

  if (kind !== "tasks") {
    const filter = { ...scope, nextDueDate: { $gte: from, $lte: to }, ...(healthType ? { type: healthType } : {}) };
    jobs.push(
      HealthRecord.aggregate([
        { $match: filter },
        { $group: { _id: { d: "$nextDueDate", done: { $cond: [{ $ne: ["$completedAt", null] }, true, false] } }, n: { $sum: 1 } } },
      ]).then((rows) => {
        for (const r of rows) {
          const cell = day(r._id.d).health;
          if (r._id.done) cell.completed += r.n;
          else if (r._id.d < today) cell.overdue += r.n;
          else cell.due += r.n;
        }
      })
    );
    if (withItems) {
      jobs.push(
        HealthRecord.find(filter).sort({ nextDueDate: 1, _id: 1 }).limit(ITEM_CAP).lean().then(async (rows) => {
          const pets = await Pet.find({ _id: { $in: rows.map((r) => r.pet) } }).select("name").lean();
          const nameOf = new Map(pets.map((p) => [String(p._id), p.name]));
          for (const r of rows) day(r.nextDueDate).health.items.push({ ...serializeHealth(r, today), petName: nameOf.get(String(r.pet)) ?? "" });
        })
      );
    }
  }

  if (kind !== "health") {
    jobs.push(
      TaskCompletion.aggregate([
        { $match: { ...scope, date: { $gte: from, $lte: to } } },
        { $group: { _id: "$date", n: { $sum: 1 } } },
      ]).then((rows) => {
        for (const r of rows) day(r._id).tasks.completed = r.n;
      })
    );
    if (scoped) {
      jobs.push(
        (async () => {
          const tasks = await Task.find({ ...scope, archivedAt: null, "recurrence.startDate": { $lte: to } }).limit(1000).lean();
          const done = await TaskCompletion.find({ ...scope, date: { $gte: from, $lte: to } }).select("task date").lean();
          const doneSet = new Set(done.map((c) => `${c.task}:${c.date}`));
          for (let d = from; d <= to; d = addDays(d, 1)) {
            let scheduled = 0;
            for (const task of tasks) {
              if (!occursOn(task, d)) continue;
              scheduled += 1;
              if (withItems && days[d].tasks.items.length < ITEM_CAP) {
                days[d].tasks.items.push({ id: String(task._id), petId: String(task.pet), title: task.title, category: task.category, timeOfDay: task.timeOfDay ?? null, completed: doneSet.has(`${task._id}:${d}`) });
              }
            }
            days[d].tasks.scheduled = scheduled;
          }
        })()
      );
    }
  }

  await Promise.all(jobs);
  const list = Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
  ok(res, {
    from, to, today,
    expandedTasks: scoped && kind !== "health",
    totals: {
      healthDue: list.reduce((s, d) => s + d.health.due, 0),
      healthOverdue: list.reduce((s, d) => s + d.health.overdue, 0),
      taskCompletions: list.reduce((s, d) => s + d.tasks.completed, 0),
    },
    days: list,
  });
});

