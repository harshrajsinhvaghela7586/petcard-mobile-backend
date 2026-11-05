import Pet from "../../models/Pet.js";
import MobileUser from "../../models/MobileUser.js";
import RewardWallet from "../../models/RewardWallet.js";
import RewardLedger from "../../models/RewardLedger.js";
import AchievementUnlock from "../../models/AchievementUnlock.js";
import TaskCompletion from "../../models/TaskCompletion.js";
import { asyncHandler, ok, ApiError } from "../../utils/http.js";
import { COUNTRY_BY_ISO, LANGUAGE_CODES } from "../../config/countries.js";
import { attachUserProgress, attachPetProgress } from "../../services/adminProgress.js";
import { createTtlCache } from "../../utils/ttlCache.js";
import { pageArgs, enumOf, boolOf, intOf, paginationOf, byId, searchOf, containsRx } from "../../utils/adminQuery.js";

/*
 * Leaderboards for USERS and PETS, both filterable.
 *
 *   GET /api/admin/rankings/users?by=lifetime|points|xp|level|achievements&period=all|week|month&country&language&verified&search
 *   GET /api/admin/rankings/pets?by=xp|streak|longestStreak|achievements|tasks&period=all|week|month&type&breed&gender&minLevel&country&search
 *
 * rank = position in the list; equal values share a rank. `period` ranks by what was earned
 * in the last 7/30 days (top 1000 only). Results are cached for 30 seconds.
 */

const cache = createTtlCache({ ttlMs: 30_000, max: 100 });
const PERIOD_DAYS = { week: 7, month: 30 };
const PERIOD_CAP = 1000;

const periodOf = (req) => enumOf(req.query.period, ["all", "week", "month"], "period") ?? "all";
const sinceOf = (period) => (period === "all" ? null : new Date(Date.now() - PERIOD_DAYS[period] * 86_400_000));

function assignRanks(rows, valueOf, firstRank) {
  let prevValue;
  let prevRank = firstRank - 1;
  return rows.map((row, i) => {
    const value = valueOf(row);
    const rank = i > 0 && value === prevValue ? prevRank : firstRank + i;
    prevValue = value;
    prevRank = rank;
    return { rank, value, row };
  });
}

/* ---------------------------- users ---------------------------- */

const USER_METRICS = ["lifetime", "points", "xp", "level", "achievements"];

function userFilterOf(req) {
  const country = typeof req.query.country === "string" && req.query.country ? req.query.country.toUpperCase() : undefined;
  if (country && !COUNTRY_BY_ISO.has(country)) throw new ApiError(400, "Unknown country.", { code: "VALIDATION_ERROR" });
  const language = enumOf(req.query.language, LANGUAGE_CODES, "language");
  const verified = boolOf(req.query.verified);
  const search = searchOf(req);
  const f = { disabledAt: null };
  if (country) f.country = country;
  if (language) f.language = language;
  if (verified !== undefined) f.isEmailVerified = verified;
  if (search) f.$or = [{ name: containsRx(search) }, { email: containsRx(search) }];
  return f;
}

const prefixed = (f, prefix) =>
  Object.fromEntries(
    Object.entries(f).map(([k, v]) => (k === "$or" ? [k, v.map((c) => Object.fromEntries(Object.entries(c).map(([ck, cv]) => [`${prefix}${ck}`, cv])))] : [`${prefix}${k}`, v]))
  );

/** Joins the user document and applies the user filters; the id field of the source is `_id`. */
const joinUsers = (userFilter) => [
  { $lookup: { from: MobileUser.collection.name, localField: "_id", foreignField: "_id", as: "u" } },
  { $unwind: "$u" },
  { $match: prefixed(userFilter, "u.") },
];

