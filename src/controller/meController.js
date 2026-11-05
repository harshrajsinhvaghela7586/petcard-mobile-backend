import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import GuardianRequest from "../models/GuardianRequest.js";
import DeviceToken from "../models/DeviceToken.js";
import MobileUser from "../models/MobileUser.js";
import Notification from "../models/Notification.js";
import Pet from "../models/Pet.js";
import PetMember from "../models/PetMember.js";
import Referral from "../models/Referral.js";
import RewardLedger from "../models/RewardLedger.js";
import RefreshToken from "../models/RefreshToken.js";
import {
  asyncHandler,
  ok,
  ApiError,
  notFoundError,
  encodeCursor,
  decodeCursor,
} from "../utils/http.js";
import { validate, field, t, clientToday, isValidDateKey, todayKey, addDays, daysBetween } from "../utils/schema.js";
import { normalizeName, isLoginPassword, isObjectId } from "../utils/validators.js";
import { parsePhone, phoneFields, phoneView } from "../utils/phone.js";
import { LANGUAGE_CODES, COUNTRY_BY_ISO, COUNTRIES, LANGUAGES } from "../config/countries.js";
import { serializeNotification } from "../services/notificationActions.js";
import { alarmsForPets } from "../services/taskService.js";
import { LIMITS, REFERRAL_REFEREE_POINTS, REFERRAL_REFERRER_POINTS, REFERRAL_WINDOW_DAYS, REFERRAL_MAX_REWARDED_PER_USER } from "../config/rewards.js";
import { serializePet } from "../services/petService.js";
import { levelProgress } from "../config/rewards.js";
import { getBalance, grant } from "../services/rewardService.js";
import { notify } from "../services/notificationService.js";
import { versionsForUser } from "../services/syncService.js";
import { EXPO_TOKEN_RE } from "../services/pushService.js";
import { deleteAccount } from "../services/accountService.js";
import { acceptUploadedPhoto, destroyAssets } from "../services/cloudinary.js";

const PROFILE_FIELDS = "name email phone country phoneCountryCode phoneNational language location relationship photo timezone notificationPrefs reminderPrefs activePet createdAt";

const RELATIONSHIPS = ["Pet Parent", "Owner", "Guardian", "Family Member", "Caretaker"];

const photoSpec = t.object({
  publicId: field(t.string({ min: 10, max: 200, pattern: /^[A-Za-z0-9/_-]+$/ }), { required: true }),
  width: field(t.int({ min: 1, max: 20000 })),
  height: field(t.int({ min: 1, max: 20000 })),
  format: field(t.key({ max: 10 })),
});

const publicProfile = (u) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  ...phoneView(u),
  country: u.country || "",
  language: u.language || "en",
  location: u.location || "",
  relationship: u.relationship || "",
  photoUrl: u.photo?.url || null,
  timezone: u.timezone || "",
  notificationPrefs: {
    push: u.notificationPrefs?.push !== false,
    email: u.notificationPrefs?.email !== false,
  },
  reminderPrefs: {
    sound: u.reminderPrefs?.sound !== false,
    vibrate: u.reminderPrefs?.vibrate !== false,
    defaultMinutesBefore: u.reminderPrefs?.defaultMinutesBefore ?? 10,
  },
  activePetId: u.activePet ? String(u.activePet) : null,
  createdAt: u.createdAt,
});

