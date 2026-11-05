import crypto from "node:crypto";
import Pet from "../../models/Pet.js";
import PetMember from "../../models/PetMember.js";
import MobileUser from "../../models/MobileUser.js";
import Task from "../../models/Task.js";
import TaskCompletion from "../../models/TaskCompletion.js";
import HealthRecord from "../../models/HealthRecord.js";
import Memory from "../../models/Memory.js";
import TrackerEntry from "../../models/TrackerEntry.js";
import GuardianRequest from "../../models/GuardianRequest.js";
import { asyncHandler, ok, ApiError, notFoundError } from "../../utils/http.js";
import { validate, field, t, todayKey } from "../../utils/schema.js";
import { CREATE_SPEC, UPDATE_SPEC } from "../petController.js";
import { createPet, deletePetCascade } from "../../services/petService.js";
import { assertKnownKeys } from "../../services/catalogService.js";
import { grant } from "../../services/rewardService.js";
import { notify } from "../../services/notificationService.js";
import { syncPetAchievements, achievementStatus } from "../../services/achievementService.js";
import { dueHealth } from "../../services/homeService.js";
import { serializeHealth } from "../../services/healthService.js";
import { attachPetProgress, petProgress } from "../../services/adminProgress.js";
import { audit } from "../../services/adminAudit.js";
import { qrUrlFor } from "../cardController.js";
import {
  pageArgs, searchOf, searchFilter, boolOf, intOf, sortOf, dateRangeOf, allOf, compact, runPaged, idOf, idFilter, byId,
} from "../../utils/adminQuery.js";

const LIST_FIELDS = "owner name type breed gender birthDate weightKg avatarKey photo xp level streak health.vaccinated createdAt";
const SORTS = ["createdAt", "name", "xp", "level", "streak.current", "weightKg"];

const ownerView = (u) => (u ? { id: String(u._id), name: u.name, email: u.email } : null);

const shapePet = (p, owner) => ({
  id: String(p._id),
  name: p.name,
  type: p.type,
  breed: p.breed || "",
  gender: p.gender,
  birthDate: p.birthDate ?? null,
  weightKg: p.weightKg ?? null,
  avatarKey: p.avatarKey ?? null,
  photoUrl: p.photo?.url ?? null,
  vaccinated: p.health?.vaccinated ?? null,
  owner: ownerView(owner),
  progress: p.progress ?? petProgress(p),
  achievements: p.achievements,
  createdAt: p.createdAt,
});

function petFilter(req) {
  const min = intOf(req.query.minLevel, { min: 1, max: 10 });
  const max = intOf(req.query.maxLevel, { min: 1, max: 10 });
  const level = min || max ? { ...(min ? { $gte: min } : {}), ...(max ? { $lte: max } : {}) } : undefined;
  const gender = ["male", "female", "unknown"].includes(req.query.gender) ? req.query.gender : undefined;
  const text = (key) => (typeof req.query[key] === "string" && req.query[key].trim() ? req.query[key].trim().slice(0, 60) : undefined);
  return allOf(
    searchFilter(searchOf(req), ["name", "breed", "type"]),
    compact({
      owner: idFilter(req.query.owner, "owner"),
      type: text("type")?.toLowerCase(),
      breed: text("breed"),
      gender,
      level,
      "health.vaccinated": boolOf(req.query.vaccinated),
      createdAt: dateRangeOf(req),
    })
  );
}

/* GET /api/admin/pets?search&type&breed&gender&owner&minLevel&maxLevel&vaccinated&from&to&sort&order&page&limit */
export const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageArgs(req);
  const { spec } = sortOf(req, SORTS);
  const { items, pagination } = await runPaged(Pet, { filter: petFilter(req), sort: spec, skip, limit, select: LIST_FIELDS, page });
  const [owners, withProgress] = await Promise.all([
    MobileUser.find({ _id: { $in: items.map((p) => p.owner) } }).select("name email").lean(),
    attachPetProgress(items),
  ]);
  const ownerOf = byId(owners);
  ok(res, { items: withProgress.map((p) => shapePet(p, ownerOf.get(String(p.owner)))), pagination });
});

/* GET /api/admin/pets/filters   Values for the filter dropdowns (types and breeds that exist). */
export const filters = asyncHandler(async (_req, res) => {
  const rows = await Pet.aggregate([{ $group: { _id: { type: "$type", breed: "$breed" }, pets: { $sum: 1 } } }, { $sort: { pets: -1 } }, { $limit: 500 }]);
  const types = new Map();
  for (const r of rows) {
    const entry = types.get(r._id.type) ?? { type: r._id.type, pets: 0, breeds: [] };
    entry.pets += r.pets;
    if (r._id.breed) entry.breeds.push({ breed: r._id.breed, pets: r.pets });
    types.set(r._id.type, entry);
  }
  ok(res, { types: [...types.values()].sort((a, b) => b.pets - a.pets), genders: ["male", "female", "unknown"] });
});

