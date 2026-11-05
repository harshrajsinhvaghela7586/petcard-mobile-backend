import Pet from "../models/Pet.js";
import TrackerEntry from "../models/TrackerEntry.js";
import { asyncHandler, ok, ApiError, notFoundError, encodeCursor, decodeCursor } from "../utils/http.js";
import { validate, field, t, clientToday, todayKey } from "../utils/schema.js";
import { isObjectId } from "../utils/validators.js";
import { computeGoals } from "../services/careScore.js";
import {
  COUNTER_KINDS, LOG_KINDS, MAX_LOG_ENTRIES_PER_DAY, UNITS, PET_GOAL_FIELDS,
  bumpCounter, careScoreHistory, serializeEntry, trackerSummary,
} from "../services/trackerService.js";

/* Daily trackers. Mounted at /api/pets/:petId/tracker (membership + permissions checked in the router). */

const BACKFILL_DAYS = 8;
const assertLogDate = (date) => {
  if (date < todayKey(-BACKFILL_DAYS) || date > todayKey(1)) {
    throw new ApiError(400, "You can log for today or the last week.", { code: "DATE_OUT_OF_RANGE" });
  }
};
const entryIdOf = (req) => {
  if (!isObjectId(req.params.entryId)) throw notFoundError("Entry not found.");
  return req.params.entryId;
};

const LOG_SPEC = {
  kind: field(t.oneOf(LOG_KINDS)),
  title: field(t.string({ max: 60, allowEmpty: true })),
  amount: field(t.number({ min: 1, max: 5000, decimals: 0 })),
  time: field(t.time(), { nullable: true }),
  date: field(t.dateKey()),
  note: field(t.string({ max: 200, allowEmpty: true })),
};
const DEFAULT_TITLE = { food: "Meal", water: "Water", activity: "" };
const MAX_AMOUNT = { food: 5000, water: 5000, activity: 600 };

/* GET /summary?date=  Everything one tracker screen needs. */
export const summary = asyncHandler(async (req, res) => {
  const today = clientToday(req);
  const { date } = validate(req.query, { date: field(t.dateKey()) });
  const data = await trackerSummary({ petId: req.petId, date: date ?? today, today });
  if (!data) throw notFoundError("Pet not found.");
  ok(res, data);
});

/* GET /care-score?date=  Score + breakdown only. */
export const careScore = asyncHandler(async (req, res) => {
  const today = clientToday(req);
  const { date } = validate(req.query, { date: field(t.dateKey()) });
  const data = await trackerSummary({ petId: req.petId, date: date ?? today, today, withEntries: false });
  if (!data) throw notFoundError("Pet not found.");
  ok(res, { date: data.date, pet: data.pet, goals: data.goals, totals: data.totals, careScore: data.careScore });
});

/* GET /care-score/history?days=7 */
export const careHistory = asyncHandler(async (req, res) => {
  const { days } = validate(req.query, { days: field(t.int({ min: 2, max: 30, coerce: true })) });
  const data = await careScoreHistory({ petId: req.petId, today: clientToday(req), days: days ?? 7 });
  if (!data) throw notFoundError("Pet not found.");
  ok(res, data);
});

/* GET /entries?kind&date&cursor&limit */
export const list = asyncHandler(async (req, res) => {
  const q = validate(req.query, {
    kind: field(t.oneOf([...LOG_KINDS, ...COUNTER_KINDS])),
    date: field(t.dateKey()),
    limit: field(t.int({ min: 1, max: 100, coerce: true })),
    cursor: field(t.string({ max: 300 })),
  });
  const limit = q.limit ?? 50;
  const cursor = decodeCursor(q.cursor);
  const filter = { pet: req.petId, date: q.date ?? clientToday(req), ...(q.kind ? { kind: q.kind } : {}) };
  if (cursor) {
    if (!isObjectId(cursor.id)) throw new ApiError(400, "Invalid cursor.", { code: "INVALID_CURSOR" });
    filter._id = { $lt: cursor.id };
  }
  const rows = await TrackerEntry.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  const page = rows.slice(0, limit);
  ok(res, {
    entries: page.map(serializeEntry),
    nextCursor: rows.length > limit ? encodeCursor({ id: String(page[page.length - 1]._id) }) : null,
  });
});

/* POST /entries   { kind: "food"|"water"|"activity", title?, amount, time?, date?, note? } */
export const create = asyncHandler(async (req, res) => {
  const data = validate(req.body, {
    ...LOG_SPEC,
    kind: field(LOG_SPEC.kind.rule, { required: true }),
    amount: field(LOG_SPEC.amount.rule, { required: true }),
  });
  if (data.amount > MAX_AMOUNT[data.kind]) {
    throw new ApiError(400, `That is more than ${MAX_AMOUNT[data.kind]} ${UNITS[data.kind]} in one entry.`, {
      code: "VALIDATION_ERROR",
      extra: { fields: { amount: `Must be at most ${MAX_AMOUNT[data.kind]}.` } },
    });
  }
  const title = data.title || DEFAULT_TITLE[data.kind];
  if (data.kind === "activity" && !title) {
    throw new ApiError(400, "Write what your pet did (for example: Morning walk).", {
      code: "VALIDATION_ERROR",
      extra: { fields: { title: "This field is required." } },
    });
  }
  const date = data.date ?? clientToday(req);
  assertLogDate(date);

  const count = await TrackerEntry.countDocuments({ pet: req.petId, date, kind: data.kind });
  if (count >= MAX_LOG_ENTRIES_PER_DAY) {
    throw new ApiError(403, `You can add up to ${MAX_LOG_ENTRIES_PER_DAY} ${data.kind} entries a day.`, { code: "TRACKER_LIMIT" });
  }

  const entry = await TrackerEntry.create({
    pet: req.petId, user: req.user.id, kind: data.kind, date, time: data.time ?? null,
    title, amount: data.amount, note: data.note ?? "",
  });
  const s = await trackerSummary({ petId: req.petId, date, today: clientToday(req), withEntries: false });
  ok(res, { entry: serializeEntry(entry.toObject()), totals: s?.totals, careScore: s?.careScore }, 201);
});

