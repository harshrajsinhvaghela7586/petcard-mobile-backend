import Task from "../../models/Task.js";
import TaskCompletion from "../../models/TaskCompletion.js";
import Pet from "../../models/Pet.js";
import MobileUser from "../../models/MobileUser.js";
import { asyncHandler, ok, ApiError, notFoundError } from "../../utils/http.js";
import { validate, field, t, todayKey } from "../../utils/schema.js";
import { TASK_SPEC } from "../taskController.js";
import { TASK_CATEGORIES, LIMITS } from "../../config/rewards.js";
import { buildTaskFields, serializeTask, occursOn } from "../../services/taskService.js";
import { audit } from "../../services/adminAudit.js";
import {
  pageArgs, searchOf, searchFilter, boolOf, enumOf, sortOf, dateRangeOf, dateKeyRangeOf, dateKeyOf, allOf, compact,
  runPaged, paginationOf, idOf, idFilter, byId,
} from "../../utils/adminQuery.js";

const SORTS = ["createdAt", "title", "recurrence.startDate", "timeOfDay", "category"];

/** Pet ids a filter refers to: an explicit pet, or every pet of an owner (max 10 per owner). */
async function petScope(req) {
  const pet = idFilter(req.query.pet, "pet");
  const owner = idFilter(req.query.owner, "owner");
  if (pet && owner) {
    const found = await Pet.exists({ _id: pet, owner });
    return found ? { pet } : { pet: { $in: [] } };
  }
  if (pet) return { pet };
  if (owner) return { pet: { $in: await Pet.find({ owner }).distinct("_id") } };
  return {};
}

const adminTask = (task, petOf, userOf, extra = {}) => {
  const { completed, completedAt, completedBy, ...base } = serializeTask(task);
  const pet = petOf.get(String(task.pet));
  const creator = userOf.get(String(task.createdBy));
  return {
    ...base,
    pet: pet ? { id: String(pet._id), name: pet.name, type: pet.type, owner: String(pet.owner) } : null,
    createdBy: creator ? { id: String(creator._id), name: creator.name, email: creator.email } : null,
    archivedAt: task.archivedAt ?? null,
    archived: Boolean(task.archivedAt),
    createdAt: task.createdAt,
    ...extra,
  };
};

async function lookups(tasks) {
  const [pets, users] = await Promise.all([
    Pet.find({ _id: { $in: tasks.map((x) => x.pet) } }).select("name type owner").lean(),
    MobileUser.find({ _id: { $in: tasks.map((x) => x.createdBy) } }).select("name email").lean(),
  ]);
  return { petOf: byId(pets), userOf: byId(users) };
}

/* GET /api/admin/tasks?search&pet&owner&category&type&archived&reminder&date&from&to&sort&order&page&limit */
export const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageArgs(req);
  const { spec } = sortOf(req, SORTS);
  const archived = req.query.archived === "all" ? undefined : boolOf(req.query.archived) ?? false;
  const date = dateKeyOf(req.query.date, "date");
  const filter = allOf(
    searchFilter(searchOf(req), ["title", "note"]),
    await petScope(req),
    compact({
      category: enumOf(req.query.category, TASK_CATEGORIES, "category"),
      "recurrence.type": enumOf(req.query.type, ["once", "daily", "weekly"], "type"),
      "reminder.enabled": boolOf(req.query.reminder),
      createdAt: dateRangeOf(req, "createdFrom", "createdTo"),
      ...(archived === true ? { archivedAt: { $type: "date" } } : archived === false ? { archivedAt: null } : {}),
    }),
    date ? { "recurrence.startDate": { $lte: date }, $or: [{ "recurrence.endDate": null }, { "recurrence.endDate": { $gte: date } }] } : null
  );

  let items;
  let pagination;
  if (date) {
    // "Tasks happening on this day": occurrence rules are evaluated in code, so page in memory (bounded).
    const candidates = await Task.find(filter).sort(spec).limit(1000).lean();
    const matching = candidates.filter((x) => occursOn(x, date));
    items = matching.slice(skip, skip + limit);
    pagination = paginationOf(page, limit, matching.length);
  } else {
    ({ items, pagination } = await runPaged(Task, { filter, sort: spec, skip, limit, page }));
  }

  const { petOf, userOf } = await lookups(items);
  const done = items.length
    ? await TaskCompletion.aggregate([
        { $match: { task: { $in: items.map((x) => x._id) } } },
        { $group: { _id: "$task", completions: { $sum: 1 }, lastDate: { $max: "$date" } } },
      ])
    : [];
  const doneOf = byId(done);
  ok(res, {
    items: items.map((x) =>
      adminTask(x, petOf, userOf, { completions: doneOf.get(String(x._id))?.completions ?? 0, lastCompletedDate: doneOf.get(String(x._id))?.lastDate ?? null })
    ),
    pagination,
  });
});