async function userSource(by, period, userFilter) {
  const since = sinceOf(period);
  if (since) {
    // Earned in the period: points (lifetime/points) or XP, from the ledger.
    const field = by === "xp" || by === "level" ? "$xp" : "$points";
    const match = by === "xp" || by === "level" ? { xp: { $gt: 0 } } : { points: { $gt: 0 } };
    const rows = await RewardLedger.aggregate([
      { $match: { createdAt: { $gte: since }, ...match } },
      { $group: { _id: "$user", value: { $sum: field } } },
      { $sort: { value: -1, _id: 1 } },
      { $limit: 5000 },
      ...joinUsers(userFilter),
      { $limit: PERIOD_CAP },
      { $project: { value: 1 } },
    ]);
    return { rows, total: rows.length, windowed: true };
  }

  if (by === "lifetime" || by === "points") {
    const key = by === "lifetime" ? "lifetimePoints" : "pawPoints";
    return { base: [{ $sort: { [key]: -1, _id: 1 } }, { $project: { _id: "$user", value: `$${key}` } }, ...joinUsers(userFilter)], model: RewardWallet };
  }

  if (by === "achievements") {
    return { base: [{ $group: { _id: "$user", value: { $sum: 1 } } }, { $sort: { value: -1, _id: 1 } }, ...joinUsers(userFilter)], model: AchievementUnlock };
  }
  // xp / level come from the pets a user owns
  const value = by === "level" ? { $max: "$level" } : { $sum: "$xp" };
  return { base: [{ $group: { _id: "$owner", value, xp: { $sum: "$xp" } } }, { $sort: { value: -1, xp: -1, _id: 1 } }, ...joinUsers(userFilter)], model: Pet };
}

export const users = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageArgs(req, { defaultLimit: 25, maxLimit: 100 });
  const by = enumOf(req.query.by, USER_METRICS, "by") ?? "lifetime";
  const period = periodOf(req);
  const userFilter = userFilterOf(req);
  const cacheKey = `u:${by}:${period}:${JSON.stringify(userFilter, (_k, v) => (v instanceof RegExp ? v.source : v))}:${page}:${limit}`;

  const result = await cache.wrap(cacheKey, async () => {
    const src = await userSource(by, period, userFilter);
    let rows;
    let total;
    if (src.windowed) {
      rows = src.rows.slice(skip, skip + limit);
      total = src.total;
    } else {
      const [page_, count] = await Promise.all([
        src.model.aggregate([...src.base, { $skip: skip }, { $limit: limit }, { $project: { value: 1 } }]),
        src.model.aggregate([...src.base, { $count: "n" }]),
      ]);
      rows = page_;
      total = count[0]?.n ?? 0;
    }
    const docs = await MobileUser.find({ _id: { $in: rows.map((r) => r._id) } }).select("name email country language isEmailVerified createdAt").lean();
    const withProgress = byId(await attachUserProgress(docs));
    let firstRank = skip + 1;
    if (skip > 0 && rows.length && !src.windowed) {
      // A tie with the previous page keeps the same rank.
      const [ahead] = await src.model.aggregate([...src.base, { $match: { value: { $gt: rows[0].value } } }, { $count: "n" }]);
      firstRank = (ahead?.n ?? 0) + 1;
    }
    const ranked = assignRanks(rows, (r) => r.value, firstRank).map(({ rank, value, row }) => {
      const u = withProgress.get(String(row._id));
      return u
        ? { rank, value, user: { id: String(u._id), name: u.name, email: u.email, country: u.country, language: u.language }, level: u.level, totalXp: u.totalXp, petCount: u.petCount, achievements: u.achievements, wallet: u.wallet }
        : null;
    });
    return { items: ranked.filter(Boolean), pagination: paginationOf(page, limit, total) };
  });
  ok(res, { by, period, ...result });
});

/* ----------------------------- pets ----------------------------- */

const PET_METRICS = ["xp", "streak", "longestStreak", "achievements", "tasks"];
const PET_SORT = { xp: { xp: -1, _id: 1 }, streak: { "streak.current": -1, _id: 1 }, longestStreak: { "streak.longest": -1, _id: 1 } };
const PET_VALUE = { xp: "xp", streak: "streak.current", longestStreak: "streak.longest" };
const dig = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj);

async function petFilterOf(req) {
  const text = (k) => (typeof req.query[k] === "string" && req.query[k].trim() ? req.query[k].trim().slice(0, 60) : undefined);
  const f = {};
  if (text("type")) f.type = text("type").toLowerCase();
  if (text("breed")) f.breed = text("breed");
  if (["male", "female", "unknown"].includes(req.query.gender)) f.gender = req.query.gender;
  const minLevel = intOf(req.query.minLevel, { min: 1, max: 10 });
  if (minLevel) f.level = { $gte: minLevel };
  const search = searchOf(req);
  if (search) f.name = containsRx(search);
  const country = typeof req.query.country === "string" && req.query.country ? req.query.country.toUpperCase() : undefined;
  if (country) {
    if (!COUNTRY_BY_ISO.has(country)) throw new ApiError(400, "Unknown country.", { code: "VALIDATION_ERROR" });
    f.owner = { $in: await MobileUser.find({ country }).distinct("_id") };
  }
  return f;
}

