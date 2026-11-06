import Pet from "../models/Pet.js";
import CatalogItem from "../models/CatalogItem.js";
import StickerOwnership from "../models/StickerOwnership.js";
import PetMember from "../models/PetMember.js";
import Task from "../models/Task.js";
import TaskCompletion from "../models/TaskCompletion.js";
import HealthRecord from "../models/HealthRecord.js";
import Memory from "../models/Memory.js";
import GuardianInvite from "../models/GuardianInvite.js";
import GuardianRequest from "../models/GuardianRequest.js";
import TrackerEntry from "../models/TrackerEntry.js";
import AchievementUnlock from "../models/AchievementUnlock.js";
import { ApiError } from "../utils/http.js";
import { todayKey, daysBetween } from "../utils/schema.js";
import { assertKnownKeys, assertStickerMatchesAvatar } from "./catalogService.js";
import { acceptUploadedPhoto, destroyAssets } from "./cloudinary.js";
import { buildTaskFields } from "./taskService.js";
import {
  FREE_STICKER_SLOTS,
  EXTRA_STICKER_SLOT_COSTS,
  MAX_STICKER_SLOTS,
  LIMITS,
  levelProgress,
  framesForLevel,
} from "../config/rewards.js";

/** A streak that was not continued yesterday or today is shown as 0. */
export function effectiveStreak(streak, today = todayKey()) {
  const s = streak || {};
  const stale = !s.lastDate || daysBetween(s.lastDate, today) > 1;
  return { current: stale ? 0 : s.current || 0, longest: s.longest || 0, lastDate: s.lastDate || null };
}

export const nextStickerSlotCost = (slots) =>
  slots >= MAX_STICKER_SLOTS ? null : EXTRA_STICKER_SLOT_COSTS[slots - FREE_STICKER_SLOTS] ?? null;

export function serializePet(pet, { role, permissions, today } = {}) {
  return {
    id: String(pet._id),
    qrToken: pet.qrToken,
    name: pet.name,
    type: pet.type,
    breed: pet.breed || "",
    gender: pet.gender,
    birthDate: pet.birthDate || null,
    weightKg: pet.weightKg ?? null,
    avatarKey: pet.avatarKey || null,
    avatarLocalId: pet.avatarLocalId || null,
    unlockedFrameKeys: [...new Set([...(pet.unlockedFrameKeys || ["frame_default"]), ...framesForLevel(pet.level || 1)])],
    activeFrameKey: pet.activeFrameKey || "frame_default",
    photoUrl: pet.photo?.url || null,
    stickerKeys: pet.stickerKeys || [],
    activeStickerKey: pet.activeStickerKey || null,
    stickerSlots: pet.stickerSlots,
    nextStickerSlotCost: nextStickerSlotCost(pet.stickerSlots),
    health: {
      vaccinated: pet.health?.vaccinated ?? null,
      allergies: pet.health?.allergies || [],
      conditions: pet.health?.conditions || [],
      vetName: pet.health?.vetName || "",
      vetPhone: pet.health?.vetPhone || "",
      notes: pet.health?.notes || "",
    },
    reminders: { enabled: pet.reminders?.enabled ?? true, time: pet.reminders?.time || "09:00" },
    progress: levelProgress(pet.xp || 0),
    streak: effectiveStreak(pet.streak, today),
    role: role ?? undefined,
    permissions: permissions ?? (role === "owner" ? ["*"] : ["view_pet", "view_tasks"]),
    createdAt: pet.createdAt,
  };
}

async function acceptPhoto(photo, userId, petId) {
  return photo ? acceptUploadedPhoto(photo, { userId, petId }) : null;
}

