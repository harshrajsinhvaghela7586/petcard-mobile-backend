import bcrypt from "bcryptjs";
import MobileUser from "../../models/MobileUser.js";
import Pet from "../../models/Pet.js";
import PetMember from "../../models/PetMember.js";
import RewardLedger from "../../models/RewardLedger.js";
import RewardWallet from "../../models/RewardWallet.js";
import Notification from "../../models/Notification.js";
import DeviceToken from "../../models/DeviceToken.js";
import RefreshToken from "../../models/RefreshToken.js";
import Referral from "../../models/Referral.js";
import TaskCompletion from "../../models/TaskCompletion.js";
import HealthRecord from "../../models/HealthRecord.js";
import Memory from "../../models/Memory.js";
import { asyncHandler, ok, ApiError, notFoundError, conflict } from "../../utils/http.js";
import { validate, field, t } from "../../utils/schema.js";
import { checkPassword, normalizeEmail, normalizeName } from "../../utils/validators.js";
import { parsePhone, phoneFields, phoneView } from "../../utils/phone.js";
import { COUNTRY_BY_ISO, LANGUAGE_CODES } from "../../config/countries.js";
import { deleteAccount } from "../../services/accountService.js";
import { attachUserProgress, petProgress, achievementCountsBy } from "../../services/adminProgress.js";
import { audit } from "../../services/adminAudit.js";
import {
  pageArgs, searchOf, searchFilter, boolOf, enumOf, sortOf, dateRangeOf, allOf, compact,
  runPaged, paginationOf, idOf,
} from "../../utils/adminQuery.js";

const BCRYPT_ROUNDS = 12;
const LIST_FIELDS =
  "name email phone country phoneCountryCode language isEmailVerified disabledAt lastLoginAt createdAt timezone";
const SORTS = ["createdAt", "name", "email", "lastLoginAt"];

const publicUser = (u) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  ...phoneView(u),
  country: u.country || "",
  language: u.language || "en",
  timezone: u.timezone || "",
  isEmailVerified: Boolean(u.isEmailVerified),
  disabled: Boolean(u.disabledAt),
  disabledAt: u.disabledAt ?? null,
  lastLoginAt: u.lastLoginAt ?? null,
  createdAt: u.createdAt,
  notificationPrefs: u.notificationPrefs,
  reminderPrefs: u.reminderPrefs,
  referralCode: u.referralCode ?? null,
  referredBy: u.referredBy ? String(u.referredBy) : null,
  activePet: u.activePet ? String(u.activePet) : null,
});

const shapeListRow = (u) => ({
  ...publicUser(u),
  petCount: u.petCount,
  level: u.level,
  totalXp: u.totalXp,
  bestStreak: u.bestStreak,
  achievements: u.achievements,
  wallet: u.wallet,
});

/** Filter on fields stored on the user document itself (all index-friendly). */
function userFilter(req) {
  const verified = boolOf(req.query.verified);
  const disabled = boolOf(req.query.disabled);
  const country = typeof req.query.country === "string" && req.query.country ? req.query.country.toUpperCase() : undefined;
  if (country && !COUNTRY_BY_ISO.has(country)) throw new ApiError(400, "Unknown country.", { code: "VALIDATION_ERROR" });
  const language = enumOf(req.query.language, LANGUAGE_CODES, "language");
  const created = dateRangeOf(req);
  return allOf(
    searchFilter(searchOf(req), ["name", "email", "phone"], { emailField: "email" }),
    compact({
      isEmailVerified: verified,
      country,
      language,
      createdAt: created,
      ...(disabled === true ? { disabledAt: { $type: "date" } } : disabled === false ? { disabledAt: null } : {}),
    })
  );
}

/* GET /api/admin/users?search&verified&disabled&country&language&hasPet&from&to&sort&order&page&limit */
export const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageArgs(req);
  const { spec } = sortOf(req, SORTS);
  const filter = userFilter(req);
  const hasPet = boolOf(req.query.hasPet);

  let items;
  let pagination;
  if (hasPet === undefined) {
    ({ items, pagination } = await runPaged(MobileUser, { filter, sort: spec, skip, limit, select: LIST_FIELDS, page }));
  } else {
    // A user has at most LIMITS.petsPerOwner pets, so this join stays small; owner is indexed.
    const joined = [
      { $match: filter },
      { $lookup: { from: Pet.collection.name, localField: "_id", foreignField: "owner", as: "_p" } },
      { $match: { "_p.0": { $exists: hasPet } } },
    ];
    const [rows, count] = await Promise.all([
      MobileUser.aggregate([...joined, { $sort: spec }, { $skip: skip }, { $limit: limit }, { $project: { _p: 0, passwordHash: 0 } }]),
      MobileUser.aggregate([...joined, { $count: "n" }]),
    ]);
    items = rows;
    pagination = paginationOf(page, limit, count[0]?.n ?? 0);
  }

  const withProgress = await attachUserProgress(items);
  ok(res, { items: withProgress.map(shapeListRow), pagination });
});

