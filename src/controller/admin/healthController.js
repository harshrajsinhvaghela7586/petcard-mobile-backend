import HealthRecord, { HEALTH_TYPES } from "../../models/HealthRecord.js";
import Pet from "../../models/Pet.js";
import MobileUser from "../../models/MobileUser.js";
import { asyncHandler, ok, ApiError, notFoundError } from "../../utils/http.js";
import { validate, field, t, todayKey, addDays } from "../../utils/schema.js";
import { HEALTH_SPEC, checkDates, syncPetWeight, syncProfileLists, unsyncProfileLists } from "../healthController.js";
import { LIMITS } from "../../config/rewards.js";
import { dueFromRepeat, serializeHealth, TYPE_LABELS } from "../../services/healthService.js";
import { syncPetAchievements } from "../../services/achievementService.js";
import { audit } from "../../services/adminAudit.js";
import {
  pageArgs, searchOf, searchFilter, enumOf, intOf, boolOf, sortOf, dateKeyRangeOf, allOf, compact,
  runPaged, idOf, idFilter, byId,
} from "../../utils/adminQuery.js";

const SORTS = ["date", "nextDueDate", "createdAt", "type", "title"];
const STATUSES = ["overdue", "today", "soon", "upcoming", "pending", "completed", "none"];

/** Pet ids for ?pet / ?owner / ?petType filters. */
export async function petScope(req) {
  const pet = idFilter(req.query.pet, "pet");
  const owner = idFilter(req.query.owner, "owner");
  const petType = typeof req.query.petType === "string" && req.query.petType ? req.query.petType.toLowerCase().slice(0, 30) : undefined;
  if (pet && !owner && !petType) return { pet };
  if (!pet && !owner && !petType) return {};
  const ids = await Pet.find(compact({ _id: pet, owner, type: petType })).distinct("_id");
  return { pet: { $in: ids } };
}

/** Status of a record relative to `today`, as a Mongo filter. */
export function statusFilter(status, today) {
  switch (status) {
    case "overdue": return { completedAt: null, nextDueDate: { $lt: today, $ne: null } };
    case "today": return { completedAt: null, nextDueDate: today };
    case "soon": return { completedAt: null, nextDueDate: { $gt: today, $lte: addDays(today, 7) } };
    case "upcoming": return { completedAt: null, nextDueDate: { $gt: addDays(today, 7) } };
    case "pending": return { completedAt: null, nextDueDate: { $ne: null } };
    case "completed": return { completedAt: { $ne: null } };
    case "none": return { completedAt: null, nextDueDate: null };
    default: return null;
  }
}

async function decorate(records, today) {
  const pets = await Pet.find({ _id: { $in: records.map((r) => r.pet) } }).select("name type owner").lean();
  const owners = await MobileUser.find({ _id: { $in: pets.map((p) => p.owner) } }).select("name email").lean();
  const [petOf, ownerOf] = [byId(pets), byId(owners)];
  return records.map((r) => {
    const pet = petOf.get(String(r.pet));
    const owner = pet ? ownerOf.get(String(pet.owner)) : null;
    return {
      ...serializeHealth(r, today),
      pet: pet ? { id: String(pet._id), name: pet.name, type: pet.type } : null,
      owner: owner ? { id: String(owner._id), name: owner.name, email: owner.email } : null,
    };
  });
}

/* GET /api/admin/health?search&pet&owner&petType&type&status&vet&from&to&dueFrom&dueTo&sort&order&page&limit */
export const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageArgs(req);
  const { spec } = sortOf(req, SORTS, { field: "date", order: -1 });
  const today = todayKey();
  const status = enumOf(req.query.status, STATUSES, "status");
  const vet = typeof req.query.vet === "string" && req.query.vet.trim() ? req.query.vet.trim().slice(0, 80) : undefined;
  const filter = allOf(
    searchFilter(searchOf(req), ["title", "vetName", "notes"]),
    await petScope(req),
    status ? statusFilter(status, today) : null,
    compact({ type: enumOf(req.query.type, HEALTH_TYPES, "type"), date: dateKeyRangeOf(req), nextDueDate: dateKeyRangeOf(req, "dueFrom", "dueTo") }),
    vet ? searchFilter(vet, ["vetName"]) : null
  );
  const { items, pagination } = await runPaged(HealthRecord, { filter, sort: spec, skip, limit, page });
  ok(res, { items: await decorate(items, today), pagination });
});