export async function createPet({ userId, data, idempotencyKey }) {
  if (idempotencyKey) {
    const existing = await Pet.findOne({ owner: userId, idempotencyKey }).lean();
    if (existing) return { pet: existing, created: false };
  }

  const owned = await PetMember.countDocuments({ user: userId, role: "owner" });
  if (owned >= LIMITS.petsPerOwner) {
    throw new ApiError(403, `You can add up to ${LIMITS.petsPerOwner} pets.`, { code: "PET_LIMIT" });
  }

  const stickerKeys = data.stickerKeys ?? [];
  if (stickerKeys.length > FREE_STICKER_SLOTS) {
    throw new ApiError(
      400,
      `Choose up to ${FREE_STICKER_SLOTS} stickers now. More can be unlocked later with Paw Points.`,
      { code: "STICKER_LIMIT", extra: { freeSlots: FREE_STICKER_SLOTS } }
    );
  }
  await assertKnownKeys("avatar", [data.avatarKey], data.type);
  await assertKnownKeys("sticker", stickerKeys, data.type);
  assertStickerMatchesAvatar(stickerKeys, data.avatarLocalId);
  const initialStickers = await CatalogItem.find({ kind: "sticker", key: { $in: stickerKeys }, active: true }).select("key price").lean();
  const paidStickerKeys = initialStickers.filter((item) => Number(item.price || 0) > 0).map((item) => item.key);
  if (paidStickerKeys.length) {
    const ownedPaid = await StickerOwnership.find({ user: userId, stickerKey: { $in: paidStickerKeys } }).distinct("stickerKey");
    if (ownedPaid.length !== new Set(paidStickerKeys).size) {
      throw new ApiError(400, "Purchase paid stickers before selecting them for this pet.", { code: "STICKER_PURCHASE_REQUIRED" });
    }
  }

  const photo = await acceptPhoto(data.photo, userId, null);

  let pet;
  try {
    pet = await Pet.create({
      owner: userId,
      name: data.name,
      type: data.type,
      breed: data.breed ?? "",
      gender: data.gender ?? "unknown",
      birthDate: data.birthDate ?? null,
      weightKg: data.weightKg ?? null,
      avatarKey: data.avatarKey ?? null,
      avatarLocalId: data.avatarLocalId ?? null,
      photo,
      stickerKeys,
      activeStickerKey: stickerKeys[0] ?? null,
      stickerSlots: FREE_STICKER_SLOTS,
      health: data.health ?? {},
      reminders: data.reminders ?? {},
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
  } catch (error) {
    if (error?.code === 11000 && idempotencyKey) {
      const existing = await Pet.findOne({ owner: userId, idempotencyKey }).lean();
      if (existing) return { pet: existing, created: false };
    }
    throw error;
  }

  try {
    await PetMember.create({ pet: pet._id, user: userId, role: "owner", addedBy: userId });
    if (data.firstTask) {
      const fields = buildTaskFields({ ...data.firstTask, recurrence: { type: "daily" } });
      await Task.create({ pet: pet._id, createdBy: userId, note: "", ...fields });
    }
  } catch (error) {
    await Promise.all([
      Pet.deleteOne({ _id: pet._id }),
      PetMember.deleteMany({ pet: pet._id }),
      Task.deleteMany({ pet: pet._id }),
    ]).catch(() => {});
    throw error;
  }

  return { pet: pet.toObject(), created: true };
}

/** Removes a pet and everything attached to it (and its Cloudinary images). */
export async function deletePetCascade(petId) {
  const [pet, memories] = await Promise.all([
    Pet.findById(petId).select("photo").lean(),
    Memory.find({ pet: petId }).select("photo.publicId").lean(),
  ]);

  await Promise.all([
    TaskCompletion.deleteMany({ pet: petId }),
    Task.deleteMany({ pet: petId }),
    HealthRecord.deleteMany({ pet: petId }),
    Memory.deleteMany({ pet: petId }),
    GuardianInvite.deleteMany({ pet: petId }),
    GuardianRequest.deleteMany({ pet: petId }),
    TrackerEntry.deleteMany({ pet: petId }),
    AchievementUnlock.deleteMany({ pet: petId }),
    PetMember.deleteMany({ pet: petId }),
  ]);
  await Pet.deleteOne({ _id: petId });

  destroyAssets([pet?.photo?.publicId, ...memories.map((m) => m.photo?.publicId)]);
}
