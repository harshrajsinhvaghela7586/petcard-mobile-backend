import KnowGuide from "../models/KnowGuide.js";
import { findBreed, PET_TYPES } from "../config/breeds.js";
import { GUIDE_PAGE_KEYS, applyPetName } from "./KnowGuideContent.js";

/**
 * Looks up the stored guide for this pet: its own breed first, then the generic guide for the species.
 * Returns null when the page is unknown or nothing is stored (the app then keeps its built-in text).
 */
export async function getKnowGuide({ pageKey, type, breed, petName }) {
  if (!GUIDE_PAGE_KEYS.includes(pageKey)) return null;
  const species = PET_TYPES.includes(type) ? type : "dog";
  const breedKey = findBreed(species, breed)?.key ?? "";

  const docs = await KnowGuide.find({ pageKey, species, breed: { $in: breedKey ? [breedKey, ""] : [""] } })
    .select("pageKey species breed chip sections footer")
    .lean();
  const doc = docs.find((d) => d.breed === breedKey && breedKey) ?? docs.find((d) => d.breed === "");
  if (!doc) return null;

  const name = petName || "your pet";
  return {
    key: doc.pageKey,
    chip: applyPetName(doc.chip, name),
    sections: applyPetName(doc.sections, name),
    footer: applyPetName(doc.footer, name),
    breed: doc.breed || null,
  };
}