const isTimezone = (value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

/* ---------- bootstrap: one call when the app starts ---------- */

/* GET /api/me/bootstrap */
export const bootstrap = asyncHandler(async (req, res) => {
  const today = clientToday(req);

  const [user, members, wallet, unread] = await Promise.all([
    MobileUser.findById(req.user.id).select(PROFILE_FIELDS).lean(),
    PetMember.find({ user: req.user.id }).select("pet role permissions").sort({ createdAt: 1 }).lean(),
    getBalance(req.user.id),
    Notification.countDocuments({ user: req.user.id, readAt: null }),
  ]);
  if (!user) throw notFoundError("Account not found.");

  const pets = await Pet.find({ _id: { $in: members.map((m) => m.pet) } }).lean();
  const byId = new Map(pets.map((p) => [String(p._id), p]));
  const ownedIds = members.filter((m) => m.role === "owner").map((m) => m.pet);
  const pendingGuardianRequests = ownedIds.length
    ? await GuardianRequest.countDocuments({ pet: { $in: ownedIds }, status: "pending" })
    : 0;

  const memberPetIds = members.filter((m) => byId.has(String(m.pet))).map((m) => String(m.pet));
  // The app keeps showing the pet the user last picked, as long as they still have access to it.
  const activePetId = user.activePet && memberPetIds.includes(String(user.activePet)) ? String(user.activePet) : memberPetIds[0] ?? null;

  ok(res, {
    user: publicProfile(user),
    activePetId,
    pets: members
      .filter((m) => byId.has(String(m.pet)))
      .map((m) => {
        const serialized = serializePet(byId.get(String(m.pet)), { role: m.role, permissions: m.permissions, today });
        if (m.role !== "owner" && !(m.permissions || ["view_pet", "view_tasks"]).includes("view_health")) delete serialized.health;
        return serialized;
      }),
    // The server decides this, not a flag stored on the device.
    hasPet: members.length > 0,
    wallet,
    unreadNotifications: unread,
    pendingGuardianRequests,
  });
});

/* ---------- sync: tiny "did anything change?" check used by the app cache ---------- */

export const sync = asyncHandler(async (req, res) => {
  ok(res, { versions: await versionsForUser(req.user.id) });
});

/* ---------- profile ---------- */


export const claimDailyLoginReward = asyncHandler(async (req, res) => {
  const petId = String(req.body?.petId ?? "");
  if (!isObjectId(petId)) throw new ApiError(400, "A valid pet is required to claim daily XP.", { code: "VALIDATION_ERROR" });
  const date = String(req.body?.date ?? clientToday(req));
  if (!isValidDateKey(date) || date < todayKey(-1) || date > todayKey(1)) {
    throw new ApiError(400, "Invalid local reward date.", { code: "INVALID_DATE" });
  }
  const membership = await PetMember.findOne({ pet: petId, user: req.user.id }).select("role").lean();
  if (!membership || membership.role !== "owner") throw notFoundError("Pet not found.");
  const reward = await grant({
    userId: req.user.id,
    petId,
    kind: "daily_login",
    points: 1,
    xp: 5,
    key: `daily-login:${req.user.id}:${date}`,
    date,
  });
  const pet = await Pet.findById(petId).select("xp level streak").lean();
  // An already-claimed day changes nothing, so it must not make every cached screen look outdated.
  if (reward.duplicate) res.locals.noBump = true;
  ok(res, {
    rewarded: !reward.duplicate,
    points: reward.duplicate ? 0 : 1,
    xp: reward.duplicate ? 0 : 5,
    progress: pet ? levelProgress(pet.xp) : null,
    wallet: await getBalance(req.user.id),
  });
});

export const getProfile = asyncHandler(async (req, res) => {
  const user = await MobileUser.findById(req.user.id).select(PROFILE_FIELDS).lean();
  if (!user) throw notFoundError("Account not found.");
  ok(res, { user: publicProfile(user) });
});

/* PATCH /api/me/profile  (email cannot be changed here) */
export const updateProfile = asyncHandler(async (req, res) => {
  const raw = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const update = {};
  const unset = {};
  const errors = {};
  let oldPhotoId = null;

  if (raw.name !== undefined) {
    const name = normalizeName(raw.name);
    if (name) update.name = name;
    else errors.name = "Enter a valid name.";
  }
  if (raw.phone !== undefined || raw.country !== undefined) {
    const current = await MobileUser.findById(req.user.id).select("country phone").lean();
    if (raw.phone !== undefined) {
      const parsed = parsePhone({
        phone: raw.phone,
        country: raw.country,
        dialCode: raw.phoneCountryCode ?? raw.dialCode,
        fallbackCountry: current?.country || undefined,
      });
      if (!parsed.ok) errors.phone = parsed.message;
      else Object.assign(update, phoneFields(parsed));
    } else if (typeof raw.country === "string" && COUNTRY_BY_ISO.has(raw.country.toUpperCase())) {
      update.country = raw.country.toUpperCase();
    } else errors.country = "Unknown country.";
  }
  if (raw.location !== undefined) {
    // Optional: an empty value clears it. Spaces are collapsed (the app does the same before comparing).
    const location = typeof raw.location === "string" ? raw.location.replace(/\s+/g, " ").trim() : null;
    if (location !== null && location.length <= 100 && !/[<>]/.test(location)) update.location = location;
    else errors.location = "Enter a valid location (up to 100 characters).";
  }
  if (raw.relationship !== undefined) {
    // "" clears it.
    if (raw.relationship === "" || (typeof raw.relationship === "string" && RELATIONSHIPS.includes(raw.relationship))) {
      update.relationship = raw.relationship;
    } else errors.relationship = "Choose a valid relationship.";
  }
  if (raw.photo !== undefined) {
    // null removes the photo; an object must be an upload that sits in this user's own profile folder.
    const current = await MobileUser.findById(req.user.id).select("photo").lean();
    oldPhotoId = current?.photo?.publicId ?? null;
    if (raw.photo === null) {
      unset.photo = 1;
    } else {
      const spec = validate({ photo: raw.photo }, { photo: field(photoSpec, { required: true }) }).photo;
      update.photo = acceptUploadedPhoto(spec, { userId: req.user.id, petId: null, profile: true });
    }
  }
  if (raw.language !== undefined) {
    if (typeof raw.language === "string" && LANGUAGE_CODES.includes(raw.language.toLowerCase())) update.language = raw.language.toLowerCase();
    else errors.language = "Unsupported language.";
  }
  if (raw.reminderPrefs !== undefined) {
    const prefs = validate(raw.reminderPrefs, {
      sound: field(t.bool()),
      vibrate: field(t.bool()),
      defaultMinutesBefore: field(t.int({ min: 0, max: 1440 })),
    });
    for (const [k, v] of Object.entries(prefs)) update[`reminderPrefs.${k}`] = v;
  }
  if (raw.timezone !== undefined) {
    if (typeof raw.timezone === "string" && raw.timezone.length <= 64 && isTimezone(raw.timezone)) {
      update.timezone = raw.timezone;
    } else errors.timezone = "Unknown timezone.";
  }
  if (raw.notificationPrefs !== undefined) {
    const prefs = validate(raw.notificationPrefs, { push: field(t.bool()), email: field(t.bool()) });
    for (const [k, v] of Object.entries(prefs)) update[`notificationPrefs.${k}`] = v;
  }

  if (Object.keys(errors).length) {
    throw new ApiError(400, "Please check the highlighted fields.", { code: "VALIDATION_ERROR", extra: { fields: errors } });
  }
  if (!Object.keys(update).length && !Object.keys(unset).length) {
    throw new ApiError(400, "Nothing to update.", { code: "EMPTY_UPDATE" });
  }

  const ops = {};
  if (Object.keys(update).length) ops.$set = update;
  if (Object.keys(unset).length) ops.$unset = unset;

  const user = await MobileUser.findByIdAndUpdate(req.user.id, ops, { new: true, runValidators: true })
    .select(PROFILE_FIELDS)
    .lean();
  if (!user) throw notFoundError("Account not found.");
  if (oldPhotoId && oldPhotoId !== user.photo?.publicId) destroyAssets([oldPhotoId]);
  ok(res, { user: publicProfile(user) });
});

/* DELETE /api/me   { password }   Permanent account + data deletion. */
export const removeAccount = asyncHandler(async (req, res) => {
  const password = req.body?.password;
  if (!isLoginPassword(password)) {
    throw new ApiError(400, "Enter your password to confirm.", { code: "PASSWORD_REQUIRED" });
  }
  const user = await MobileUser.findById(req.user.id).select("+passwordHash").lean();
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new ApiError(403, "Incorrect password.", { code: "INVALID_PASSWORD" });
  }
  await deleteAccount(req.user.id);
  ok(res, { message: "Your account and data were deleted." });
});