/* GET /api/admin/pets/:id */
export const detail = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "Pet");
  const pet = await Pet.findById(id).lean();
  if (!pet) throw notFoundError("Pet not found.");
  const today = todayKey();

  const [members, requests, activeTasks, completions, healthTotal, memories, trackerToday, due, ach] = await Promise.all([
    PetMember.find({ pet: id }).select("user role permissions createdAt").lean(),
    GuardianRequest.countDocuments({ pet: id, status: "pending" }),
    Task.countDocuments({ pet: id, archivedAt: null }),
    TaskCompletion.countDocuments({ pet: id }),
    HealthRecord.countDocuments({ pet: id }),
    Memory.countDocuments({ pet: id }),
    TrackerEntry.countDocuments({ pet: id, date: today }),
    dueHealth(id, today, { limit: 5 }),
    achievementStatus(id),
  ]);
  const users = await MobileUser.find({ _id: { $in: members.map((m) => m.user) } }).select("name email").lean();
  const userOf = byId(users);

  ok(res, {
    pet: {
      ...shapePet({ ...pet, achievements: ach?.achievements.filter((a) => a.done).length ?? 0 }, userOf.get(String(pet.owner))),
      stickerKeys: pet.stickerKeys,
      stickerSlots: pet.stickerSlots,
      activeFrameKey: pet.activeFrameKey,
      unlockedFrameKeys: pet.unlockedFrameKeys,
      health: pet.health,
      reminders: pet.reminders,
      trackerGoals: pet.trackerGoals,
      qr: { token: pet.qrToken, url: qrUrlFor(pet.qrToken) },
    },
    members: members.map((m) => ({
      userId: String(m.user),
      name: userOf.get(String(m.user))?.name ?? "Deleted user",
      email: userOf.get(String(m.user))?.email ?? "",
      role: m.role,
      permissions: m.permissions,
      since: m.createdAt,
    })),
    counts: { activeTasks, taskCompletions: completions, healthRecords: healthTotal, memories, trackerEntriesToday: trackerToday, pendingGuardianRequests: requests },
    upcomingHealth: due.map((r) => serializeHealth(r, today)),
    achievements: ach?.achievements ?? [],
    metrics: ach?.metrics ?? null,
  });
});

/* POST /api/admin/pets   { ownerId, name, type, avatarKey, ... }   Creates a pet for an existing user. */
export const create = asyncHandler(async (req, res) => {
  const { ownerId } = validate(req.body, { ownerId: field(t.objectId(), { required: true }) });
  const data = validate(req.body, CREATE_SPEC);
  if (!data.avatarKey) {
    throw new ApiError(400, "Please check the highlighted fields.", { code: "VALIDATION_ERROR", extra: { fields: { avatarKey: "This field is required." } } });
  }
  if (!(await MobileUser.exists({ _id: ownerId }))) throw notFoundError("Owner not found.");
  const { pet } = await createPet({ userId: ownerId, data });
  await syncPetAchievements(ownerId, pet._id).catch(() => undefined);
  audit(req, "pet.create", "pet", pet._id, `Created pet ${pet.name} for ${ownerId}`);
  ok(res, { pet: shapePet(pet, null) }, 201);
});

const ADMIN_UPDATE_SPEC = (() => {
  const { photo: _photo, ...rest } = UPDATE_SPEC;
  return { ...rest, type: field(t.key({ max: 30 })) };
})();

/* PATCH /api/admin/pets/:id */
export const update = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "Pet");
  const data = validate(req.body, ADMIN_UPDATE_SPEC);
  const pet = await Pet.findById(id);
  if (!pet) throw notFoundError("Pet not found.");

  const nextType = data.type ?? pet.type;
  if (data.avatarKey !== undefined) await assertKnownKeys("avatar", [data.avatarKey], nextType);
  if (data.activeFrameKey !== undefined && !(pet.unlockedFrameKeys || ["frame_default"]).includes(data.activeFrameKey)) {
    throw new ApiError(400, "This frame is not unlocked for the pet.", { code: "FRAME_LOCKED" });
  }
  for (const key of ["name", "type", "breed", "gender", "birthDate", "weightKg", "avatarKey", "activeFrameKey"]) {
    if (data[key] !== undefined) pet[key] = data[key];
  }
  for (const [k, v] of Object.entries(data.health ?? {})) pet.set(`health.${k}`, v);
  for (const [k, v] of Object.entries(data.reminders ?? {})) pet.set(`reminders.${k}`, v);
  if (!pet.isModified()) throw new ApiError(400, "Nothing to update.", { code: "EMPTY_UPDATE" });
  await pet.save();
  audit(req, "pet.update", "pet", id, `Updated pet ${pet.name}`, { fields: Object.keys(data) });
  ok(res, { pet: shapePet(pet.toObject(), null) });
});

