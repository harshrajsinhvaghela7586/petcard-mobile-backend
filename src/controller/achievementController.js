import { asyncHandler, ok } from "../utils/http.js";
import { syncPetAchievements } from "../services/achievementService.js";

export const list = asyncHandler(async (req, res) => {
  const achievements = await syncPetAchievements(req.user.id, req.petId);
  ok(res, { achievements, unlockedCount: achievements.filter((item) => item.done).length, totalCount: achievements.length });
});