/* ---------- rewards ---------- */

const LEDGER_LABELS = {
  task_complete: "Daily task bonus",
  daily_login: "Daily login",
  streak_bonus: "Streak reward",
  level_up_bonus: "Level-up bonus",
  referral_referrer: "Referral reward",
  referral_referee: "Referral welcome bonus",
  sticker_slot: "Sticker slot",
  sticker_purchase: "Sticker purchase",
  admin_adjustment: "Adjustment by PetCard",
};

/* GET /api/me/rewards?cursor&limit   Paw Points balance + history. */
export const rewards = asyncHandler(async (req, res) => {
  const q = validate(req.query, {
    limit: field(t.int({ min: 1, max: 50, coerce: true })),
    cursor: field(t.string({ max: 300 })),
  });
  const limit = q.limit ?? 20;
  const cursor = decodeCursor(q.cursor);
  const filter = { user: req.user.id };
  if (cursor) {
    if (!isObjectId(cursor.id)) throw new ApiError(400, "Invalid cursor.", { code: "INVALID_CURSOR" });
    filter._id = { $lt: cursor.id };
  }

  const rows = await RewardLedger.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  const page = rows.slice(0, limit);

  ok(res, {
    wallet: await getBalance(req.user.id),
    history: page.map((r) => ({
      id: String(r._id),
      kind: r.kind,
      points: r.points,
      xp: r.xp,
      label: LEDGER_LABELS[r.kind] ?? r.kind,
      petId: r.pet ? String(r.pet) : null,
      createdAt: r.createdAt,
    })),
    nextCursor: rows.length > limit ? encodeCursor({ id: String(page[page.length - 1]._id) }) : null,
  });
});