export const pets = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageArgs(req, { defaultLimit: 25, maxLimit: 100 });
  const by = enumOf(req.query.by, PET_METRICS, "by") ?? "xp";
  const period = periodOf(req);
  const filter = await petFilterOf(req);
  const cacheKey = `p:${by}:${period}:${JSON.stringify(filter, (_k, v) => (v instanceof RegExp ? v.source : v))}:${page}:${limit}`;

  const result = await cache.wrap(cacheKey, async () => {
    let order; // [{ _id, value }] for the page
    let total;
    let firstRank = skip + 1;

    const since = sinceOf(period);
    if (since || by === "achievements" || by === "tasks") {
      // Aggregated metric: rank ids first, then keep only pets that pass the filters.
      let source;
      if (by === "achievements") source = since ? AchievementUnlock.aggregate([{ $match: { unlockedAt: { $gte: since } } }, { $group: { _id: "$pet", value: { $sum: 1 } } }]) : AchievementUnlock.aggregate([{ $group: { _id: "$pet", value: { $sum: 1 } } }]);
      else if (by === "tasks") source = TaskCompletion.aggregate([...(since ? [{ $match: { createdAt: { $gte: since } } }] : []), { $group: { _id: "$pet", value: { $sum: 1 } } }]);
      else source = RewardLedger.aggregate([{ $match: { createdAt: { $gte: since }, pet: { $ne: null }, xp: { $gt: 0 } } }, { $group: { _id: "$pet", value: { $sum: "$xp" } } }]);
      const ranked = await source.sort({ value: -1, _id: 1 }).limit(5000);
      const allowed = Object.keys(filter).length ? new Set((await Pet.find({ ...filter, _id: { $in: ranked.map((r) => r._id) } }).select("_id").lean()).map((p) => String(p._id))) : null;
      const kept = (allowed ? ranked.filter((r) => allowed.has(String(r._id))) : ranked).slice(0, 5000);
      total = kept.length;
      order = kept.slice(skip, skip + limit);
    } else {
      const field = PET_VALUE[by];
      const [rows, count] = await Promise.all([
        Pet.find(filter).sort(PET_SORT[by]).skip(skip).limit(limit).select(`_id ${field}`).lean(),
        Object.keys(filter).length ? Pet.countDocuments(filter) : Pet.estimatedDocumentCount(),
      ]);
      order = rows.map((r) => ({ _id: r._id, value: dig(r, field) ?? 0 }));
      total = count;
      if (skip > 0 && order.length) firstRank = (await Pet.countDocuments({ ...filter, [field]: { $gt: order[0].value } })) + 1;
    }

    const docs = await Pet.find({ _id: { $in: order.map((o) => o._id) } }).select("name type breed gender xp level streak avatarKey photo owner").lean();
    const [withProgress, owners] = await Promise.all([
      attachPetProgress(docs),
      MobileUser.find({ _id: { $in: docs.map((d) => d.owner) } }).select("name email country").lean(),
    ]);
    const petOf = byId(withProgress);
    const ownerOf = byId(owners);
    const items = assignRanks(order, (o) => o.value, firstRank)
      .map(({ rank, value, row }) => {
        const p = petOf.get(String(row._id));
        if (!p) return null;
        const o = ownerOf.get(String(p.owner));
        return {
          rank, value,
          pet: { id: String(p._id), name: p.name, type: p.type, breed: p.breed, gender: p.gender, avatarKey: p.avatarKey ?? null, photoUrl: p.photo?.url ?? null },
          level: p.progress.level, xp: p.progress.xp, streak: p.progress.streak, achievements: p.achievements,
          owner: o ? { id: String(o._id), name: o.name, email: o.email, country: o.country } : null,
        };
      })
      .filter(Boolean);
    return { items, pagination: paginationOf(page, limit, total) };
  });
  ok(res, { by, period, ...result });
});

/* GET /api/admin/rankings/options   What the ranking filter dropdowns can offer. */
export const options = asyncHandler(async (_req, res) => {
  ok(res, { users: { by: USER_METRICS, filters: ["country", "language", "verified", "search"] }, pets: { by: PET_METRICS, filters: ["type", "breed", "gender", "minLevel", "country", "search"] }, periods: ["all", "week", "month"] });
});
