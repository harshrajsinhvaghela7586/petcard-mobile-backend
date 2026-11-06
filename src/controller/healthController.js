import mongoose from "mongoose";
import HealthRecord, { HEALTH_TYPES } from "../models/HealthRecord.js";
import Pet from "../models/Pet.js";
import { asyncHandler, ok, ApiError, notFoundError, encodeCursor, decodeCursor } from "../utils/http.js";
import { validate, field, t, isValidDateKey, clientToday, addDays } from "../utils/schema.js";
import { isObjectId } from "../utils/validators.js";
import { LIMITS } from "../config/rewards.js";
import { syncPetAchievements } from "../services/achievementService.js";
import { dueFromRepeat, serializeHealth, TYPE_LABELS } from "../services/healthService.js";
import { dueHealth } from "../services/homeService.js";

export const HEALTH_SPEC = {
  type: field(t.oneOf(HEALTH_TYPES)),
  title: field(t.string({ max: 100 })),
  date: field(t.dateKey({ maxFutureDays: 366 })),
  nextDueDate: field(t.dateKey({ maxFutureDays: 5 * 366 }), { nullable: true }),
  weightKg: field(t.number({ min: 0.05, max: 500, decimals: 2 }), { nullable: true }),
  vetName: field(t.string({ max: 80, allowEmpty: true })),
  dosage: field(t.string({ max: 80, allowEmpty: true })),
  repeatEveryDays: field(t.int({ min: 1, max: 3650 }), { nullable: true }),
  reminderDaysBefore: field(t.int({ min: 0, max: 90 })),
  notes: field(t.string({ max: 1000, allowEmpty: true, multiline: true })),
};

const recordIdOf = (req) => {
  if (!isObjectId(req.params.recordId)) throw notFoundError("Record not found.");
  return req.params.recordId;
};

export const checkDates = (date, nextDueDate) => {
  if (date && nextDueDate && isValidDateKey(nextDueDate) && nextDueDate < date) {
    throw new ApiError(400, "The next due date cannot be before the record date.", {
      code: "VALIDATION_ERROR",
      extra: { fields: { nextDueDate: "Must be on or after the date." } },
    });
  }
};

/** The pet profile always shows the weight of the newest weight record. */
export async function syncPetWeight(petId) {
  const latest = await HealthRecord.findOne({ pet: petId, type: "weight", weightKg: { $ne: null } })
    .sort({ date: -1, _id: -1 })
    .select("weightKg")
    .lean();
  if (latest) await Pet.updateOne({ _id: petId }, { $set: { weightKg: latest.weightKg } });
}

/** Allergy / condition records feed the emergency card; vaccinations mark the pet vaccinated. */
export async function syncProfileLists(petId, record) {
  const title = record.title.slice(0, 40);
  if (record.type === "allergy") await Pet.updateOne({ _id: petId }, { $addToSet: { "health.allergies": title } });
  if (record.type === "condition") await Pet.updateOne({ _id: petId }, { $addToSet: { "health.conditions": title } });
  if (record.type === "vaccination") await Pet.updateOne({ _id: petId }, { $set: { "health.vaccinated": true } });
}

export async function unsyncProfileLists(petId, record) {
  const path = record.type === "allergy" ? "health.allergies" : record.type === "condition" ? "health.conditions" : null;
  if (!path) return;
  const others = await HealthRecord.exists({ pet: petId, type: record.type, title: record.title, _id: { $ne: record._id } });
  if (!others) await Pet.updateOne({ _id: petId }, { $pull: { [path]: record.title.slice(0, 40) } });
}

