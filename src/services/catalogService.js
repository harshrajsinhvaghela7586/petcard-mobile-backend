import CatalogItem from "../models/CatalogItem.js";
import { ApiError } from "../utils/http.js";
import { log } from "../utils/logger.js";

/*
 * Avatar / sticker keys sent by the app are checked against the catalogue.
 * If no catalogue has been seeded yet for that kind (fresh database), only the
 * key FORMAT is checked, so the app keeps working; run `npm run seed:catalog`
 * to turn on strict validation.
 */

let warned = false;

export async function assertKnownKeys(kind, keys, petType) {
  const list = keys.filter(Boolean);
  if (!list.length) return;

  const total = await CatalogItem.countDocuments({ kind, active: true });
  if (total === 0) {
    if (!warned) {
      warned = true;
      log.warn("catalog.empty", { note: "Catalogue not seeded: avatar/sticker keys are not verified." });
    }
    return;
  }

  const found = await CatalogItem.countDocuments({
    kind,
    active: true,
    key: { $in: list },
    petType: { $in: ["all", petType] },
  });

  if (found !== new Set(list).size) {
    throw new ApiError(400, `Unknown ${kind}.`, { code: "UNKNOWN_CATALOG_ITEM", extra: { kind } });
  }
}

/* Exported: petController also uses this list to validate avatarLocalId. */
export const STICKER_AVATARS = ["huchiko", "browny", "noir", "kiki", "oreo", "cupid", "waffle"];

export function assertStickerMatchesAvatar(keys, avatarLocalId) {
  if (!avatarLocalId) return;
  const avatar = String(avatarLocalId).toLowerCase();
  if (!STICKER_AVATARS.includes(avatar)) {
    throw new ApiError(400, "Invalid pet avatar for sticker selection.", { code: "INVALID_STICKER_AVATAR" });
  }
  if (keys.some((key) => !String(key).startsWith(`${avatar}-`))) {
    throw new ApiError(400, "This sticker does not belong to the selected pet avatar.", { code: "STICKER_AVATAR_MISMATCH" });
  }
}