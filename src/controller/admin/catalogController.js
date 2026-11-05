import CatalogItem from "../../models/CatalogItem.js";
import Pet from "../../models/Pet.js";
import StickerOwnership from "../../models/StickerOwnership.js";
import MobileUser from "../../models/MobileUser.js";
import { asyncHandler, ok, ApiError, notFoundError, conflict } from "../../utils/http.js";
import { validate, field, t } from "../../utils/schema.js";
import { audit } from "../../services/adminAudit.js";
import { pageArgs, searchOf, searchFilter, boolOf, enumOf, sortOf, allOf, compact, runPaged, idOf } from "../../utils/adminQuery.js";

const KINDS = ["avatar", "sticker"];

const shape = (i) => ({
  id: String(i._id), kind: i.kind, key: i.key, label: i.label, petType: i.petType, sortOrder: i.sortOrder, price: i.price, active: i.active,
  createdAt: i.createdAt, updatedAt: i.updatedAt,
});

/* GET /api/admin/catalog?kind&petType&active&free&search&sort&order&page&limit */
export const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageArgs(req, { defaultLimit: 50, maxLimit: 200 });
  const { spec } = sortOf(req, ["sortOrder", "label", "key", "price", "createdAt"], { field: "sortOrder", order: 1 });
  const free = boolOf(req.query.free);
  const petType = typeof req.query.petType === "string" && req.query.petType ? req.query.petType.toLowerCase().slice(0, 30) : undefined;
  const filter = allOf(
    searchFilter(searchOf(req), ["key", "label"]),
    compact({ kind: enumOf(req.query.kind, KINDS, "kind"), petType, active: boolOf(req.query.active), ...(free === true ? { price: 0 } : free === false ? { price: { $gt: 0 } } : {}) })
  );
  const { items, pagination } = await runPaged(CatalogItem, { filter, sort: spec, skip, limit, page });
  ok(res, { items: items.map(shape), pagination });
});

const CREATE_SPEC = {
  kind: field(t.oneOf(KINDS), { required: true }),
  key: field(t.key({ max: 60 }), { required: true }),
  label: field(t.string({ max: 60, allowEmpty: true })),
  petType: field(t.key({ max: 30 })),
  sortOrder: field(t.int({ min: -100000, max: 100000 })),
  price: field(t.int({ min: 0, max: 100000 })),
  active: field(t.bool()),
};
/* The key and kind identify the item everywhere (owned stickers, pets): they cannot change. */
const { kind: _k, key: _key, ...MUTABLE } = CREATE_SPEC;

/* POST /api/admin/catalog */
export const create = asyncHandler(async (req, res) => {
  const data = validate(req.body, CREATE_SPEC);
  try {
    const item = await CatalogItem.create({ petType: "all", label: data.key, ...data });
    audit(req, "catalog.create", "catalog", item._id, `Added ${data.kind} ${data.key}`);
    ok(res, { item: shape(item.toObject()) }, 201);
  } catch (error) {
    if (error?.code === 11000) throw conflict(`A ${data.kind} with key "${data.key}" already exists.`, { code: "KEY_TAKEN" });
    throw error;
  }
});

/* PATCH /api/admin/catalog/:id   { label?, petType?, sortOrder?, price?, active? } */
export const update = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "Catalog item");
  const data = validate(req.body, MUTABLE);
  if (!Object.keys(data).length) throw new ApiError(400, "Nothing to update.", { code: "EMPTY_UPDATE" });
  const item = await CatalogItem.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean();
  if (!item) throw notFoundError("Catalog item not found.");
  audit(req, "catalog.update", "catalog", id, `Updated ${item.kind} ${item.key}`, { fields: Object.keys(data) });
  ok(res, { item: shape(item) });
});

async function usageOf(item) {
  if (item.kind === "avatar") return { pets: await Pet.countDocuments({ avatarKey: item.key }), owners: 0 };
  const [pets, owners] = await Promise.all([Pet.countDocuments({ stickerKeys: item.key }), StickerOwnership.countDocuments({ stickerKey: item.key })]);
  return { pets, owners };
}

/* GET /api/admin/catalog/:id   With how many pets/users use it. */
export const detail = asyncHandler(async (req, res) => {
  const item = await CatalogItem.findById(idOf(req.params.id, "Catalog item")).lean();
  if (!item) throw notFoundError("Catalog item not found.");
  ok(res, { item: shape(item), usage: await usageOf(item) });
});

/* DELETE /api/admin/catalog/:id[?hard=true]
 * Default: hides the item from the app (existing pets/owners keep it). hard=true removes it for good,
 * and is refused while any pet or user still uses it. */
export const remove = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "Catalog item");
  const item = await CatalogItem.findById(id).lean();
  if (!item) throw notFoundError("Catalog item not found.");
  if (boolOf(req.query.hard) === true) {
    const usage = await usageOf(item);
    if (usage.pets || usage.owners) {
      throw conflict("This item is still used. Hide it instead of deleting it.", { code: "CATALOG_ITEM_IN_USE", extra: { usage } });
    }
    await CatalogItem.deleteOne({ _id: id });
    audit(req, "catalog.delete", "catalog", id, `Deleted ${item.kind} ${item.key}`);
    return ok(res, { message: "Item deleted." });
  }
  await CatalogItem.updateOne({ _id: id }, { $set: { active: false } });
  audit(req, "catalog.deactivate", "catalog", id, `Hid ${item.kind} ${item.key}`);
  return ok(res, { message: "Item hidden from the app.", item: shape({ ...item, active: false }) });
});


/* GET /api/admin/catalog/ownership?search&stickerKey&page&limit
 * Purchase history for stickers. Ownership is append-only from the app's purchase flow.
 */
export const ownership = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageArgs(req, { defaultLimit: 50, maxLimit: 200 });
  const search = searchOf(req);
  let userFilter = null;
  if (search) {
    const users = await MobileUser.find(searchFilter(search, ["name", "email"])).limit(500).distinct("_id");
    userFilter = { user: { $in: users } };
  }
  const stickerKey = typeof req.query.stickerKey === "string" && req.query.stickerKey.trim()
    ? req.query.stickerKey.trim().slice(0, 60)
    : undefined;
  const filter = { ...(userFilter || {}), ...(stickerKey ? { stickerKey } : {}) };
  const { items, pagination } = await runPaged(StickerOwnership, {
    filter, sort: { purchasedAt: -1, _id: -1 }, skip, limit, page,
  });
  const [users, catalog] = await Promise.all([
    MobileUser.find({ _id: { $in: items.map((x) => x.user) } }).select("name email").lean(),
    CatalogItem.find({ kind: "sticker", key: { $in: items.map((x) => x.stickerKey) } }).select("key label").lean(),
  ]);
  const userOf = new Map(users.map((u) => [String(u._id), u]));
  const itemOf = new Map(catalog.map((x) => [x.key, x]));
  ok(res, {
    items: items.map((x) => ({
      id: String(x._id),
      user: userOf.has(String(x.user))
        ? { id: String(x.user), name: userOf.get(String(x.user)).name, email: userOf.get(String(x.user)).email }
        : null,
      stickerKey: x.stickerKey,
      stickerLabel: itemOf.get(x.stickerKey)?.label || x.stickerKey,
      pricePaid: x.pricePaid,
      purchasedAt: x.purchasedAt,
    })),
    pagination,
  });
});
