import crypto from "node:crypto";
import { config } from "../config/env.js";
import GuardianInvite from "../models/GuardianInvite.js";
import GuardianRequest from "../models/GuardianRequest.js";
import MobileUser from "../models/MobileUser.js";
import Pet from "../models/Pet.js";
import PetMember from "../models/PetMember.js";
import { asyncHandler, ok, ApiError, notFoundError } from "../utils/http.js";
import { validate, field, t } from "../utils/schema.js";
import { hashToken } from "../utils/tokens.js";
import { isObjectId } from "../utils/validators.js";
import { maskEmail } from "../utils/logger.js";
import { LIMITS } from "../config/rewards.js";
import { notify } from "../services/notificationService.js";

const INVITE_INVALID = "This invite is invalid or has expired.";
const GUARDIAN_PERMISSIONS = new Set(["view_pet", "view_tasks", "manage_tasks", "view_health", "manage_health", "view_memories", "manage_memories"]);

/* What the owner can switch on or off for each co-guardian (toggles in the app). */
export const PERMISSION_OPTIONS = Object.freeze([
  { key: "view_pet", label: "View pet profile", group: "Profile", description: "See the pet's card and details.", locked: true },
  { key: "view_tasks", label: "View tasks & tracking", group: "Tasks", description: "See tasks, calendar, food, water and activity." },
  { key: "manage_tasks", label: "Manage tasks & tracking", group: "Tasks", description: "Add, edit, complete tasks and log meals, water and activity.", requires: "view_tasks" },
  { key: "view_health", label: "View health records", group: "Health", description: "See vaccinations, medicines and vet visits." },
  { key: "manage_health", label: "Manage health records", group: "Health", description: "Add and edit health records.", requires: "view_health" },
  { key: "view_memories", label: "View memories", group: "Memories", description: "See saved photos and memories." },
  { key: "manage_memories", label: "Manage memories", group: "Memories", description: "Add and edit memories.", requires: "view_memories" },
]);

/** Validates a permission list; always includes view_pet and the "view" for every "manage". */
export function normalizePermissions(incoming) {
  if (!Array.isArray(incoming) || incoming.length > GUARDIAN_PERMISSIONS.size || incoming.some((item) => typeof item !== "string" || !GUARDIAN_PERMISSIONS.has(item))) {
    throw new ApiError(400, "Select valid guardian permissions.", { code: "VALIDATION_ERROR" });
  }
  const granted = [...new Set(incoming)];
  if (!granted.includes("view_pet")) granted.unshift("view_pet");
  for (const [manage, view] of [["manage_tasks", "view_tasks"], ["manage_health", "view_health"], ["manage_memories", "view_memories"]]) {
    if (granted.includes(manage) && !granted.includes(view)) granted.push(view);
  }
  return granted;
}

const TOKEN_SPEC = { token: field(t.string({ min: 43, max: 128, pattern: /^[A-Za-z0-9_-]+$/ }), { required: true }) };

const idParam = (value, label) => {
  if (!isObjectId(value)) throw notFoundError(`${label} not found.`);
  return value;
};

const isInviteUsable = (invite) =>
  invite && !invite.revokedAt && invite.expiresAt > new Date() && invite.useCount < invite.maxUses;

const memberCount = (petId) => PetMember.countDocuments({ pet: petId, role: "co_guardian" });

/* ------------------------------------------------------------------ */
/* Owner / member side: /api/pets/:petId/guardians                     */
/* ------------------------------------------------------------------ */

