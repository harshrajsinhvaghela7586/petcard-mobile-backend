import Pet from "../models/Pet.js";
import crypto from "node:crypto";
import PetMember from "../models/PetMember.js";
import MobileUser from "../models/MobileUser.js";
import {
  asyncHandler,
  ok,
  ApiError,
  notFoundError,
} from "../utils/http.js";
import { validate, field, t, clientToday } from "../utils/schema.js";
import { MAX_CUSTOM_BREED_LENGTH, BREED_TEXT_RE } from "../config/breeds.js";
import { TASK_CATEGORIES, EXTRA_STICKER_SLOT_COSTS, FREE_STICKER_SLOTS, levelProgress } from "../config/rewards.js";
import {
  createPet,
  deletePetCascade,
  serializePet,
  effectiveStreak,
  nextStickerSlotCost,
} from "../services/petService.js";
import { assertKnownKeys, assertStickerMatchesAvatar, STICKER_AVATARS } from "../services/catalogService.js";
import { purchaseStickerForUser } from "../services/stickerService.js";
import { acceptUploadedPhoto, destroyAssets } from "../services/cloudinary.js";
import { getBalance } from "../services/rewardService.js";
import { qualifyReferral } from "../services/referralService.js";
import { syncPetAchievements } from "../services/achievementService.js";