/* GET /api/admin/users/stats   Totals for the header cards of the users page. */
export const stats = asyncHandler(async (_req, res) => {
  const day = new Date(Date.now() - 24 * 3600_000);
  const week = new Date(Date.now() - 7 * 24 * 3600_000);
  const [total, verified, disabled, newToday, newWeek, activeWeek] = await Promise.all([
    MobileUser.estimatedDocumentCount(),
    MobileUser.countDocuments({ isEmailVerified: true }),
    MobileUser.countDocuments({ disabledAt: { $type: "date" } }),
    MobileUser.countDocuments({ createdAt: { $gte: day } }),
    MobileUser.countDocuments({ createdAt: { $gte: week } }),
    MobileUser.countDocuments({ lastLoginAt: { $gte: week } }),
  ]);
  ok(res, { stats: { total, verified, unverified: total - verified, disabled, newToday, newThisWeek: newWeek, activeThisWeek: activeWeek } });
});

/* GET /api/admin/users/:id */
export const detail = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "User");
  const user = await MobileUser.findById(id).select("-passwordHash").lean();
  if (!user) throw notFoundError("User not found.");

  const [memberships, wallet, ledger, notifications, unread, devices, sessions, referral, referredCount, tasksDone, health, memories, achievements] =
    await Promise.all([
      PetMember.find({ user: id }).select("pet role permissions createdAt").lean(),
      RewardWallet.findOne({ user: id }).select("pawPoints lifetimePoints").lean(),
      RewardLedger.find({ user: id }).sort({ createdAt: -1, _id: -1 }).limit(10).select("kind points xp pet createdAt").lean(),
      Notification.find({ user: id }).sort({ createdAt: -1, _id: -1 }).limit(10).select("type title body readAt createdAt").lean(),
      Notification.countDocuments({ user: id, readAt: null }),
      DeviceToken.find({ user: id }).select("platform lastSeenAt createdAt").lean(),
      RefreshToken.countDocuments({ user: id, revokedAt: null, expiresAt: { $gt: new Date() } }),
      Referral.findOne({ referee: id }).populate("referrer", "name email").select("referrer rewarded createdAt").lean(),
      Referral.countDocuments({ referrer: id }),
      TaskCompletion.countDocuments({ user: id }),
      HealthRecord.countDocuments({ createdBy: id }),
      Memory.countDocuments({ author: id }),
      achievementCountsBy("user", [user._id]),
    ]);

  const pets = await Pet.find({ _id: { $in: memberships.map((m) => m.pet) } })
    .select("name type breed gender xp level streak avatarKey photo createdAt owner")
    .lean();
  const roleOf = new Map(memberships.map((m) => [String(m.pet), m]));
  const petRows = pets.map((p) => ({
    id: String(p._id),
    name: p.name,
    type: p.type,
    breed: p.breed,
    gender: p.gender,
    avatarKey: p.avatarKey,
    photoUrl: p.photo?.url || null,
    role: roleOf.get(String(p._id))?.role,
    permissions: roleOf.get(String(p._id))?.permissions,
    progress: petProgress(p),
    createdAt: p.createdAt,
  }));
  const owned = petRows.filter((p) => p.role === "owner");

  ok(res, {
    user: publicUser(user),
    progress: {
      level: owned.reduce((max, p) => Math.max(max, p.progress.level), owned.length ? 1 : 0),
      totalXp: owned.reduce((sum, p) => sum + p.progress.xp, 0),
      petCount: owned.length,
      guardianOf: petRows.length - owned.length,
      achievements: achievements.get(String(user._id)) ?? 0,
    },
    wallet: wallet ?? { pawPoints: 0, lifetimePoints: 0 },
    pets: petRows,
    activity: { tasksCompleted: tasksDone, healthRecordsAdded: health, memoriesAdded: memories },
    referral: { referredBy: referral?.referrer ?? null, rewarded: referral?.rewarded ?? null, referredCount },
    notifications: { unread, recent: notifications },
    recentLedger: ledger,
    devices,
    activeSessions: sessions,
  });
});

const CREATE_SPEC = {
  name: field(t.string({ min: 2, max: 100 }), { required: true }),
  email: field(t.string({ min: 6, max: 254 }), { required: true }),
  password: field(t.string({ min: 8, max: 64 }), { required: true }),
  phone: field(t.string({ max: 40, allowEmpty: true })),
  country: field(t.string({ min: 2, max: 2 })),
  language: field(t.oneOf(LANGUAGE_CODES)),
  verified: field(t.bool()),
};

