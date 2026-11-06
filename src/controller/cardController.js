import crypto from "node:crypto";
import Pet from "../models/Pet.js";
import MobileUser from "../models/MobileUser.js";
import { asyncHandler, ok, notFoundError } from "../utils/http.js";
import { clientToday } from "../utils/schema.js";
import { config } from "../config/env.js";
import { breedProfile, ageInfo } from "../config/breeds.js";
import { levelProgress } from "../config/rewards.js";

/* The pet's ID card: everything the card screen and the QR need, in one call. */

const CARD_FIELDS =
  "owner name type breed gender birthDate weightKg avatarKey photo health qrToken xp level activeFrameKey activeStickerKey stickerKeys createdAt";

export const qrUrlFor = (token) =>
  config.publicBaseUrl ? `${config.publicBaseUrl}/api/public/pets/qr/${token}` : `/api/public/pets/qr/${token}`;

export function buildCard(pet, ownerName, today) {
  const type = ["cat", "rabbit"].includes(pet.type) ? pet.type : "dog";
  const age = ageInfo(type, pet.birthDate, today, breedProfile(type, pet.breed).size);
  return {
    petId: String(pet._id),
    name: pet.name,
    type: pet.type,
    breed: pet.breed || "",
    gender: pet.gender || "",
    birthDate: pet.birthDate || null,
    ageLabel: age.label,
    weightKg: pet.weightKg ?? null,
    avatarKey: pet.avatarKey || null,
    photoUrl: pet.photo?.url || null,
    activeFrameKey: pet.activeFrameKey || "frame_default",
    activeStickerKey: pet.activeStickerKey || null,
    stickerKeys: pet.stickerKeys || [],
    level: levelProgress(pet.xp || 0),
    ownerName: ownerName || "Pet parent",
    emergency: {
      vaccinated: pet.health?.vaccinated ?? null,
      allergies: pet.health?.allergies || [],
      conditions: pet.health?.conditions || [],
      vetName: pet.health?.vetName || "",
      vetPhone: pet.health?.vetPhone || "",
    },
    qr: { token: pet.qrToken, url: qrUrlFor(pet.qrToken) },
    memberSince: pet.createdAt || null,
  };
}

/* GET /api/pets/:petId/card */
export const getCard = asyncHandler(async (req, res) => {
  const pet = await Pet.findById(req.petId).select(CARD_FIELDS).lean();
  if (!pet) throw notFoundError("Pet not found.");
  const owner = await MobileUser.findById(pet.owner).select("name").lean();
  ok(res, { card: buildCard(pet, owner?.name, clientToday(req)) });
});

/* POST /api/pets/:petId/card/regenerate-qr   (owner) Old printed QR codes stop working. */
export const regenerateQr = asyncHandler(async (req, res) => {
  const qrToken = crypto.randomBytes(24).toString("base64url");
  const pet = await Pet.findByIdAndUpdate(req.petId, { $set: { qrToken } }, { new: true }).select("qrToken").lean();
  if (!pet) throw notFoundError("Pet not found.");
  ok(res, { qr: { token: pet.qrToken, url: qrUrlFor(pet.qrToken) } });
});