/* GET /api/admin/tasks/stats */
export const stats = asyncHandler(async (_req, res) => {
  const today = todayKey();
  const [active, archived, byCategory, doneToday, doneWeek] = await Promise.all([
    Task.countDocuments({ archivedAt: null }),
    Task.countDocuments({ archivedAt: { $type: "date" } }),
    Task.aggregate([{ $match: { archivedAt: null } }, { $group: { _id: "$category", tasks: { $sum: 1 } } }, { $sort: { tasks: -1 } }]),
    TaskCompletion.countDocuments({ date: today }),
    TaskCompletion.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 86_400_000) } }),
  ]);
  ok(res, { stats: { active, archived, completedToday: doneToday, completedLast7Days: doneWeek, byCategory: byCategory.map((r) => ({ category: r._id, tasks: r.tasks })) } });
});

/* GET /api/admin/tasks/completions?pet&owner&user&task&category&from&to&page&limit   History of completed tasks. */
export const completions = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageArgs(req);
  let taskFilter;
  const category = enumOf(req.query.category, TASK_CATEGORIES, "category");
  if (category) taskFilter = { task: { $in: await Task.find({ category }).distinct("_id") } };
  const filter = allOf(
    await petScope(req),
    taskFilter,
    compact({ user: idFilter(req.query.user, "user"), task: idFilter(req.query.task, "task"), date: dateKeyRangeOf(req) })
  );
  const { items, pagination } = await runPaged(TaskCompletion, { filter, sort: { createdAt: -1, _id: -1 }, skip, limit, page });
  const [tasks, pets, users] = await Promise.all([
    Task.find({ _id: { $in: items.map((x) => x.task) } }).select("title category").lean(),
    Pet.find({ _id: { $in: items.map((x) => x.pet) } }).select("name").lean(),
    MobileUser.find({ _id: { $in: items.map((x) => x.user) } }).select("name email").lean(),
  ]);
  const [taskOf, petOf, userOf] = [byId(tasks), byId(pets), byId(users)];
  ok(res, {
    items: items.map((c) => ({
      id: String(c._id),
      date: c.date,
      completedAt: c.createdAt,
      pointsAwarded: c.pointsAwarded,
      xpAwarded: c.xpAwarded,
      task: taskOf.get(String(c.task)) ? { id: String(c.task), title: taskOf.get(String(c.task)).title, category: taskOf.get(String(c.task)).category } : null,
      pet: petOf.get(String(c.pet)) ? { id: String(c.pet), name: petOf.get(String(c.pet)).name } : null,
      user: userOf.get(String(c.user)) ? { id: String(c.user), name: userOf.get(String(c.user)).name, email: userOf.get(String(c.user)).email } : null,
    })),
    pagination,
  });
});

/* GET /api/admin/tasks/:id */
export const detail = asyncHandler(async (req, res) => {
  const task = await Task.findById(idOf(req.params.id, "Task")).lean();
  if (!task) throw notFoundError("Task not found.");
  const [{ petOf, userOf }, recent, total] = await Promise.all([
    lookups([task]),
    TaskCompletion.find({ task: task._id }).sort({ date: -1 }).limit(15).select("date user createdAt pointsAwarded xpAwarded").lean(),
    TaskCompletion.countDocuments({ task: task._id }),
  ]);
  ok(res, { task: adminTask(task, petOf, userOf, { completions: total }), recentCompletions: recent });
});