const NAME_RE = /^[\p{L}\p{M}\p{N} '.’&-]{1,40}$/u;
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{16,80}$/;

const photoSpec = t.object({
  publicId: field(t.string({ min: 10, max: 200, pattern: /^[A-Za-z0-9/_-]+$/ }), { required: true }),
  width: field(t.int({ min: 1, max: 20000 })),
  height: field(t.int({ min: 1, max: 20000 })),
  format: field(t.key({ max: 10 })),
});

const healthSpec = t.object({
  vaccinated: field(t.bool(), { nullable: true }),
  allergies: field(t.array(t.string({ max: 40 }), { max: 20 })),
  conditions: field(t.array(t.string({ max: 40 }), { max: 20 })),
  vetName: field(t.string({ max: 80, allowEmpty: true })),
  vetPhone: field(t.string({ max: 25, allowEmpty: true, pattern: /^[0-9+() -]*$/ })),
  notes: field(t.string({ max: 500, allowEmpty: true, multiline: true })),
});

const remindersSpec = t.object({
  enabled: field(t.bool()),
  time: field(t.time()),
});

const BASE = {
  name: field(t.string({ min: 1, max: 40, pattern: NAME_RE, message: "Use letters, numbers and basic punctuation." })),
  breed: field(t.string({ max: MAX_CUSTOM_BREED_LENGTH, allowEmpty: true, pattern: BREED_TEXT_RE, message: "Breed can have letters, numbers and basic punctuation only (max 30 characters)." })),
  gender: field(t.oneOf(["male", "female", "unknown"])),
  birthDate: field(t.birthDate({ allowFuture: false }), { nullable: true }),
  weightKg: field(t.number({ min: 0.05, max: 500, decimals: 2 }), { nullable: true }),
  avatarKey: field(t.key(), { nullable: true }),
  avatarLocalId: field(t.key({ max: 30 }), { nullable: true }),
  photo: field(photoSpec, { nullable: true }),
  health: field(healthSpec),
  reminders: field(remindersSpec),
};

export const CREATE_SPEC = {
  ...BASE,
  name: field(BASE.name.rule, { required: true }),
  type: field(t.key({ max: 30 }), { required: true }),
  stickerKeys: field(t.array(t.key(), { max: FREE_STICKER_SLOTS })),
  firstTask: field(
    t.object({
      title: field(t.string({ max: 80 }), { required: true }),
      category: field(t.oneOf(TASK_CATEGORIES), { required: true }),
      timeOfDay: field(t.time(), { nullable: true }),
    })
  ),
};

export const UPDATE_SPEC = { ...BASE, activeFrameKey: field(t.key({ max: 40 })) };

const idempotencyKeyOf = (req) => {
  const raw = req.get("idempotency-key");
  if (!raw) return undefined;
  if (!IDEMPOTENCY_RE.test(raw)) {
    throw new ApiError(400, "Invalid Idempotency-Key.", { code: "INVALID_IDEMPOTENCY_KEY" });
  }
  return raw;
};

/* GET /api/pets */
export const listPets = asyncHandler(async (req, res) => {
  const today = clientToday(req);
  const members = await PetMember.find({ user: req.user.id }).select("pet role permissions").sort({ createdAt: 1 }).lean();
  const memberPetIds = members.map((m) => m.pet);
  // Backfill legacy pets created before persistent QR tokens were introduced.
  const legacyPets = await Pet.find({ _id: { $in: memberPetIds }, $or: [{ qrToken: { $exists: false } }, { qrToken: null }, { qrToken: "" }] }).select("_id").lean();
  for (const legacyPet of legacyPets) {
    await Pet.updateOne(
      { _id: legacyPet._id, $or: [{ qrToken: { $exists: false } }, { qrToken: null }, { qrToken: "" }] },
      { $set: { qrToken: crypto.randomBytes(24).toString("base64url") } }
    );
  }
  const pets = await Pet.find({ _id: { $in: memberPetIds } }).lean();
  const byId = new Map(pets.map((p) => [String(p._id), p]));

  ok(res, {
    pets: members
      .filter((m) => byId.has(String(m.pet)))
      .map((m) => {
        const serialized = serializePet(byId.get(String(m.pet)), { role: m.role, permissions: m.permissions, today });
        if (m.role !== "owner" && !(m.permissions || ["view_pet", "view_tasks"]).includes("view_health")) delete serialized.health;
        return serialized;
      }),
  });
});

/* POST /api/pets  (send an `Idempotency-Key` header so retries never create duplicates) */
export const createPetHandler = asyncHandler(async (req, res) => {
  const data = validate(req.body, CREATE_SPEC);
  const { pet, created } = await createPet({
    userId: req.user.id,
    data,
    idempotencyKey: idempotencyKeyOf(req),
  });
  await qualifyReferral(req.user.id).catch(() => undefined);
  await syncPetAchievements(req.user.id, pet._id).catch(() => undefined);
  ok(res, { pet: serializePet(pet, { role: "owner", today: clientToday(req) }), created }, created ? 201 : 200);
});

/* GET /api/pets/:petId */
export const getPet = asyncHandler(async (req, res) => {
  const pet = await Pet.findById(req.petId).lean();
  if (!pet) throw notFoundError("Pet not found.");
  const serialized = serializePet(pet, { role: req.petRole, permissions: req.petPermissions, today: clientToday(req) });
  if (req.petRole !== "owner" && !req.petPermissions?.includes("view_health")) delete serialized.health;
  ok(res, { pet: serialized });
});

/* PATCH /api/pets/:petId  (owner) */
export const updatePet = asyncHandler(async (req, res) => {
  const data = validate(req.body, UPDATE_SPEC);
  const pet = await Pet.findById(req.petId);
  if (!pet) throw notFoundError("Pet not found.");

  if (data.avatarKey !== undefined) await assertKnownKeys("avatar", [data.avatarKey], pet.type);
  if (data.activeFrameKey !== undefined && !(pet.unlockedFrameKeys || ["frame_default"]).includes(data.activeFrameKey)) {
    throw new ApiError(403, "This frame has not been unlocked yet.", { code: "FRAME_LOCKED" });
  }

  let oldPhotoId = null;
  if (data.photo !== undefined) {
    oldPhotoId = pet.photo?.publicId ?? null;
    pet.photo = data.photo ? acceptUploadedPhoto(data.photo, { userId: req.user.id, petId: req.petId }) : null;
  }
  for (const key of ["name", "breed", "gender", "birthDate", "weightKg", "avatarKey", "activeFrameKey"]) {
    if (data[key] !== undefined) pet[key] = data[key];
  }
  /* Avatar change (e.g. huchiko -> browny): keep avatarKey in sync and pick a sticker that belongs to the new avatar. */
  if (data.avatarLocalId !== undefined && data.avatarLocalId !== pet.avatarLocalId) {
    if (data.avatarLocalId !== null && !STICKER_AVATARS.includes(data.avatarLocalId)) {
      throw new ApiError(400, "Invalid pet avatar.", { code: "INVALID_STICKER_AVATAR" });
    }
    pet.avatarLocalId = data.avatarLocalId;
    if (data.avatarLocalId && data.avatarKey === undefined) {
      const nextKey = `${pet.type}_${data.avatarLocalId}`;
      await assertKnownKeys("avatar", [nextKey], pet.type);
      pet.avatarKey = nextKey;
    }
    const prefix = `${data.avatarLocalId}-`;
    if (!pet.activeStickerKey || !pet.activeStickerKey.startsWith(prefix)) {
      pet.activeStickerKey = (pet.stickerKeys || []).find((k) => k.startsWith(prefix)) ?? null;
    }
  }
  for (const [k, v] of Object.entries(data.health ?? {})) pet.set(`health.${k}`, v);
  for (const [k, v] of Object.entries(data.reminders ?? {})) pet.set(`reminders.${k}`, v);

  await pet.save();
  if (oldPhotoId && oldPhotoId !== pet.photo?.publicId) destroyAssets([oldPhotoId]);

  ok(res, { pet: serializePet(pet.toObject(), { role: req.petRole, today: clientToday(req) }) });
});

/* DELETE /api/pets/:petId  (owner) */
export const deletePet = asyncHandler(async (req, res) => {
  await deletePetCascade(req.petId);
  ok(res, { message: "Pet deleted." });
});

/* POST /api/pets/:petId/stickers { key }. Sticker price is server-authoritative. */
export const addSticker = asyncHandler(async (req, res) => {
  const { key } = validate(req.body, { key: field(t.key(), { required: true }) });
  const pet = await Pet.findById(req.petId).select("type stickerKeys avatarLocalId").lean();
  if (!pet) throw notFoundError("Pet not found.");
  await assertKnownKeys("sticker", [key], pet.type);
  assertStickerMatchesAvatar([key], pet.avatarLocalId);
  const purchase = await purchaseStickerForUser(req.user.id, key);
  const updated = await Pet.findByIdAndUpdate(req.petId, { $set: { stickerKeys: [key], activeStickerKey: key } }, { new: true }).lean();
  await syncPetAchievements(req.user.id, req.petId).catch(() => undefined);
  ok(res, { pet: serializePet(updated, { role: req.petRole, today: clientToday(req) }), charged: purchase.charged, wallet: purchase.wallet });
});

/* DELETE /api/pets/:petId/stickers/:key   (the slot stays unlocked) */
export const removeSticker = asyncHandler(async (req, res) => {
  const key = validate({ key: req.params.key }, { key: field(t.key(), { required: true }) }).key;
  const updated = await Pet.findByIdAndUpdate(req.petId, { $pull: { stickerKeys: key } }, { new: true }).lean();
  if (!updated) throw notFoundError("Pet not found.");
  if (updated.activeStickerKey === key) {
    updated.activeStickerKey = null;
    await Pet.updateOne({ _id: req.petId, activeStickerKey: key }, { $set: { activeStickerKey: null } });
  }
  ok(res, { pet: serializePet(updated, { role: req.petRole, today: clientToday(req) }) });
});

/* GET /api/pets/:petId/progress   Level, XP, streak and the user's Paw Points. */
export const getProgress = asyncHandler(async (req, res) => {
  const pet = await Pet.findById(req.petId).select("xp level streak stickerSlots").lean();
  if (!pet) throw notFoundError("Pet not found.");
  ok(res, {
    progress: levelProgress(pet.xp),
    streak: effectiveStreak(pet.streak, clientToday(req)),
    wallet: await getBalance(req.user.id),
    stickerSlots: {
      unlocked: pet.stickerSlots,
      free: FREE_STICKER_SLOTS,
      nextCost: nextStickerSlotCost(pet.stickerSlots),
      costs: EXTRA_STICKER_SLOT_COSTS,
    },
  });
});

/* Public, minimal emergency lookup by opaque QR token. */
export const publicQrLookup = asyncHandler(async (req, res) => {
  const pet = await Pet.findOne({ qrToken: req.params.token }).select("owner name type breed gender birthDate weightKg avatarKey photo health").lean();
  if (!pet) throw notFoundError("Pet QR not found.");
  const owner = await MobileUser.findById(pet.owner).select("name").lean();
  ok(res, { pet: { name: pet.name, type: pet.type, breed: pet.breed, gender: pet.gender, birthDate: pet.birthDate, weightKg: pet.weightKg, ownerName: owner?.name || "Pet parent", avatarKey: pet.avatarKey, photoUrl: pet.photo?.url || null, emergency: { allergies: pet.health?.allergies || [], conditions: pet.health?.conditions || [], vetName: pet.health?.vetName || "", vetPhone: pet.health?.vetPhone || "" } } });
});