/* ---------- notifications ---------- */

/* GET /api/me/notifications?unread=true&cursor&limit */
export const listNotifications = asyncHandler(async (req, res) => {
  const q = validate(req.query, {
    limit: field(t.int({ min: 1, max: 50, coerce: true })),
    cursor: field(t.string({ max: 300 })),
    unread: field(t.bool({ coerce: true })),
    type: field(t.string({ max: 40, pattern: /^[a-z_]{1,40}$/ })),
  });
  const limit = q.limit ?? 20;
  const cursor = decodeCursor(q.cursor);

  const filter = { user: req.user.id, ...(q.unread ? { readAt: null } : {}), ...(q.type ? { type: q.type } : {}) };
  if (cursor) {
    if (!isObjectId(cursor.id)) throw new ApiError(400, "Invalid cursor.", { code: "INVALID_CURSOR" });
    filter._id = { $lt: cursor.id };
  }

  const rows = await Notification.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  const page = rows.slice(0, limit);

  ok(res, {
    notifications: page.map(serializeNotification),
    nextCursor: rows.length > limit ? encodeCursor({ id: String(page[page.length - 1]._id) }) : null,
  });
});

/* GET /api/me/notifications/unread-count */
export const unreadCount = asyncHandler(async (req, res) => {
  ok(res, { count: await Notification.countDocuments({ user: req.user.id, readAt: null }) });
});

/* POST /api/me/notifications/read   { ids: [..] }  or  { all: true } */
export const markRead = asyncHandler(async (req, res) => {
  const data = validate(req.body, {
    ids: field(t.array(t.objectId(), { max: 100 })),
    all: field(t.bool()),
  });
  if (!data.all && !data.ids?.length) {
    throw new ApiError(400, "Nothing to mark.", { code: "EMPTY_UPDATE" });
  }
  const filter = { user: req.user.id, readAt: null, ...(data.all ? {} : { _id: { $in: data.ids } }) };
  const result = await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  ok(res, { updated: result.modifiedCount });
});

/* ---------- push devices ---------- */

