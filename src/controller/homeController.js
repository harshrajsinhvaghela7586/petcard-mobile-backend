import { asyncHandler, ok, notFoundError } from "../utils/http.js";
import { clientToday } from "../utils/schema.js";
import { buildHome } from "../services/homeService.js";

/* GET /api/pets/:petId/home   One call for the Home screen of the selected pet. */
export const home = asyncHandler(async (req, res) => {
  const data = await buildHome({ petId: req.petId, today: clientToday(req), role: req.petRole, permissions: req.petPermissions });
  if (!data) throw notFoundError("Pet not found.");
  ok(res, data);
});