/* GET /api/admin/health/upcoming?days=30&overdueDays=30&overdue=true&type&pet&owner&petType&page&limit
 * What is coming up (and what was missed) across every pet, soonest first. */
export const upcoming = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageArgs(req);
  const today = todayKey();
  const days = intOf(req.query.days, { min: 1, max: 730 }) ?? 30;
  const overdueDays = intOf(req.query.overdueDays, { min: 0, max: 365 }) ?? 30;
  const includeOverdue = boolOf(req.query.overdue) !== false;
  const filter = allOf(
    await petScope(req),
    { completedAt: null, nextDueDate: { $gte: addDays(today, includeOverdue ? -overdueDays : 0), $lte: addDays(today, days) } },
    compact({ type: enumOf(req.query.type, HEALTH_TYPES, "type") })
  );
  const { items, pagination } = await runPaged(HealthRecord, { filter, sort: { nextDueDate: 1, _id: 1 }, skip, limit, page });
  const rows = await decorate(items, today);
  const summary = await HealthRecord.aggregate([
    { $match: filter },
    { $group: { _id: { $cond: [{ $lt: ["$nextDueDate", today] }, "overdue", { $cond: [{ $eq: ["$nextDueDate", today] }, "today", "upcoming"] }] }, n: { $sum: 1 } } },
  ]);
  const count = (k) => summary.find((s) => s._id === k)?.n ?? 0;
  ok(res, { today, items: rows, summary: { overdue: count("overdue"), today: count("today"), upcoming: count("upcoming") }, pagination });
});

/* GET /api/admin/health/stats */
export const stats = asyncHandler(async (_req, res) => {
  const today = todayKey();
  const [byType, overdue, dueToday, dueWeek, completed, total, vaccinated] = await Promise.all([
    HealthRecord.aggregate([{ $group: { _id: "$type", records: { $sum: 1 } } }, { $sort: { records: -1 } }]),
    HealthRecord.countDocuments(statusFilter("overdue", today)),
    HealthRecord.countDocuments(statusFilter("today", today)),
    HealthRecord.countDocuments(statusFilter("soon", today)),
    HealthRecord.countDocuments({ completedAt: { $ne: null } }),
    HealthRecord.estimatedDocumentCount(),
    Pet.countDocuments({ "health.vaccinated": true }),
  ]);
  ok(res, {
    stats: {
      total, overdue, dueToday, dueNext7Days: dueWeek, completed, vaccinatedPets: vaccinated,
      byType: byType.map((r) => ({ type: r._id, label: TYPE_LABELS[r._id] ?? r._id, records: r.records })),
    },
    types: HEALTH_TYPES.map((type) => ({ type, label: TYPE_LABELS[type] ?? type })),
  });
});

/* GET /api/admin/health/:id */
export const detail = asyncHandler(async (req, res) => {
  const record = await HealthRecord.findById(idOf(req.params.id, "Record")).lean();
  if (!record) throw notFoundError("Record not found.");
  const [item] = await decorate([record], todayKey());
  ok(res, { record: item });
});