/* GET /api/pets/:petId/guardians */
export const listGuardians = asyncHandler(async (req, res) => {
  const members = await PetMember.find({ pet: req.petId }).sort({ createdAt: 1 }).lean();
  const users = await MobileUser.find({ _id: { $in: members.map((m) => m.user) } })
    .select("name email")
    .lean();
  const names = new Map(users.map((u) => [String(u._id), u.name]));
  const emails = new Map(users.map((u) => [String(u._id), u.email]));

  const owner = members.find((m) => m.role === "owner");
  const body = {
    ownerName: owner ? names.get(String(owner.user)) ?? "Owner" : "Owner",
    members: members.map((m) => ({
      userId: String(m.user),
      name: names.get(String(m.user)) ?? "Guardian",
      role: m.role,
      permissions: m.permissions || (m.role === "owner" ? ["*"] : ["view_pet", "view_tasks"]),
      joinedAt: m.createdAt,
      isYou: String(m.user) === req.user.id,
      ...(req.petRole === "owner" && String(m.user) !== req.user.id ? { email: maskEmail(emails.get(String(m.user))) } : {}),
      canEditPermissions: req.petRole === "owner" && m.role === "co_guardian",
      canRemove: req.petRole === "owner" && m.role === "co_guardian",
    })),
    you: { role: req.petRole, canInvite: req.petRole === "owner" },
    permissionOptions: PERMISSION_OPTIONS,
    limits: { maxGuardians: LIMITS.guardiansPerPet, used: members.filter((m) => m.role === "co_guardian").length },
  };

  if (req.petRole === "owner") {
    const [requests, invites] = await Promise.all([
      GuardianRequest.find({ pet: req.petId, status: "pending" }).sort({ createdAt: -1 }).limit(20).lean(),
      GuardianInvite.find({ pet: req.petId, revokedAt: null, expiresAt: { $gt: new Date() } })
        .select("expiresAt useCount maxUses createdAt")
        .sort({ createdAt: -1 })
        .limit(LIMITS.activeInvitesPerPet)
        .lean(),
    ]);
    const requesters = await MobileUser.find({ _id: { $in: requests.map((r) => r.requester) } })
      .select("name email")
      .lean();
    const byId = new Map(requesters.map((u) => [String(u._id), u]));

    body.pendingRequests = requests.map((r) => ({
      id: String(r._id),
      requester: {
        id: String(r.requester),
        name: byId.get(String(r.requester))?.name ?? "Someone",
        email: maskEmail(byId.get(String(r.requester))?.email),
      },
      createdAt: r.createdAt,
    }));
    body.invites = invites.map((i) => ({
      id: String(i._id),
      expiresAt: i.expiresAt,
      uses: i.useCount,
      maxUses: i.maxUses,
    }));
  }
  ok(res, body);
});

