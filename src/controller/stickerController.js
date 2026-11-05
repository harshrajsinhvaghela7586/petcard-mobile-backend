import CatalogItem from "../models/CatalogItem.js";
import StickerOwnership from "../models/StickerOwnership.js";
import Pet from "../models/Pet.js";
import { getBalance } from "../services/rewardService.js";
import { purchaseStickerForUser } from "../services/stickerService.js";
import { asyncHandler, ok, ApiError, notFoundError } from "../utils/http.js";
import { assertKnownKeys, assertStickerMatchesAvatar } from "../services/catalogService.js";

const serializePet = (pet) => ({ id: String(pet._id), stickerKeys: pet.stickerKeys || [] });

export const listOwnedStickers = asyncHandler(async (req, res) => {
  const [owned, wallet] = await Promise.all([
    StickerOwnership.find({ user: req.user.id }).sort({ purchasedAt: -1 }).select("stickerKey pricePaid purchasedAt").lean(),
    getBalance(req.user.id),
  ]);
  ok(res, { owned: owned.map((item) => ({ key: item.stickerKey, pricePaid: item.pricePaid, purchasedAt: item.purchasedAt })), wallet });
});

export const purchaseSticker = asyncHandler(async (req, res) => {
  const key = String(req.params.key || "");
  if (!/^[a-z0-9][a-z0-9_-]{0,59}$/.test(key)) throw new ApiError(400, "Invalid sticker key.", { code: "VALIDATION_ERROR" });
  const result = await purchaseStickerForUser(req.user.id, key);
  ok(res, result, result.purchased ? 201 : 200);
});

export const selectStickerForPet = asyncHandler(async (req, res) => {
  const key = String(req.params.key || "");
  const [pet, ownership, catalog] = await Promise.all([
    Pet.findById(req.petId).select("type stickerKeys avatarLocalId").lean(),
    StickerOwnership.findOne({ user: req.user.id, stickerKey: key }).lean(),
    CatalogItem.findOne({ kind: "sticker", key, active: true }).select("petType").lean(),
  ]);
  if (!pet) throw notFoundError("Pet not found.");
  if (!catalog) throw notFoundError("Sticker not found.");
  if (!ownership) throw new ApiError(403, "Purchase or unlock this sticker before selecting it.", { code: "STICKER_NOT_OWNED" });
  await assertKnownKeys("sticker", [key], pet.type);
  assertStickerMatchesAvatar([key], pet.avatarLocalId);
  const updated = await Pet.findByIdAndUpdate(req.petId, { $set: { stickerKeys: [key], activeStickerKey: key } }, { new: true }).select("stickerKeys activeStickerKey").lean();
  ok(res, { pet: { ...serializePet({ ...updated, _id: req.petId }), activeStickerKey: updated.activeStickerKey } });
});