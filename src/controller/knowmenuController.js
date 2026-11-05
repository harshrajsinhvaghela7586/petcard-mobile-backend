import Pet from "../models/Pet.js";
import KnowMenu, { KNOW_MENU_KEYS } from "../models/KnowMenu.js";
import { asyncHandler, ok, notFoundError } from "../utils/http.js";
import { findBreed } from "../config/breeds.js";

const TEXT_FIELDS = ["chip", "heroTitle", "heroSub", "heading", "sub"];

/* Species page first, then the breed page replaces only what it defines. */
function merge(base, over) {
  const out = { ...(base || {}) };
  if (!over) return out;
  for (const k of TEXT_FIELDS) if (over[k]) out[k] = over[k];
  if (over.tip?.text) out.tip = over.tip;
  if (over.items?.length) {
    const byKey = new Map((out.items || []).map((i) => [i.key, i]));
    for (const i of over.items) byKey.set(i.key, i);
    out.items = [...byKey.values()];
  }
  return out;
}

const fill = (value, name) => {
  if (typeof value === "string") return value.replaceAll("{{petName}}", name);
  if (Array.isArray(value)) return value.map((v) => fill(v, name));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, name)]));
  return value;
};

/* GET /api/pets/:petId/know-menu/:menuKey */
export const menu = asyncHandler(async (req, res) => {
  const menuKey = String(req.params.menuKey || "").toLowerCase();
  if (!KNOW_MENU_KEYS.includes(menuKey)) throw notFoundError("Guide not found.");

  const pet = await Pet.findById(req.petId).select("name type breed").lean();
  if (!pet) throw notFoundError("Pet not found.");
  const petType = ["dog", "cat", "rabbit"].includes(pet.type) ? pet.type : "dog";
  const breed = findBreed(petType, pet.breed);

  const docs = await KnowMenu.find({ menuKey, petType, breedKey: { $in: [null, ...(breed ? [breed.key] : [])] } }).lean();
  const base = docs.find((d) => d.breedKey == null);
  const over = breed ? docs.find((d) => d.breedKey === breed.key) : null;
  if (!base && !over) throw notFoundError("Guide not found.");

  const merged = merge(base, over);
  const body = {
    chip: merged.chip,
    heroTitle: merged.heroTitle,
    heroSub: merged.heroSub,
    heading: merged.heading,
    sub: merged.sub,
    tip: merged.tip ? { title: merged.tip.title, text: merged.tip.text } : undefined,
    items: (merged.items || []).map((i) => ({ key: i.key, title: i.title, sub: i.sub })),
  };
  res.setHeader("Cache-Control", "private, max-age=600");
  ok(res, { menu: fill(body, pet.name || "your pet") });
});