/* POST /api/me/devices   { token, platform } */
export const registerDevice = asyncHandler(async (req, res) => {
  const data = validate(req.body, {
    token: field(t.string({ max: 200, pattern: EXPO_TOKEN_RE, message: "Invalid push token." }), { required: true }),
    platform: field(t.oneOf(["ios", "android", "web"])),
  });

  await DeviceToken.findOneAndUpdate(
    { token: data.token },
    { $set: { user: req.user.id, platform: data.platform ?? "android", lastSeenAt: new Date() } },
    { upsert: true }
  );

  // Keep only the newest devices per user.
  const devices = await DeviceToken.find({ user: req.user.id }).sort({ lastSeenAt: -1 }).select("_id").lean();
  if (devices.length > LIMITS.devicesPerUser) {
    await DeviceToken.deleteMany({ _id: { $in: devices.slice(LIMITS.devicesPerUser).map((d) => d._id) } });
  }
  ok(res, { message: "Device registered." });
});

/* POST /api/me/devices/unregister   { token }   (call on logout) */
export const unregisterDevice = asyncHandler(async (req, res) => {
  const { token } = validate(req.body, { token: field(t.string({ max: 200, pattern: EXPO_TOKEN_RE }), { required: true }) });
  await DeviceToken.deleteOne({ user: req.user.id, token });
  ok(res, { message: "Device removed." });
});

