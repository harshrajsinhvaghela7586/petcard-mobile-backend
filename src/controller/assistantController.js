import Pet from "../models/Pet.js";
import MobileUser from "../models/MobileUser.js";
import { asyncHandler, ok, ApiError, notFoundError } from "../utils/http.js";
import { validate, field, t, clientToday } from "../utils/schema.js";
import { config } from "../config/env.js";
import { breedProfile, ageInfo, stageName } from "../config/breeds.js";
import { computeGoals } from "../services/careScore.js";
import { trackerSummary } from "../services/trackerService.js";
import { dueHealth } from "../services/homeService.js";
import { dueInfo } from "../services/healthService.js";
import { translateTexts } from "../services/translateService.js";
import {
  EMERGENCY_NOTICE, MAX_MESSAGE_CHARS, askGemini, buildSystemPrompt, detectEmergency, sanitizeHistory, suggestionsFor,
} from "../services/assistantService.js";

const allowed = (req, permission) =>
  req.petRole === "owner" || req.petPermissions?.includes("*") || req.petPermissions?.includes(permission);

async function loadContext(req) {
  const pet = await Pet.findById(req.petId).select("name type breed gender birthDate weightKg health trackerGoals").lean();
  if (!pet) throw notFoundError("Pet not found.");
  const today = clientToday(req);
  const type = ["cat", "rabbit"].includes(pet.type) ? pet.type : "dog";
  const profile = breedProfile(type, pet.breed);
  const age = ageInfo(type, pet.birthDate, today, profile.size);
  const ctx = {
    name: pet.name, type, breed: pet.breed, gender: pet.gender, weightKg: pet.weightKg,
    ageLabel: age.label, stage: stageName(type, age.stage),
    goals: computeGoals(pet, today),
    breedConcerns: profile.known ? profile.concerns : [],
  };
  if (allowed(req, "view_tasks")) {
    const s = await trackerSummary({ petId: req.petId, pet, date: today, today, withEntries: false });
    ctx.today = { food: s.totals.food.amount, water: s.totals.water.amount, activity: s.totals.activity.amount, score: s.careScore.score };
  }
  if (allowed(req, "view_health")) {
    ctx.health = pet.health || {};
    const due = await dueHealth(req.petId, today, { limit: 5 });
    ctx.dueHealth = due.map((r) => ({ title: r.title, label: dueInfo(r.nextDueDate, today).label }));
  }
  return { ctx, profile, age };
}

/* GET /api/pets/:petId/assistant/suggestions */
export const suggestions = asyncHandler(async (req, res) => {
  const { ctx, profile, age } = await loadContext(req);
  ok(res, {
    enabled: config.gemini.enabled,
    suggestions: suggestionsFor({ name: ctx.name, type: ctx.type, breed: ctx.breed, stage: age.stage, hasDue: Boolean(ctx.dueHealth?.length), hasBreed: profile.known }),
    maxMessageLength: MAX_MESSAGE_CHARS,
    disclaimer: "PetCard Assistant gives general pet-care information. It is not a veterinarian.",
  });
});

/* POST /api/pets/:petId/assistant/chat   { message, history?: [{ role: "user"|"assistant", text }] } */
export const chat = asyncHandler(async (req, res) => {
  const data = validate(req.body, {
    message: field(t.string({ max: MAX_MESSAGE_CHARS, multiline: true }), { required: true }),
    history: field(
      t.array(
        t.object({ role: field(t.oneOf(["user", "assistant"]), { required: true }), text: field(t.string({ max: MAX_MESSAGE_CHARS, multiline: true }), { required: true }) }),
        { max: 20, unique: false }
      )
    ),
  });
  if (!config.gemini.enabled) throw new ApiError(503, "The pet assistant is not available right now.", { code: "ASSISTANT_DISABLED" });

  const [{ ctx }, user] = await Promise.all([loadContext(req), MobileUser.findById(req.user.id).select("language").lean()]);
  const emergency = detectEmergency(data.message);
  const lang = user?.language || "en";
  // The vet warning is shown in the user's language (shared translation cache; English if unavailable).
  const notice = emergency && lang !== "en" ? ((await translateTexts(lang, [EMERGENCY_NOTICE]).catch(() => ({})))[EMERGENCY_NOTICE] ?? EMERGENCY_NOTICE) : EMERGENCY_NOTICE;

  try {
    const { reply } = await askGemini({
      system: buildSystemPrompt(ctx, lang),
      history: sanitizeHistory(data.history ?? []),
      message: data.message,
    });
    ok(res, { reply: emergency ? `${notice}\n\n${reply}` : reply, emergency });
  } catch (error) {
    // Never leave someone with a possible emergency without the vet advice.
    if (emergency) return ok(res, { reply: notice, emergency: true, degraded: true });
    throw error;
  }
});
