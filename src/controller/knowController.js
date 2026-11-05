import Pet from "../models/Pet.js";
import { asyncHandler, ok, notFoundError } from "../utils/http.js";
import { clientToday } from "../utils/schema.js";
import { PET_GOAL_FIELDS } from "../services/trackerService.js";
import { buildKnowIndex, buildKnowPage } from "../services/knowService.js";

const loadPet = async (petId) => {
  const pet = await Pet.findById(petId).select(PET_GOAL_FIELDS).lean();
  if (!pet) throw notFoundError("Pet not found.");
  return pet;
};

/* GET /api/pets/:petId/know   The guide menu for this pet. */
export const index = asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "private, max-age=600");
  ok(res, buildKnowIndex(await loadPet(req.petId), clientToday(req)));
});

/* GET /api/pets/:petId/know/:pageKey   One guide, written for this pet's type, breed, age and size. */
export const page = asyncHandler(async (req, res) => {
  const data = buildKnowPage(req.params.pageKey, await loadPet(req.petId), clientToday(req));
  if (!data) throw notFoundError("Guide not found.");
  res.setHeader("Cache-Control", "private, max-age=600");
  ok(res, data);
});
