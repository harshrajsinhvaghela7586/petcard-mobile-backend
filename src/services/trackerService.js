import mongoose from "mongoose";
import Pet from "../models/Pet.js";
import TrackerEntry, { TRACKER_KINDS } from "../models/TrackerEntry.js";
import { addDays } from "../utils/schema.js";
import { computeGoals, scoreDay, careTip, SCORE_WEIGHTS } from "./careScore.js";

const oid = (id) => new mongoose.Types.ObjectId(String(id));
export const COUNTER_KINDS = ["clicker", "whistle"];
export const LOG_KINDS = ["food", "water", "activity"];
export const UNITS = { food: "g", water: "ml", activity: "min", clicker: "clicks", whistle: "blows" };
export const MAX_LOG_ENTRIES_PER_DAY = 100;

export const PET_GOAL_FIELDS = "name type breed birthDate weightKg trackerGoals";

export const serializeEntry = (e) => ({
  id: String(e._id),
  kind: e.kind,
  date: e.date,
  time: e.time || null,
  title: e.title || "",
  amount: e.amount,
  unit: UNITS[e.kind],
  note: e.note || "",
  counter: Boolean(e.counter),
  createdBy: e.user ? String(e.user) : null,
  createdAt: e.createdAt,
});

const emptyTotals = () => Object.fromEntries(TRACKER_KINDS.map((k) => [k, { amount: 0, entries: 0 }]));

/** Totals per kind for a range: { "2026-11-01": { food: {amount, entries}, ... } }. One indexed aggregation. */
export async function totalsByDay(petId, from, to) {
  const rows = await TrackerEntry.aggregate([
    { $match: { pet: oid(petId), date: { $gte: from, $lte: to } } },
    { $group: { _id: { date: "$date", kind: "$kind" }, amount: { $sum: "$amount" }, entries: { $sum: 1 } } },
  ]);
  const days = {};
  for (const r of rows) {
    days[r._id.date] ??= emptyTotals();
    days[r._id.date][r._id.kind] = { amount: r.amount, entries: r.entries };
  }
  return days;
}

const progressOf = (amount, goal) => (goal ? Math.round(Math.min(1, amount / goal) * 100) / 100 : 0);

/** The whole tracker picture for one pet and one day. */
export async function trackerSummary({ petId, pet = null, date, today, withEntries = true }) {
  const petDoc = pet ?? (await Pet.findById(petId).select(PET_GOAL_FIELDS).lean());
  if (!petDoc) return null;

  const [totalsMap, entries] = await Promise.all([
    totalsByDay(petId, date, date),
    withEntries ? TrackerEntry.find({ pet: petId, date }).sort({ time: 1, _id: 1 }).limit(400).lean() : Promise.resolve([]),
  ]);
  const totals = totalsMap[date] ?? emptyTotals();
  const goals = computeGoals(petDoc, today ?? date);
  const result = scoreDay({ food: totals.food.amount, water: totals.water.amount, activity: totals.activity.amount }, goals);

  const byKind = (kind) => entries.filter((e) => e.kind === kind).map(serializeEntry);
  const counters = (kind) =>
    byKind(kind)
      .sort((a, b) => b.amount - a.amount)
      .map((e) => ({ id: e.id, label: e.title || "General", count: e.amount, lastTime: e.time }));

  return {
    date,
    pet: { id: String(petDoc._id), name: petDoc.name, type: petDoc.type, breed: petDoc.breed || "" },
    goals,
    totals: {
      food: { amount: totals.food.amount, goal: goals.foodGrams, unit: "g", entries: totals.food.entries, progress: progressOf(totals.food.amount, goals.foodGrams) },
      water: { amount: totals.water.amount, goal: goals.waterMl, unit: "ml", entries: totals.water.entries, progress: progressOf(totals.water.amount, goals.waterMl) },
      activity: { amount: totals.activity.amount, goal: goals.activityMin, unit: "min", entries: totals.activity.entries, progress: progressOf(totals.activity.amount, goals.activityMin) },
      clicker: { count: totals.clicker.amount },
      whistle: { count: totals.whistle.amount },
    },
    careScore: { ...result, tip: careTip(petDoc.name, result, goals), weights: SCORE_WEIGHTS },
    ...(withEntries
      ? {
          entries: { food: byKind("food"), water: byKind("water"), activity: byKind("activity") },
          counters: { clicker: counters("clicker"), whistle: counters("whistle") },
        }
      : {}),
  };
}

/** Care score for the last `days` days (oldest first): weekly chart. */
export async function careScoreHistory({ petId, today, days }) {
  const pet = await Pet.findById(petId).select(PET_GOAL_FIELDS).lean();
  if (!pet) return null;
  const from = addDays(today, -(days - 1));
  const map = await totalsByDay(petId, from, today);
  const goals = computeGoals(pet, today);
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const date = addDays(from, i);
    const t = map[date] ?? emptyTotals();
    const r = scoreDay({ food: t.food.amount, water: t.water.amount, activity: t.activity.amount }, goals);
    out.push({ date, score: r.score, label: r.label, breakdown: r.breakdown, food: t.food.amount, water: t.water.amount, activity: t.activity.amount });
  }
  const logged = out.filter((d) => d.food || d.water || d.activity);
  return {
    days: out,
    average: logged.length ? Math.round(logged.reduce((sum, d) => sum + d.score, 0) / logged.length) : 0,
    loggedDays: logged.length,
    goals,
  };
}

/** +N on a clicker/whistle counter for (day, label). Safe under concurrent taps. */
export async function bumpCounter({ petId, userId, kind, date, label, time, count }) {
  const filter = { pet: petId, date, kind, title: label, counter: true };
  const update = { $inc: { amount: count }, $set: { time: time ?? null }, $setOnInsert: { user: userId } };
  const options = { upsert: true, new: true };
  try {
    return await TrackerEntry.findOneAndUpdate(filter, update, options).lean();
  } catch (error) {
    if (error?.code !== 11000) throw error; // two first taps raced: the row exists now
    return TrackerEntry.findOneAndUpdate(filter, update, options).lean();
  }
}