/* GET /api/pets/:petId/health?type&cursor&limit */
export const list = asyncHandler(async (req, res) => {
  const q = validate(req.query, {
    type: field(t.oneOf(HEALTH_TYPES)),
    limit: field(t.int({ min: 1, max: 50, coerce: true })),
    cursor: field(t.string({ max: 300 })),
  });
  const today = clientToday(req);
  const limit = q.limit ?? 20;
  const cursor = decodeCursor(q.cursor);

  const filter = { pet: req.petId, ...(q.type ? { type: q.type } : {}) };
  if (cursor) {
    if (!isValidDateKey(cursor.date) || !isObjectId(cursor.id)) {
      throw new ApiError(400, "Invalid cursor.", { code: "INVALID_CURSOR" });
    }
    filter.$or = [{ date: { $lt: cursor.date } }, { date: cursor.date, _id: { $lt: cursor.id } }];
  }

  const rows = await HealthRecord.find(filter).sort({ date: -1, _id: -1 }).limit(limit + 1).lean();
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  ok(res, {
    records: page.map((r) => serializeHealth(r, today)),
    nextCursor: rows.length > limit ? encodeCursor({ date: last.date, id: String(last._id) }) : null,
  });
});

/* GET /api/pets/:petId/health/upcoming?days=365&overdue=true   "Due in 10 days", "Due tomorrow", "Overdue by 2 days". */
export const upcoming = asyncHandler(async (req, res) => {
  const q = validate(req.query, {
    days: field(t.int({ min: 1, max: 1825, coerce: true })),
    overdue: field(t.bool({ coerce: true })),
    limit: field(t.int({ min: 1, max: 50, coerce: true })),
  });
  const today = clientToday(req);
  const rows = await dueHealth(req.petId, today, {
    limit: q.limit ?? 30,
    horizonDays: q.days ?? 365,
    overdueDays: q.overdue === false ? 0 : 60,
  });
  const records = rows.map((r) => serializeHealth(r, today));
  ok(res, {
    today,
    records,
    counts: {
      overdue: records.filter((r) => r.due?.status === "overdue").length,
      thisWeek: records.filter((r) => r.due && r.due.daysLeft >= 0 && r.due.daysLeft <= 7).length,
      total: records.length,
    },
  });
});

/* GET /api/pets/:petId/health/summary   Counts per type, weight history, next due. */
export const summary = asyncHandler(async (req, res) => {
  const today = clientToday(req);
  const [counts, weights, due] = await Promise.all([
    HealthRecord.aggregate([
      { $match: { pet: new mongoose.Types.ObjectId(req.petId) } },
      { $group: { _id: "$type", count: { $sum: 1 }, last: { $max: "$date" } } },
    ]),
    HealthRecord.find({ pet: req.petId, type: "weight", weightKg: { $ne: null } }).sort({ date: -1, _id: -1 }).limit(12).select("date weightKg").lean(),
    dueHealth(req.petId, today, { limit: 1 }),
  ]);
  const byType = Object.fromEntries(HEALTH_TYPES.map((type) => [type, { label: TYPE_LABELS[type], count: 0, lastDate: null }]));
  for (const row of counts) if (byType[row._id]) byType[row._id] = { ...byType[row._id], count: row.count, lastDate: row.last };
  ok(res, {
    types: byType,
    total: counts.reduce((sum, row) => sum + row.count, 0),
    latestWeightKg: weights[0]?.weightKg ?? null,
    weightHistory: weights.map((w) => ({ date: w.date, weightKg: w.weightKg })).reverse(),
    nextDue: due[0] ? serializeHealth(due[0], today) : null,
  });
});