/* ---------- referral ---------- */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
const makeCode = () => Array.from({ length: 8 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join("");

async function ensureReferralCode(userId) {
  const current = await MobileUser.findById(userId).select("referralCode").lean();
  if (current?.referralCode) return current.referralCode;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = makeCode();
    try {
      const res = await MobileUser.updateOne(
        { _id: userId, referralCode: { $exists: false } },
        { $set: { referralCode: code } }
      );
      if (res.modifiedCount === 1) return code;
      const again = await MobileUser.findById(userId).select("referralCode").lean();
      if (again?.referralCode) return again.referralCode;
    } catch (error) {
      if (error?.code !== 11000) throw error; // code collision: try another
    }
  }
  throw new ApiError(503, "Please try again.", { code: "TRY_AGAIN" });
}

/* GET /api/me/referral */
export const getReferral = asyncHandler(async (req, res) => {
  const [code, user, invited] = await Promise.all([
    ensureReferralCode(req.user.id),
    MobileUser.findById(req.user.id).select("referredBy createdAt").lean(),
    Referral.countDocuments({ referrer: req.user.id }),
  ]);
  const windowEnds = new Date(user.createdAt.getTime() + REFERRAL_WINDOW_DAYS * 86_400_000);

  ok(res, {
    code,
    invitedCount: invited,
    rewards: { youGet: REFERRAL_REFERRER_POINTS, friendGets: REFERRAL_REFEREE_POINTS },
    canApplyCode: !user.referredBy && windowEnds > new Date(),
    alreadyReferred: Boolean(user.referredBy),
  });
});

/* POST /api/me/referral/apply   { code }   One time per account. */
export const applyReferral = asyncHandler(async (req, res) => {
  const { code: raw } = validate(req.body, { code: field(t.string({ max: 16 }), { required: true }) });
  const code = raw.toUpperCase();
  if (!CODE_RE.test(code)) throw new ApiError(400, "That code is not valid.", { code: "INVALID_CODE" });

  const me = await MobileUser.findById(req.user.id).select("referredBy createdAt").lean();
  if (me.referredBy) throw new ApiError(409, "You already used a referral code.", { code: "ALREADY_REFERRED" });
  if (Date.now() - me.createdAt.getTime() > REFERRAL_WINDOW_DAYS * 86_400_000) {
    throw new ApiError(400, "Referral codes can only be added in your first week.", { code: "REFERRAL_WINDOW_CLOSED" });
  }

  const referrer = await MobileUser.findOne({ referralCode: code, isEmailVerified: true }).select("_id name").lean();
  if (!referrer) throw new ApiError(400, "That code is not valid.", { code: "INVALID_CODE" });
  if (String(referrer._id) === req.user.id) {
    throw new ApiError(400, "You cannot use your own code.", { code: "SELF_REFERRAL" });
  }

  try {
    await Referral.create({ referrer: referrer._id, referee: req.user.id, code });
  } catch (error) {
    if (error?.code === 11000) throw new ApiError(409, "You already used a referral code.", { code: "ALREADY_REFERRED" });
    throw error;
  }
  await MobileUser.updateOne({ _id: req.user.id }, { $set: { referredBy: referrer._id } });

  // Applying a code only creates a pending referral. The referrer is rewarded
  // after the new account completes its first pet setup.

  ok(res, {
    message: "Referral code applied successfully. Your friend will receive the bonus after you complete your first pet setup.",
    status: "pending_qualification",
    pointsEarned: 0,
    wallet: await getBalance(req.user.id),
  });
});

/* DELETE /api/me/notifications/:id   Remove one notification. */
export const deleteNotification = asyncHandler(async (req, res) => {
  if (!isObjectId(req.params.id)) throw notFoundError("Notification not found.");
  const result = await Notification.deleteOne({ _id: req.params.id, user: req.user.id });
  if (!result.deletedCount) throw notFoundError("Notification not found.");
  ok(res, { message: "Notification removed." });
});

/* DELETE /api/me/notifications?readOnly=true   Clear all (or only the already-read) notifications. */
export const clearNotifications = asyncHandler(async (req, res) => {
  const { readOnly } = validate(req.query, { readOnly: field(t.bool({ coerce: true })) });
  const result = await Notification.deleteMany({ user: req.user.id, ...(readOnly === false ? {} : { readAt: { $ne: null } }) });
  ok(res, { removed: result.deletedCount });
});

/* ---------- active pet, reminders, meta ---------- */

/* PUT /api/me/active-pet   { petId }   Remember which pet the app is showing. */
export const setActivePet = asyncHandler(async (req, res) => {
  const { petId } = validate(req.body, { petId: field(t.objectId(), { required: true }) });
  if (!(await PetMember.exists({ pet: petId, user: req.user.id }))) throw notFoundError("Pet not found.");
  await MobileUser.updateOne({ _id: req.user.id }, { $set: { activePet: petId } });
  ok(res, { activePetId: petId });
});

/* GET /api/me/reminders?from&to   Alarm times for ALL the user's pets (the app re-schedules local notifications from this). */
export const myReminders = asyncHandler(async (req, res) => {
  const today = clientToday(req);
  const q = validate(req.query, { from: field(t.dateKey()), to: field(t.dateKey()) });
  const from = q.from ?? today;
  const to = q.to ?? addDays(from, 14);
  const span = daysBetween(from, to);
  if (span < 0 || span > 31) throw new ApiError(400, "Choose a range of up to 32 days.", { code: "INVALID_RANGE" });

  const [members, user] = await Promise.all([
    PetMember.find({ user: req.user.id }).select("pet role permissions").lean(),
    MobileUser.findById(req.user.id).select("reminderPrefs").lean(),
  ]);
  const allowed = members.filter((m) => m.role === "owner" || (m.permissions || []).includes("view_tasks"));
  const pets = await Pet.find({ _id: { $in: allowed.map((m) => m.pet) } }).select("name reminders").lean();
  const enabled = pets.filter((p) => p.reminders?.enabled !== false);
  const names = new Map(pets.map((p) => [String(p._id), p.name]));
  const alarms = await alarmsForPets(enabled.map((p) => p._id), { from, to, prefs: user?.reminderPrefs ?? {}, names });
  ok(res, { from, to, alarms });
});

/* GET /api/meta   Countries (dial codes + digit lengths) and languages for the pickers. Public. */
export const meta = asyncHandler(async (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  ok(res, {
    countries: COUNTRIES.map((c) => ({ iso: c.iso, name: c.name, dialCode: c.dial, minLength: c.min, maxLength: c.max })),
    languages: LANGUAGES,
    defaultCountry: "IN",
    defaultLanguage: "en",
  });
});