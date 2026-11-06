import Pet from "../models/Pet.js";
import { asyncHandler, ok, notFoundError } from "../utils/http.js";
import { getKnowGuide } from "../services/KnowGuideService.js";

/* GET /api/pets/:petId/know-guide/:pageKey   The stored guide for this pet's type and breed ({ guide: null } if none). */
export const guide = asyncHandler(async (req, res) => {
  const pet = await Pet.findById(req.petId).select("name type breed").lean();
  if (!pet) throw notFoundError("Pet not found.");
  const data = await getKnowGuide({ pageKey: req.params.pageKey, type: pet.type, breed: pet.breed, petName: pet.name });
  res.setHeader("Cache-Control", "private, max-age=600");
  ok(res, { guide: data });
});