/* POST /api/admin/health   { petId, type, title, date, nextDueDate?, ... } */
export const create = asyncHandler(async (req, res) => {
  const { petId } = validate(req.body, { petId: field(t.objectId(), { required: true }) });
  const data = validate(req.body, {
    ...HEALTH_SPEC,
    type: field(HEALTH_SPEC.type.rule, { required: true }),
    title: field(HEALTH_SPEC.title.rule, { required: true }),
    date: field(HEALTH_SPEC.date.rule, { required: true }),
  });
  const pet = await Pet.findById(petId).select("owner name").lean();
  if (!pet) throw notFoundError("Pet not found.");
  if (data.type === "weight" && !data.weightKg) {
    throw new ApiError(400, "Enter the weight.", { code: "VALIDATION_ERROR", extra: { fields: { weightKg: "This field is required." } } });
  }
  if (data.nextDueDate === undefined && data.repeatEveryDays) data.nextDueDate = dueFromRepeat(data.date, data.repeatEveryDays);
  checkDates(data.date, data.nextDueDate);
  if ((await HealthRecord.countDocuments({ pet: petId })) >= LIMITS.healthRecordsPerPet) {
    throw new ApiError(403, "Health record limit reached for this pet.", { code: "HEALTH_LIMIT" });
  }
  const record = await HealthRecord.create({ ...data, pet: petId, createdBy: pet.owner });
  if (data.type === "weight") await syncPetWeight(petId);
  await syncProfileLists(petId, record);
  await syncPetAchievements(pet.owner, petId).catch(() => undefined);
  audit(req, "health.create", "health", record._id, `Added ${data.type} "${data.title}" for ${pet.name}`);
  const [item] = await decorate([record.toObject()], todayKey());
  ok(res, { record: item }, 201);
});

/* PATCH /api/admin/health/:id */
export const update = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "Record");
  const data = validate(req.body, HEALTH_SPEC);
  if (!Object.keys(data).length) throw new ApiError(400, "Nothing to update.", { code: "EMPTY_UPDATE" });
  const existing = await HealthRecord.findById(id).lean();
  if (!existing) throw notFoundError("Record not found.");
  checkDates(data.date ?? existing.date, data.nextDueDate !== undefined ? data.nextDueDate : existing.nextDueDate);
  const record = await HealthRecord.findByIdAndUpdate(id, { $set: data }, { new: true }).lean();
  if (record.type === "weight" || existing.type === "weight") await syncPetWeight(record.pet);
  await syncProfileLists(record.pet, record);
  audit(req, "health.update", "health", id, `Updated "${record.title}"`, { fields: Object.keys(data) });
  const [item] = await decorate([record], todayKey());
  ok(res, { record: item });
});

/* POST /api/admin/health/:id/complete   { date? }   Marks it done; repeating records create the next one. */
export const complete = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "Record");
  const { date } = validate(req.body, { date: field(t.dateKey()) });
  const today = date ?? todayKey();
  const existing = await HealthRecord.findOneAndUpdate({ _id: id, completedAt: null }, { $set: { completedAt: new Date() } }, { new: true }).lean();
  if (!existing) throw notFoundError("Record not found or already completed.");
  let next = null;
  if (existing.repeatEveryDays && (await HealthRecord.countDocuments({ pet: existing.pet })) < LIMITS.healthRecordsPerPet) {
    const created = await HealthRecord.create({
      pet: existing.pet, createdBy: existing.createdBy, type: existing.type, title: existing.title,
      date: today, nextDueDate: addDays(today, existing.repeatEveryDays), vetName: existing.vetName, dosage: existing.dosage,
      repeatEveryDays: existing.repeatEveryDays, reminderDaysBefore: existing.reminderDaysBefore, notes: "",
    });
    next = serializeHealth(created.toObject(), todayKey());
  }
  audit(req, "health.complete", "health", id, `Completed "${existing.title}"`);
  ok(res, { record: serializeHealth(existing, todayKey()), next });
});

/* DELETE /api/admin/health/:id */
export const remove = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "Record");
  const existing = await HealthRecord.findByIdAndDelete(id).lean();
  if (!existing) throw notFoundError("Record not found.");
  if (existing.type === "weight") await syncPetWeight(existing.pet);
  await unsyncProfileLists(existing.pet, existing);
  audit(req, "health.delete", "health", id, `Deleted "${existing.title}"`);
  ok(res, { message: "Record deleted." });
});