const CATEGORY_RULE = field(t.oneOf(TASK_CATEGORIES), { required: true });

/* POST /api/admin/tasks   { petId, title, category, recurrence?, timeOfDay?, reminder?, note? } */
export const create = asyncHandler(async (req, res) => {
  const { petId } = validate(req.body, { petId: field(t.objectId(), { required: true }) });
  const data = validate(req.body, { ...TASK_SPEC, title: field(TASK_SPEC.title.rule, { required: true }), category: CATEGORY_RULE });
  const pet = await Pet.findById(petId).select("owner name").lean();
  if (!pet) throw notFoundError("Pet not found.");
  const active = await Task.countDocuments({ pet: petId, archivedAt: null });
  if (active >= LIMITS.activeTasksPerPet) {
    throw new ApiError(403, `A pet can have up to ${LIMITS.activeTasksPerPet} active tasks.`, { code: "TASK_LIMIT" });
  }
  const owner = await MobileUser.findById(pet.owner).select("reminderPrefs").lean();
  const task = await Task.create({ pet: petId, createdBy: pet.owner, note: "", ...buildTaskFields(data, null, owner?.reminderPrefs ?? {}) });
  audit(req, "task.create", "task", task._id, `Created task "${task.title}" for ${pet.name}`);
  const { petOf, userOf } = await lookups([task]);
  ok(res, { task: adminTask(task.toObject(), petOf, userOf) }, 201);
});

/* PATCH /api/admin/tasks/:id */
export const update = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "Task");
  const data = validate(req.body, TASK_SPEC);
  if (!Object.keys(data).length) throw new ApiError(400, "Nothing to update.", { code: "EMPTY_UPDATE" });
  const existing = await Task.findById(id).lean();
  if (!existing) throw notFoundError("Task not found.");
  const pet = await Pet.findById(existing.pet).select("owner").lean();
  const owner = pet ? await MobileUser.findById(pet.owner).select("reminderPrefs").lean() : null;
  const task = await Task.findByIdAndUpdate(id, { $set: buildTaskFields(data, existing, owner?.reminderPrefs ?? null) }, { new: true }).lean();
  audit(req, "task.update", "task", id, `Updated task "${task.title}"`, { fields: Object.keys(data) });
  const { petOf, userOf } = await lookups([task]);
  ok(res, { task: adminTask(task, petOf, userOf) });
});

/* POST /api/admin/tasks/:id/archive | /unarchive   History and rewards stay intact. */
const setArchived = (archive) =>
  asyncHandler(async (req, res) => {
    const id = idOf(req.params.id, "Task");
    if (!archive) {
      const existing = await Task.findById(id).select("pet archivedAt").lean();
      if (!existing) throw notFoundError("Task not found.");
      const active = await Task.countDocuments({ pet: existing.pet, archivedAt: null });
      if (existing.archivedAt && active >= LIMITS.activeTasksPerPet) {
        throw new ApiError(403, `A pet can have up to ${LIMITS.activeTasksPerPet} active tasks.`, { code: "TASK_LIMIT" });
      }
    }
    const task = await Task.findByIdAndUpdate(id, { $set: { archivedAt: archive ? new Date() : null } }, { new: true }).lean();
    if (!task) throw notFoundError("Task not found.");
    audit(req, archive ? "task.archive" : "task.unarchive", "task", id, `${archive ? "Archived" : "Restored"} task "${task.title}"`);
    ok(res, { task: { id: String(task._id), archived: archive, archivedAt: task.archivedAt }, message: archive ? "Task archived." : "Task restored." });
  });
export const archive = setArchived(true);
export const unarchive = setArchived(false);

/* DELETE /api/admin/tasks/:id   Permanently removes the task and its completion history (rewards already given stay in the ledger). */
export const remove = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "Task");
  const task = await Task.findByIdAndDelete(id).lean();
  if (!task) throw notFoundError("Task not found.");
  const gone = await TaskCompletion.deleteMany({ task: id });
  audit(req, "task.delete", "task", id, `Deleted task "${task.title}"`, { completionsRemoved: gone.deletedCount });
  ok(res, { message: "Task deleted.", completionsRemoved: gone.deletedCount });
});
