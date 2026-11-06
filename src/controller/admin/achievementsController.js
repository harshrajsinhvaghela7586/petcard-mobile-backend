import AchievementUnlock from "../../models/AchievementUnlock.js";
import Pet from "../../models/Pet.js";
import MobileUser from "../../models/MobileUser.js";
import { asyncHandler, ok, notFoundError, conflict } from "../../utils/http.js";
import { validate, field, t } from "../../utils/schema.js";
import { ACHIEVEMENTS, ACHIEVEMENT_KEYS, ACHIEVEMENT_BY_KEY, achievementStatus } from "../../services/achievementService.js";
import { notify } from "../../services/notificationService.js";
import { levelDistribution, levelTable } from "../../services/adminProgress.js";
import { audit } from "../../services/adminAudit.js";
import { createTtlCache } from "../../utils/ttlCache.js";
import { pageArgs, enumOf, dateRangeOf, allOf, compact, runPaged, idOf, idFilter, byId } from "../../utils/adminQuery.js";

const cache = createTtlCache({ ttlMs: 60_000, max: 20 });

/* GET /api/admin/achievements/definitions   Every achievement with how many pets unlocked it. */
export const definitions = asyncHandler(async (_req, res) => {
  const data = await cache.wrap("defs", async () => {
    const [rows, pets] = await Promise.all([
      AchievementUnlock.aggregate([{ $group: { _id: "$key", unlocked: { $sum: 1 }, last: { $max: "$unlockedAt" } } }]),
      Pet.estimatedDocumentCount(),
    ]);
    const byKey = new Map(rows.map((r) => [r._id, r]));
    return ACHIEVEMENTS.map((a) => ({
      ...a,
      unlocked: byKey.get(a.key)?.unlocked ?? 0,
      lastUnlockedAt: byKey.get(a.key)?.last ?? null,
      percentOfPets: pets ? Math.round(((byKey.get(a.key)?.unlocked ?? 0) / pets) * 1000) / 10 : 0,
    }));
  });
  ok(res, { items: data });
});

/* GET /api/admin/achievements?key&pet&user&from&to&page&limit   Who unlocked what, newest first. */
export const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageArgs(req);
  const filter = allOf(compact({ key: enumOf(req.query.key, ACHIEVEMENT_KEYS, "key"), pet: idFilter(req.query.pet, "pet"), user: idFilter(req.query.user, "user"), unlockedAt: dateRangeOf(req) }));
  const { items, pagination } = await runPaged(AchievementUnlock, { filter, sort: { unlockedAt: -1, _id: -1 }, skip, limit, page });
  const [users, pets] = await Promise.all([
    MobileUser.find({ _id: { $in: items.map((i) => i.user) } }).select("name email").lean(),
    Pet.find({ _id: { $in: items.map((i) => i.pet) } }).select("name type level").lean(),
  ]);
  const [userOf, petOf] = [byId(users), byId(pets)];
  ok(res, {
    items: items.map((i) => ({
      id: String(i._id), key: i.key, title: ACHIEVEMENT_BY_KEY.get(i.key)?.title ?? i.key, description: ACHIEVEMENT_BY_KEY.get(i.key)?.description ?? "", unlockedAt: i.unlockedAt,
      user: userOf.get(String(i.user)) ? { id: String(i.user), name: userOf.get(String(i.user)).name, email: userOf.get(String(i.user)).email } : null,
      pet: petOf.get(String(i.pet)) ? { id: String(i.pet), name: petOf.get(String(i.pet)).name, level: petOf.get(String(i.pet)).level } : null,
    })),
    pagination,
  });
});

/* GET /api/admin/achievements/pet/:petId   Every achievement with the pet's progress towards it. */
export const forPet = asyncHandler(async (req, res) => {
  const id = idOf(req.params.petId, "Pet");
  const status = await achievementStatus(id);
  if (!status) throw notFoundError("Pet not found.");
  ok(res, { ...status, unlocked: status.achievements.filter((a) => a.done).length, total: status.achievements.length });
});

/* GET /api/admin/achievements/user/:userId   Achievements and levels for each pet of a user. */
export const forUser = asyncHandler(async (req, res) => {
  const id = idOf(req.params.userId, "User");
  const pets = await Pet.find({ owner: id }).select("name type level xp").lean();
  const statuses = await Promise.all(pets.map((p) => achievementStatus(p._id)));
  ok(res, {
    pets: pets.map((p, i) => ({
      id: String(p._id), name: p.name, type: p.type, level: p.level, xp: p.xp,
      unlocked: statuses[i]?.achievements.filter((a) => a.done).length ?? 0,
      total: ACHIEVEMENTS.length,
      achievements: statuses[i]?.achievements ?? [],
    })),
  });
});

/* POST /api/admin/achievements/grant   { petId, key }   Manually unlocks one (the owner is notified). */
export const grantOne = asyncHandler(async (req, res) => {
  const data = validate(req.body, { petId: field(t.objectId(), { required: true }), key: field(t.oneOf(ACHIEVEMENT_KEYS), { required: true }) });
  const pet = await Pet.findById(data.petId).select("name owner").lean();
  if (!pet) throw notFoundError("Pet not found.");
  try {
    await AchievementUnlock.create({ user: pet.owner, pet: data.petId, key: data.key });
  } catch (error) {
    if (error?.code === 11000) throw conflict("This achievement is already unlocked.", { code: "ALREADY_UNLOCKED" });
    throw error;
  }
  const def = ACHIEVEMENT_BY_KEY.get(data.key);
  await notify(String(pet.owner), {
    type: "achievement_unlocked",
    title: `Achievement unlocked: ${def.title}`,
    body: `${pet.name} ${def.description.toLowerCase()}.`,
    data: { petId: String(data.petId), achievementKey: data.key },
  });
  cache.clear();
  audit(req, "achievement.grant", "pet", data.petId, `Granted ${data.key} to ${pet.name}`);
  ok(res, { message: "Achievement unlocked." }, 201);
});

/* DELETE /api/admin/achievements/:id   Revokes one unlock (it can be earned again by playing). */
export const revoke = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "Achievement");
  const unlock = await AchievementUnlock.findByIdAndDelete(id).lean();
  if (!unlock) throw notFoundError("Achievement not found.");
  cache.clear();
  audit(req, "achievement.revoke", "pet", unlock.pet, `Revoked ${unlock.key}`);
  ok(res, { message: "Achievement removed." });
});

/* GET /api/admin/levels   The level table and how many pets are on each level. */
export const levels = asyncHandler(async (_req, res) => {
  const distribution = await cache.wrap("levels", () => levelDistribution());
  ok(res, { table: levelTable(), distribution, totalPets: distribution.reduce((s, r) => s + r.pets, 0) });
});