/* DELETE /api/admin/pets/:id   body { confirmName } */
export const remove = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "Pet");
  const pet = await Pet.findById(id).select("name owner").lean();
  if (!pet) throw notFoundError("Pet not found.");
  if (typeof req.body?.confirmName !== "string" || req.body.confirmName.trim().toLowerCase() !== pet.name.toLowerCase()) {
    throw new ApiError(400, "Type the pet's name in `confirmName` to confirm deletion.", { code: "CONFIRMATION_REQUIRED" });
  }
  await deletePetCascade(id);
  audit(req, "pet.delete", "pet", id, `Deleted pet ${pet.name}`, { owner: String(pet.owner) });
  ok(res, { message: "Pet and all its data deleted." });
});

/* POST /api/admin/pets/:id/regenerate-qr */
export const regenerateQr = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "Pet");
  const qrToken = crypto.randomBytes(24).toString("base64url");
  const pet = await Pet.findByIdAndUpdate(id, { $set: { qrToken } }, { new: true }).select("qrToken name").lean();
  if (!pet) throw notFoundError("Pet not found.");
  audit(req, "pet.regenerate_qr", "pet", id, `New QR for ${pet.name}`);
  ok(res, { qr: { token: pet.qrToken, url: qrUrlFor(pet.qrToken) } });
});

/* POST /api/admin/pets/:id/grant-xp   { xp, note }   Adds XP (levels up and notifies like normal play). */
export const grantXp = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "Pet");
  const data = validate(req.body, {
    xp: field(t.int({ min: 1, max: 20000 }), { required: true }),
    note: field(t.string({ min: 3, max: 200 }), { required: true }),
  });
  const pet = await Pet.findById(id).select("name owner").lean();
  if (!pet) throw notFoundError("Pet not found.");
  const result = await grant({ userId: pet.owner, petId: id, kind: "admin_adjustment", xp: data.xp, key: `admin-xp:${crypto.randomUUID()}` });
  await syncPetAchievements(pet.owner, id).catch(() => undefined);
  await notify(String(pet.owner), {
    type: "admin_reward",
    title: `${pet.name} received ${data.xp} bonus XP`,
    body: data.note,
    data: { petId: String(id) },
  });
  audit(req, "pet.grant_xp", "pet", id, `+${data.xp} XP for ${pet.name}`, { note: data.note });
  ok(res, { pet: result.pet ? { id: String(id), xp: result.pet.xp, level: result.pet.level } : null, leveledUp: result.leveledUp ?? null }, 201);
});



/* GET /api/admin/pets/frames?search&page&limit
 * Current frame ownership snapshot. The Pet schema stores unlockedFrameKeys, not a
 * timestamped frame-unlock event stream, so this endpoint deliberately reports
 * current ownership and does not fabricate unlock dates.
 */
export const frameUnlocks = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageArgs(req, { defaultLimit: 25, maxLimit: 100 });
  const search = searchOf(req);
  let ownerFilter = null;
  if (search) {
    const owners = await MobileUser.find(searchFilter(search, ["name", "email"])).limit(500).distinct("_id");
    ownerFilter = { owner: { $in: owners } };
  }
  const filter = { "unlockedFrameKeys.1": { $exists: true }, ...(ownerFilter || {}) };
  const { items, pagination } = await runPaged(Pet, { filter, sort: { level: -1, xp: -1, _id: 1 }, skip, limit, page });
  const owners = await MobileUser.find({ _id: { $in: items.map((p) => p.owner) } }).select("name email").lean();
  const ownerOf = byId(owners);
  ok(res, {
    items: items.map((p) => ({
      id: String(p._id), pet: { id: String(p._id), name: p.name, type: p.type },
      owner: ownerOf.get(String(p.owner)) ? { id: String(p.owner), name: ownerOf.get(String(p.owner)).name, email: ownerOf.get(String(p.owner)).email } : null,
      level: p.level, xp: p.xp, unlockedFrameKeys: p.unlockedFrameKeys || [], activeFrameKey: p.activeFrameKey,
    })),
    pagination,
  });
});