/* POST /api/pets/:petId/health */
export const create = asyncHandler(async (req, res) => {
  const data = validate(req.body, {
    ...HEALTH_SPEC,
    type: field(HEALTH_SPEC.type.rule, { required: true }),
    title: field(HEALTH_SPEC.title.rule, { required: true }),
    date: field(HEALTH_SPEC.date.rule, { required: true }),
  });
  if (data.type === "weight" && !data.weightKg) {
    throw new ApiError(400, "Enter the weight.", { code: "VALIDATION_ERROR", extra: { fields: { weightKg: "This field is required." } } });
  }
  if (data.nextDueDate === undefined && data.repeatEveryDays) data.nextDueDate = dueFromRepeat(data.date, data.repeatEveryDays);
  checkDates(data.date, data.nextDueDate);

  const count = await HealthRecord.countDocuments({ pet: req.petId });
  if (count >= LIMITS.healthRecordsPerPet) throw new ApiError(403, "Health record limit reached.", { code: "HEALTH_LIMIT" });

  const record = await HealthRecord.create({ ...data, pet: req.petId, createdBy: req.user.id });
  if (data.type === "weight") await syncPetWeight(req.petId);
  await syncProfileLists(req.petId, record);
  await syncPetAchievements(req.user.id, req.petId).catch(() => undefined);
  ok(res, { record: serializeHealth(record.toObject(), clientToday(req)) }, 201);
});

/* GET /api/pets/:petId/health/:recordId */
export const get = asyncHandler(async (req, res) => {
  const record = await HealthRecord.findOne({ _id: recordIdOf(req), pet: req.petId }).lean();
  if (!record) throw notFoundError("Record not found.");
  ok(res, { record: serializeHealth(record, clientToday(req)) });
});

/* PATCH /api/pets/:petId/health/:recordId */
export const update = asyncHandler(async (req, res) => {
  const data = validate(req.body, HEALTH_SPEC);
  const existing = await HealthRecord.findOne({ _id: recordIdOf(req), pet: req.petId }).lean();
  if (!existing) throw notFoundError("Record not found.");
  const nextDue = data.nextDueDate !== undefined ? data.nextDueDate : existing.nextDueDate;
  checkDates(data.date ?? existing.date, nextDue);

  const record = await HealthRecord.findOneAndUpdate({ _id: existing._id, pet: req.petId }, { $set: data }, { new: true }).lean();
  if (record.type === "weight" || existing.type === "weight") await syncPetWeight(req.petId);
  await syncProfileLists(req.petId, record);
  ok(res, { record: serializeHealth(record, clientToday(req)) });
});

/*
 * POST /api/pets/:petId/health/:recordId/complete   { date? }
 * "I did it": the record leaves the upcoming list. A repeating record (every N days)
 * creates the next one automatically, so vaccines and medicines keep coming back.
 */
export const complete = asyncHandler(async (req, res) => {
  const { date } = validate(req.body, { date: field(t.dateKey()) });
  const today = date ?? clientToday(req);
  const existing = await HealthRecord.findOneAndUpdate(
    { _id: recordIdOf(req), pet: req.petId, completedAt: null },
    { $set: { completedAt: new Date() } },
    { new: true }
  ).lean();
  if (!existing) throw notFoundError("Record not found or already completed.");

  let next = null;
  if (existing.repeatEveryDays) {
    const count = await HealthRecord.countDocuments({ pet: req.petId });
    if (count < LIMITS.healthRecordsPerPet) {
      const created = await HealthRecord.create({
        pet: req.petId, createdBy: req.user.id, type: existing.type, title: existing.title,
        date: today, nextDueDate: addDays(today, existing.repeatEveryDays),
        vetName: existing.vetName, dosage: existing.dosage,
        repeatEveryDays: existing.repeatEveryDays, reminderDaysBefore: existing.reminderDaysBefore, notes: "",
      });
      next = serializeHealth(created.toObject(), clientToday(req));
    }
  }
  ok(res, { record: serializeHealth(existing, clientToday(req)), next });
});

/* DELETE /api/pets/:petId/health/:recordId */
export const remove = asyncHandler(async (req, res) => {
  const existing = await HealthRecord.findOneAndDelete({ _id: recordIdOf(req), pet: req.petId }).lean();
  if (!existing) throw notFoundError("Record not found.");
  if (existing.type === "weight") await syncPetWeight(req.petId);
  await unsyncProfileLists(req.petId, existing);
  ok(res, { message: "Record deleted." });
});