/* POST /api/pets/:petId/guardians/invites   (owner) -> token is shown ONCE */
export const createInvite = asyncHandler(async (req, res) => {
  if ((await memberCount(req.petId)) >= LIMITS.guardiansPerPet) {
    throw new ApiError(403, `A pet can have up to ${LIMITS.guardiansPerPet} co-guardians.`, { code: "GUARDIAN_LIMIT" });
  }
  const active = await GuardianInvite.countDocuments({
    pet: req.petId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (active >= LIMITS.activeInvitesPerPet) {
    throw new ApiError(429, "Too many active invites. Revoke one first.", { code: "INVITE_LIMIT" });
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const invite = await GuardianInvite.create({
    pet: req.petId,
    createdBy: req.user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + config.guardian.inviteMinutes * 60 * 1000),
  });

  ok(
    res,
    {
      invite: {
        id: String(invite._id),
        token,
        // Put this in the QR code / share sheet. The app opens it and calls /lookup then /redeem.
        deepLink: `${config.guardian.appScheme}://guardian-invite?token=${token}`,
        expiresAt: invite.expiresAt,
        maxUses: invite.maxUses,
      },
    },
    201
  );
});

/* DELETE /api/pets/:petId/guardians/invites/:inviteId   (owner) */
export const revokeInvite = asyncHandler(async (req, res) => {
  const id = idParam(req.params.inviteId, "Invite");
  const result = await GuardianInvite.updateOne(
    { _id: id, pet: req.petId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  if (!result.matchedCount) throw notFoundError("Invite not found.");
  ok(res, { message: "Invite revoked." });
});

async function decide(req, res, status) {
  const id = idParam(req.params.requestId, "Request");
  let grantedPermissions = ["view_pet", "view_tasks"];
  if (status === "approved") {
    if (req.body?.permissions !== undefined) grantedPermissions = normalizePermissions(req.body.permissions);
  }

  if (status === "approved" && (await memberCount(req.petId)) >= LIMITS.guardiansPerPet) {
    throw new ApiError(403, `A pet can have up to ${LIMITS.guardiansPerPet} co-guardians.`, { code: "GUARDIAN_LIMIT" });
  }

  // Atomic: a request can only be decided once, even with double taps.
  const request = await GuardianRequest.findOneAndUpdate(
    { _id: id, pet: req.petId, status: "pending" },
    { $set: { status, decidedBy: req.user.id, decidedAt: new Date() } },
    { new: true }
  ).lean();
  if (!request) throw notFoundError("Request not found or already handled.");

  const pet = await Pet.findById(req.petId).select("name").lean();

  if (status === "approved") {
    try {
      await PetMember.create({ pet: req.petId, user: request.requester, role: "co_guardian", permissions: grantedPermissions, addedBy: req.user.id });
    } catch (error) {
      if (error?.code !== 11000) {
        await GuardianRequest.updateOne({ _id: id }, { $set: { status: "pending", decidedBy: null, decidedAt: null } });
        throw error;
      }
    }
  }

  await notify(
    String(request.requester),
    status === "approved"
      ? {
          type: "guardian_approved",
          title: `You're now a guardian of ${pet?.name ?? "a pet"}`,
          body: `The owner granted: ${grantedPermissions.join(", ").replaceAll("_", " ")}.`,
          data: { petId: req.petId },
        }
      : {
          type: "guardian_rejected",
          title: "Guardian request declined",
          body: `${pet?.name ?? "The"} owner did not accept your request.`,
          data: { petId: req.petId },
        },
    { email: status === "approved" }
  );

  ok(res, { message: status === "approved" ? "Guardian added." : "Request declined." });
}

/* POST /api/pets/:petId/guardians/requests/:requestId/approve   (owner) */
export const approveRequest = asyncHandler((req, res) => decide(req, res, "approved"));
/* POST /api/pets/:petId/guardians/requests/:requestId/reject    (owner) */
export const rejectRequest = asyncHandler((req, res) => decide(req, res, "rejected"));

/* GET /api/pets/:petId/guardians/permissions   The switches for the permission screen. */
export const permissionOptions = asyncHandler(async (_req, res) => {
  ok(res, { options: PERMISSION_OPTIONS });
});

/* PATCH /api/pets/:petId/guardians/:userId (owner)  { permissions: [...] } */
export const updateGuardianPermissions = asyncHandler(async (req, res) => {
  const userId = idParam(req.params.userId, "Guardian");
  const permissions = normalizePermissions(req.body?.permissions);
  const member = await PetMember.findOneAndUpdate(
    { pet: req.petId, user: userId, role: "co_guardian" },
    { $set: { permissions } },
    { new: true }
  ).lean();
  if (!member) throw notFoundError("Guardian not found.");

  const pet = await Pet.findById(req.petId).select("name").lean();
  await notify(userId, {
    type: "guardian_permissions",
    title: `Your access to ${pet?.name ?? "a pet"} changed`,
    body: `You can now: ${permissions.map((p) => p.replaceAll("_", " ")).join(", ")}.`,
    data: { petId: req.petId },
  });
  ok(res, { member: { userId, role: member.role, permissions: member.permissions }, message: "Permissions updated." });
});

/* DELETE /api/pets/:petId/guardians/:userId   (owner removes a co-guardian) */
export const removeGuardian = asyncHandler(async (req, res) => {
  const userId = idParam(req.params.userId, "Guardian");
  const result = await PetMember.deleteOne({ pet: req.petId, user: userId, role: "co_guardian" });
  if (!result.deletedCount) throw notFoundError("Guardian not found.");

  const pet = await Pet.findById(req.petId).select("name").lean();
  await notify(userId, {
    type: "guardian_removed",
    title: "Removed as guardian",
    body: `You no longer have access to ${pet?.name ?? "this pet"}.`,
    data: {},
  });
  ok(res, { message: "Guardian removed." });
});

/* POST /api/pets/:petId/guardians/leave   (a co-guardian leaves) */
export const leave = asyncHandler(async (req, res) => {
  if (req.petRole === "owner") {
    throw new ApiError(400, "The owner cannot leave. Delete the pet instead.", { code: "OWNER_CANNOT_LEAVE" });
  }
  await PetMember.deleteOne({ pet: req.petId, user: req.user.id, role: "co_guardian" });
  ok(res, { message: "You left this pet." });
});

/* ------------------------------------------------------------------ */
/* Invited person: /api/guardian-invites and /api/guardian-requests    */
/* ------------------------------------------------------------------ */

async function resolveInvite(req) {
  const { token } = validate(req.body, TOKEN_SPEC);
  const invite = await GuardianInvite.findOne({ tokenHash: hashToken(token) }).lean();
  if (!isInviteUsable(invite)) throw new ApiError(404, INVITE_INVALID, { code: "INVITE_INVALID" });
  const pet = await Pet.findById(invite.pet).select("owner").lean();
  if (!pet || String(pet.owner) !== String(invite.createdBy)) throw new ApiError(404, INVITE_INVALID, { code: "INVITE_INVALID" });
  if (String(pet.owner) === String(req.user.id)) throw new ApiError(409, "You already own this pet.", { code: "ALREADY_OWNER" });

  const existing = await PetMember.exists({ pet: invite.pet, user: req.user.id });
  if (existing) throw new ApiError(409, "You already look after this pet.", { code: "ALREADY_MEMBER" });
  return invite;
}

/* POST /api/guardian-invites/lookup  { token }   Preview shown before the person confirms. */
export const lookupInvite = asyncHandler(async (req, res) => {
  const invite = await resolveInvite(req);
  const [pet, owner] = await Promise.all([
    Pet.findById(invite.pet).select("name type avatarKey photo.url").lean(),
    MobileUser.findById(invite.createdBy).select("name").lean(),
  ]);
  if (!pet) throw new ApiError(404, INVITE_INVALID, { code: "INVITE_INVALID" });

  ok(res, {
    pet: { name: pet.name, type: pet.type, avatarKey: pet.avatarKey || null, photoUrl: pet.photo?.url ?? null },
    invitedBy: owner?.name ?? "The owner",
    expiresAt: invite.expiresAt,
  });
});

/* POST /api/guardian-invites/redeem  { token }   Creates a pending request; the owner must approve. */
export const redeemInvite = asyncHandler(async (req, res) => {
  const invite = await resolveInvite(req);

  const already = await GuardianRequest.findOne({ pet: invite.pet, requester: req.user.id, status: "pending" }).lean();
  if (already) return ok(res, { requestId: String(already._id), status: "pending", created: false });

  if ((await memberCount(invite.pet)) >= LIMITS.guardiansPerPet) {
    throw new ApiError(403, "This pet already has the maximum number of guardians.", { code: "GUARDIAN_LIMIT" });
  }

  let request;
  try {
    request = await GuardianRequest.create({ pet: invite.pet, requester: req.user.id, invite: invite._id });
  } catch (error) {
    if (error?.code === 11000) return ok(res, { status: "pending", created: false });
    throw error;
  }

  // Count the use atomically; if the invite was just used up or revoked, undo the request.
  const used = await GuardianInvite.findOneAndUpdate(
    {
      _id: invite._id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
      $expr: { $lt: ["$useCount", "$maxUses"] },
    },
    { $inc: { useCount: 1 } }
  ).lean();
  if (!used) {
    await GuardianRequest.deleteOne({ _id: request._id });
    throw new ApiError(404, INVITE_INVALID, { code: "INVITE_INVALID" });
  }

  const pet = await Pet.findById(invite.pet).select("name owner").lean();
  await notify(
    String(pet.owner),
    {
      type: "guardian_request",
      title: "New guardian request",
      body: `${req.user.name} wants to help look after ${pet.name}.`,
      data: { petId: String(pet._id), requestId: String(request._id) },
    },
    { email: true }
  );

  ok(res, { requestId: String(request._id), status: "pending", created: true }, 201);
});

/* POST /api/guardian-requests/by-pet-qr { token }. Public QR creates a pending
   request only; private pet access is granted only after owner approval. */
export const requestByPetQr = asyncHandler(async (req, res) => {
  const { token } = validate(req.body, TOKEN_SPEC);
  const pet = await Pet.findOne({ qrToken: token }).select("_id owner name type breed gender birthDate weightKg avatarKey photo.url").lean();
  if (!pet) throw new ApiError(404, "This PetCard QR is invalid or expired.", { code: "PET_QR_INVALID" });
  if (String(pet.owner) === req.user.id) throw new ApiError(409, "You are already the owner of this pet.", { code: "ALREADY_OWNER" });
  if (await PetMember.exists({ pet: pet._id, user: req.user.id })) throw new ApiError(409, "You already have access to this pet.", { code: "ALREADY_MEMBER" });
  if ((await memberCount(pet._id)) >= LIMITS.guardiansPerPet) throw new ApiError(403, "This pet already has the maximum number of guardians.", { code: "GUARDIAN_LIMIT" });
  let request;
  try { request = await GuardianRequest.create({ pet: pet._id, requester: req.user.id, invite: null }); }
  catch (error) {
    if (error?.code === 11000) {
      const existing = await GuardianRequest.findOne({ pet: pet._id, requester: req.user.id, status: "pending" }).lean();
      return ok(res, { requestId: String(existing._id), status: "pending", created: false });
    }
    throw error;
  }
  await notify(String(pet.owner), { type: "guardian_request", title: "New guardian request", body: `${req.user.name} wants to help look after ${pet.name}.`, data: { petId: String(pet._id), requestId: String(request._id) } }, { email: true });
  ok(res, { requestId: String(request._id), status: "pending", created: true, pet: { id: String(pet._id), name: pet.name, type: pet.type, breed: pet.breed, gender: pet.gender, birthDate: pet.birthDate, weightKg: pet.weightKg, avatarKey: pet.avatarKey || null, photoUrl: pet.photo?.url || null } }, 201);
});

/* GET /api/guardian-requests/mine   The signed-in user's own requests (for the "waiting for approval" state). */
export const myRequests = asyncHandler(async (req, res) => {
  const requests = await GuardianRequest.find({ requester: req.user.id })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  const pets = await Pet.find({ _id: { $in: requests.map((r) => r.pet) } }).select("name avatarKey photo.url").lean();
  const byId = new Map(pets.map((p) => [String(p._id), p]));

  ok(res, {
    requests: requests.map((r) => ({
      id: String(r._id),
      status: r.status,
      petId: r.status === "approved" ? String(r.pet) : undefined,
      petName: byId.get(String(r.pet))?.name ?? "Pet",
      avatarKey: byId.get(String(r.pet))?.avatarKey ?? null,
      createdAt: r.createdAt,
    })),
  });
});

/* DELETE /api/guardian-requests/:requestId   Cancel your own pending request. */
export const cancelRequest = asyncHandler(async (req, res) => {
  const id = idParam(req.params.requestId, "Request");
  const result = await GuardianRequest.updateOne(
    { _id: id, requester: req.user.id, status: "pending" },
    { $set: { status: "cancelled" } }
  );
  if (!result.matchedCount) throw notFoundError("Request not found.");
  ok(res, { message: "Request cancelled." });
});