/* POST /api/admin/users   Creates a ready-to-use account (verified unless `verified:false`). */
export const create = asyncHandler(async (req, res) => {
  const data = validate(req.body, CREATE_SPEC);
  const email = normalizeEmail(data.email);
  const name = normalizeName(data.name);
  const fields = {};
  if (!email) fields.email = "Enter a valid email address.";
  if (!name) fields.name = "Enter a valid name.";
  const passwordProblem = checkPassword(data.password);
  if (passwordProblem) fields.password = passwordProblem;

  const doc = { name, email, language: data.language ?? "en", isEmailVerified: data.verified !== false };
  if (data.country) {
    if (COUNTRY_BY_ISO.has(data.country.toUpperCase())) doc.country = data.country.toUpperCase();
    else fields.country = "Unknown country.";
  }
  if (data.phone !== undefined) {
    const parsed = parsePhone({ phone: data.phone, country: doc.country });
    if (!parsed.ok) fields.phone = parsed.message;
    else Object.assign(doc, phoneFields(parsed));
  }
  if (Object.keys(fields).length) {
    throw new ApiError(400, "Please check the highlighted fields.", { code: "VALIDATION_ERROR", extra: { fields } });
  }
  if (await MobileUser.exists({ email })) throw conflict("An account with this email already exists.", { code: "EMAIL_TAKEN" });

  doc.passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  let user;
  try {
    user = await MobileUser.create(doc);
  } catch (error) {
    if (error?.code === 11000) throw conflict("An account with this email already exists.", { code: "EMAIL_TAKEN" });
    throw error;
  }
  audit(req, "user.create", "user", user._id, `Created user ${email}`);
  ok(res, { user: publicUser(user.toObject()) }, 201);
});

const UPDATE_SPEC = {
  name: field(t.string({ min: 2, max: 100 })),
  phone: field(t.string({ max: 40, allowEmpty: true })),
  country: field(t.string({ min: 2, max: 2 })),
  language: field(t.oneOf(LANGUAGE_CODES)),
  isEmailVerified: field(t.bool()),
  disabled: field(t.bool()),
  notificationPrefs: field(t.object({ push: field(t.bool()), email: field(t.bool()) })),
};

/* PATCH /api/admin/users/:id */
export const update = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "User");
  const data = validate(req.body, UPDATE_SPEC);
  const current = await MobileUser.findById(id).select("country disabledAt").lean();
  if (!current) throw notFoundError("User not found.");

  const set = {};
  const errors = {};
  if (data.name !== undefined) {
    const name = normalizeName(data.name);
    if (name) set.name = name;
    else errors.name = "Enter a valid name.";
  }
  if (data.phone !== undefined || data.country !== undefined) {
    if (data.phone !== undefined) {
      const parsed = parsePhone({ phone: data.phone, country: data.country, fallbackCountry: current.country || undefined });
      if (!parsed.ok) errors.phone = parsed.message;
      else Object.assign(set, phoneFields(parsed));
    } else if (COUNTRY_BY_ISO.has(data.country.toUpperCase())) set.country = data.country.toUpperCase();
    else errors.country = "Unknown country.";
  }
  if (data.language !== undefined) set.language = data.language;
  if (data.isEmailVerified !== undefined) set.isEmailVerified = data.isEmailVerified;
  if (data.notificationPrefs) for (const [k, v] of Object.entries(data.notificationPrefs)) set[`notificationPrefs.${k}`] = v;
  if (Object.keys(errors).length) {
    throw new ApiError(400, "Please check the highlighted fields.", { code: "VALIDATION_ERROR", extra: { fields: errors } });
  }

  const ops = {};
  if (Object.keys(set).length) ops.$set = set;
  let revoke = false;
  if (data.disabled === true && !current.disabledAt) {
    ops.$set = { ...(ops.$set ?? {}), disabledAt: new Date() };
    ops.$inc = { tokenVersion: 1 }; // every access token stops working immediately
    revoke = true;
  } else if (data.disabled === false && current.disabledAt) {
    ops.$set = { ...(ops.$set ?? {}), disabledAt: null };
  }
  if (!Object.keys(ops).length) throw new ApiError(400, "Nothing to update.", { code: "EMPTY_UPDATE" });

  const user = await MobileUser.findByIdAndUpdate(id, ops, { new: true }).select("-passwordHash").lean();
  if (revoke) await RefreshToken.updateMany({ user: id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  audit(req, data.disabled === true ? "user.disable" : data.disabled === false ? "user.enable" : "user.update", "user", id, `Updated ${user.email}`, { fields: Object.keys(data) });
  ok(res, { user: publicUser(user) });
});

/* POST /api/admin/users/:id/revoke-sessions   Signs the user out of every device. */
export const revokeSessions = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "User");
  const user = await MobileUser.findByIdAndUpdate(id, { $inc: { tokenVersion: 1 } }, { new: true }).select("email").lean();
  if (!user) throw notFoundError("User not found.");
  const result = await RefreshToken.updateMany({ user: id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  audit(req, "user.revoke_sessions", "user", id, `Signed ${user.email} out everywhere`);
  ok(res, { message: "User signed out of all devices.", revoked: result.modifiedCount });
});

/* DELETE /api/admin/users/:id   body { confirmEmail }   Permanent: the user, their pets and all pet data. */
export const remove = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "User");
  const user = await MobileUser.findById(id).select("email").lean();
  if (!user) throw notFoundError("User not found.");
  if (typeof req.body?.confirmEmail !== "string" || req.body.confirmEmail.trim().toLowerCase() !== user.email) {
    throw new ApiError(400, "Type the user's email in `confirmEmail` to confirm deletion.", { code: "CONFIRMATION_REQUIRED" });
  }
  await deleteAccount(id);
  audit(req, "user.delete", "user", id, `Deleted user ${user.email}`);
  ok(res, { message: "User and all their data deleted." });
});