/* PATCH /entries/:entryId */
export const update = asyncHandler(async (req, res) => {
  const data = validate(req.body, { title: LOG_SPEC.title, amount: LOG_SPEC.amount, time: LOG_SPEC.time, note: LOG_SPEC.note });
  if (!Object.keys(data).length) throw new ApiError(400, "Nothing to update.", { code: "EMPTY_UPDATE" });
  const existing = await TrackerEntry.findOne({ _id: entryIdOf(req), pet: req.petId, counter: { $ne: true } }).lean();
  if (!existing) throw notFoundError("Entry not found.");
  if (data.amount !== undefined && data.amount > MAX_AMOUNT[existing.kind]) {
    throw new ApiError(400, "That amount is too large.", { code: "VALIDATION_ERROR" });
  }
  const entry = await TrackerEntry.findOneAndUpdate({ _id: existing._id, pet: req.petId }, { $set: data }, { new: true }).lean();
  const s = await trackerSummary({ petId: req.petId, date: entry.date, today: clientToday(req), withEntries: false });
  ok(res, { entry: serializeEntry(entry), totals: s?.totals, careScore: s?.careScore });
});

/* DELETE /entries/:entryId */
export const remove = asyncHandler(async (req, res) => {
  const existing = await TrackerEntry.findOneAndDelete({ _id: entryIdOf(req), pet: req.petId }).lean();
  if (!existing) throw notFoundError("Entry not found.");
  const s = await trackerSummary({ petId: req.petId, date: existing.date, today: clientToday(req), withEntries: false });
  ok(res, { message: "Entry deleted.", totals: s?.totals, careScore: s?.careScore });
});

const counterKindOf = (req) => {
  if (!COUNTER_KINDS.includes(req.params.kind)) throw notFoundError("Counter not found.");
  return req.params.kind;
};

/* POST /counters/:kind   { label?, count?, time?, date? }   One tap of the clicker / whistle. */
export const tap = asyncHandler(async (req, res) => {
  const kind = counterKindOf(req);
  const data = validate(req.body, {
    label: field(t.string({ max: 40, allowEmpty: true })),
    count: field(t.int({ min: 1, max: 20 })),
    time: field(t.time(), { nullable: true }),
    date: field(t.dateKey()),
  });
  const date = data.date ?? clientToday(req);
  assertLogDate(date);
  const counter = await bumpCounter({
    petId: req.petId, userId: req.user.id, kind, date,
    label: data.label || "General", time: data.time ?? null, count: data.count ?? 1,
  });
  const s = await trackerSummary({ petId: req.petId, date, today: clientToday(req), withEntries: false });
  ok(res, {
    counter: { id: String(counter._id), label: counter.title, count: counter.amount, lastTime: counter.time },
    total: s?.totals?.[kind]?.count ?? counter.amount,
    date,
  });
});

/* DELETE /counters/:kind?date=   Reset the day's clicker / whistle to 0. */
export const resetCounter = asyncHandler(async (req, res) => {
  const kind = counterKindOf(req);
  const { date } = validate(req.query, { date: field(t.dateKey()) });
  const day = date ?? clientToday(req);
  const result = await TrackerEntry.deleteMany({ pet: req.petId, kind, date: day, counter: true });
  ok(res, { date: day, removed: result.deletedCount, total: 0 });
});

/* GET /goals */
export const getGoals = asyncHandler(async (req, res) => {
  const pet = await Pet.findById(req.petId).select(PET_GOAL_FIELDS).lean();
  if (!pet) throw notFoundError("Pet not found.");
  const today = clientToday(req);
  const auto = computeGoals({ ...pet, trackerGoals: {} }, today);
  ok(res, { goals: computeGoals(pet, today), auto: { foodGrams: auto.foodGrams, waterMl: auto.waterMl, activityMin: auto.activityMin, mealsPerDay: auto.mealsPerDay } });
});

/* PATCH /goals (owner)  { foodGrams?, waterMl?, activityMin?, mealsPerDay? }   null = back to automatic */
export const setGoals = asyncHandler(async (req, res) => {
  const data = validate(req.body, {
    foodGrams: field(t.int({ min: 1, max: 5000 }), { nullable: true }),
    waterMl: field(t.int({ min: 1, max: 10000 }), { nullable: true }),
    activityMin: field(t.int({ min: 1, max: 600 }), { nullable: true }),
    mealsPerDay: field(t.int({ min: 1, max: 8 }), { nullable: true }),
  });
  if (!Object.keys(data).length) throw new ApiError(400, "Nothing to update.", { code: "EMPTY_UPDATE" });
  const set = Object.fromEntries(Object.entries(data).map(([k, v]) => [`trackerGoals.${k}`, v]));
  const pet = await Pet.findByIdAndUpdate(req.petId, { $set: set }, { new: true }).select(PET_GOAL_FIELDS).lean();
  if (!pet) throw notFoundError("Pet not found.");
  ok(res, { goals: computeGoals(pet, clientToday(req)) });
});
