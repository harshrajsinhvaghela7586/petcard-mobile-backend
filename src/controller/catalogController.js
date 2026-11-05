import CatalogItem from "../models/CatalogItem.js";
import { asyncHandler, ok } from "../utils/http.js";
import { validate, field, t } from "../utils/schema.js";
import { breedOptions, MAX_CUSTOM_BREED_LENGTH } from "../config/breeds.js";

const list = (kind) =>
  asyncHandler(async (req, res) => {
    const { petType, avatarKey } = validate(req.query, {
      petType: field(t.key({ max: 30 })),
      avatarKey: field(t.key({ max: 30 })),
    });
    const filter = { kind, active: true, ...(petType ? { petType: { $in: ["all", petType] } } : {}) };
    if (kind === "sticker" && avatarKey) filter.key = { $regex: `^${avatarKey}-` };
    const items = await CatalogItem.find(filter).sort({ sortOrder: 1, key: 1 }).select("key label petType sortOrder price").lean();

    // Catalogue changes rarely: let the app and any proxy reuse it for 5 minutes.
    res.setHeader("Cache-Control", "private, max-age=300");
    ok(res, {
      items: items.map((i) => ({ key: i.key, label: i.label, petType: i.petType, order: i.sortOrder, price: i.price })),
    });
  });

export const listAvatars = list("avatar");
export const listStickers = list("sticker");

/* GET /api/catalog/breeds?petType=dog  -> the app's breeds, then "Other" (free text, max 30 characters). */
export const listBreeds = asyncHandler(async (req, res) => {
  const { petType } = validate(req.query, { petType: field(t.key({ max: 30 }), { required: true }) });
  const items = breedOptions(petType).map((label, order) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label, petType, order }));
  res.setHeader("Cache-Control", "private, max-age=3600");
  ok(res, { items, maxCustomLength: MAX_CUSTOM_BREED_LENGTH });
});
