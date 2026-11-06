import GuardianRequest from "../../models/GuardianRequest.js";
import GuardianInvite from "../../models/GuardianInvite.js";
import PetMember from "../../models/PetMember.js";
import Pet from "../../models/Pet.js";
import MobileUser from "../../models/MobileUser.js";
import { asyncHandler, ok, ApiError, notFoundError } from "../../utils/http.js";
import { validate, field, t } from "../../utils/schema.js";
import { LIMITS } from "../../config/rewards.js";
import { normalizePermissions, PERMISSION_OPTIONS } from "../guardianController.js";
import { notify } from "../../services/notificationService.js";
import { audit } from "../../services/adminAudit.js";
import {
  pageArgs, enumOf, boolOf, dateRangeOf, allOf, compact, runPaged, idOf, idFilter, byId, searchOf,
} from "../../utils/adminQuery.js";

const REQUEST_STATUSES = ["pending", "approved", "rejected", "cancelled"];
const person = (u) => (u ? { id: String(u._id), name: u.name, email: u.email } : null);

async function names(rows, petKey, userKeys) {
  const [pets, users] = await Promise.all([
    Pet.find({ _id: { $in: rows.map((r) => r[petKey]) } }).select("name type owner").lean(),
    MobileUser.find({ _id: { $in: rows.flatMap((r) => userKeys.map((k) => r[k]).filter(Boolean)) } }).select("name email").lean(),
  ]);
  return { petOf: byId(pets), userOf: byId(users) };
}

/** Pet ids matching ?owner / ?pet / ?search (pet name). */
async function petFilterFor(req) {
  const pet = idFilter(req.query.pet, "pet");
  const owner = idFilter(req.query.owner, "owner");
  const search = searchOf(req);
  if (pet && !owner && !search) return { pet };
  if (!pet && !owner && !search) return {};
  const q = compact({ _id: pet, owner });
  if (search) q.name = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  return { pet: { $in: await Pet.find(q).limit(500).distinct("_id") } };
}

/* GET /api/admin/guardians?status&pet&owner&requester&search&from&to&page&limit   Guardian requests. */
export const requests = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageArgs(req);
  const filter = allOf(
    await petFilterFor(req),
    compact({ status: enumOf(req.query.status, REQUEST_STATUSES, "status"), requester: idFilter(req.query.requester, "requester"), createdAt: dateRangeOf(req) })
  );
  const { items, pagination } = await runPaged(GuardianRequest, { filter, sort: { createdAt: -1, _id: -1 }, skip, limit, page });
  const { petOf, userOf } = await names(items, "pet", ["requester", "decidedBy"]);
  ok(res, {
    items: items.map((r) => ({
      id: String(r._id),
      status: r.status,
      pet: petOf.get(String(r.pet)) ? { id: String(r.pet), name: petOf.get(String(r.pet)).name, type: petOf.get(String(r.pet)).type } : null,
      requester: person(userOf.get(String(r.requester))),
      decidedBy: person(userOf.get(String(r.decidedBy))),
      decidedAt: r.decidedAt,
      createdAt: r.createdAt,
    })),
    pagination,
  });
});

/* PATCH /api/admin/guardians/:id/decision   { status: "approved"|"rejected", permissions? } */
export const decide = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "Request");
  const data = validate(req.body, {
    status: field(t.oneOf(["approved", "rejected"]), { required: true }),
    permissions: field(t.array(t.string({ max: 40 }), { max: 20 })),
  });
  const existing = await GuardianRequest.findOne({ _id: id, status: "pending" }).lean();
  if (!existing) throw notFoundError("Pending request not found.");
  const permissions = data.permissions ? normalizePermissions(data.permissions) : ["view_pet", "view_tasks"];

  if (data.status === "approved" && (await PetMember.countDocuments({ pet: existing.pet })) >= LIMITS.guardiansPerPet) {
    throw new ApiError(403, `A pet can have up to ${LIMITS.guardiansPerPet} guardians.`, { code: "GUARDIAN_LIMIT" });
  }
  const request = await GuardianRequest.findOneAndUpdate(
    { _id: id, status: "pending" },
    { $set: { status: data.status, decidedAt: new Date(), decidedBy: null } },
    { new: true }
  ).lean();
  if (!request) throw notFoundError("Request not found or already handled.");

  if (data.status === "approved") {
    try {
      await PetMember.create({ pet: request.pet, user: request.requester, role: "co_guardian", permissions });
    } catch (error) {
      if (error?.code !== 11000) {
        await GuardianRequest.updateOne({ _id: id }, { $set: { status: "pending", decidedAt: null } });
        throw error;
      }
    }
  }
  const pet = await Pet.findById(request.pet).select("name").lean();
  await notify(
    String(request.requester),
    data.status === "approved"
      ? { type: "guardian_approved", title: `You're now a guardian of ${pet?.name ?? "a pet"}`, body: "Approved by PetCard support.", data: { petId: String(request.pet) } }
      : { type: "guardian_rejected", title: "Guardian request declined", body: `Your request for ${pet?.name ?? "this pet"} was declined.`, data: { petId: String(request.pet) } },
    { email: data.status === "approved" }
  );
  audit(req, `guardian.${data.status}`, "guardian_request", id, `${data.status} request for ${pet?.name ?? request.pet}`);
  ok(res, { request: { id: String(request._id), status: request.status, decidedAt: request.decidedAt } });
});

/* GET /api/admin/guardians/members?pet&owner&user&role&search&page&limit   Who looks after which pet. */
export const members = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageArgs(req);
  const filter = allOf(
    await petFilterFor(req),
    compact({ user: idFilter(req.query.user, "user"), role: enumOf(req.query.role, ["owner", "co_guardian"], "role") })
  );
  const { items, pagination } = await runPaged(PetMember, { filter, sort: { createdAt: -1, _id: -1 }, skip, limit, page });
  const { petOf, userOf } = await names(items, "pet", ["user"]);
  ok(res, {
    items: items.map((m) => ({
      id: String(m._id),
      role: m.role,
      permissions: m.permissions,
      since: m.createdAt,
      pet: petOf.get(String(m.pet)) ? { id: String(m.pet), name: petOf.get(String(m.pet)).name } : null,
      user: person(userOf.get(String(m.user))),
    })),
    pagination,
    permissionOptions: PERMISSION_OPTIONS,
  });
});

/* PATCH /api/admin/guardians/members/:memberId   { permissions } */
export const updateMember = asyncHandler(async (req, res) => {
  const id = idOf(req.params.memberId, "Member");
  const permissions = normalizePermissions(validate(req.body, { permissions: field(t.array(t.string({ max: 40 }), { max: 20 }), { required: true }) }).permissions);
  const member = await PetMember.findOneAndUpdate({ _id: id, role: "co_guardian" }, { $set: { permissions } }, { new: true }).lean();
  if (!member) throw notFoundError("Guardian not found.");
  const pet = await Pet.findById(member.pet).select("name").lean();
  await notify(String(member.user), {
    type: "guardian_permissions",
    title: `Your access to ${pet?.name ?? "a pet"} changed`,
    body: `You can now: ${permissions.map((p) => p.replaceAll("_", " ")).join(", ")}.`,
    data: { petId: String(member.pet) },
  });
  audit(req, "guardian.permissions", "pet_member", id, `Permissions changed for ${pet?.name ?? member.pet}`, { permissions });
  ok(res, { member: { id: String(member._id), permissions: member.permissions } });
});

/* DELETE /api/admin/guardians/members/:memberId   (co-guardians only; owners are removed by deleting the pet) */
export const removeMember = asyncHandler(async (req, res) => {
  const id = idOf(req.params.memberId, "Member");
  const member = await PetMember.findOneAndDelete({ _id: id, role: "co_guardian" }).lean();
  if (!member) throw notFoundError("Guardian not found.");
  const pet = await Pet.findById(member.pet).select("name").lean();
  await notify(String(member.user), { type: "guardian_removed", title: "Removed as guardian", body: `You no longer have access to ${pet?.name ?? "this pet"}.`, data: {} });
  audit(req, "guardian.remove", "pet_member", id, `Removed a guardian from ${pet?.name ?? member.pet}`);
  ok(res, { message: "Guardian removed." });
});

/* GET /api/admin/guardians/invites?pet&owner&active&page&limit */
export const invites = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageArgs(req);
  const active = boolOf(req.query.active);
  const now = new Date();
  const filter = allOf(
    await petFilterFor(req),
    active === true ? { revokedAt: null, expiresAt: { $gt: now } } : active === false ? { $or: [{ revokedAt: { $ne: null } }, { expiresAt: { $lte: now } }] } : null
  );
  const { items, pagination } = await runPaged(GuardianInvite, { filter, sort: { createdAt: -1, _id: -1 }, skip, limit, select: "-tokenHash", page });
  const { petOf, userOf } = await names(items, "pet", ["createdBy"]);
  ok(res, {
    items: items.map((i) => ({
      id: String(i._id),
      pet: petOf.get(String(i.pet)) ? { id: String(i.pet), name: petOf.get(String(i.pet)).name } : null,
      createdBy: person(userOf.get(String(i.createdBy))),
      expiresAt: i.expiresAt,
      revokedAt: i.revokedAt,
      useCount: i.useCount,
      maxUses: i.maxUses,
      active: !i.revokedAt && i.expiresAt > now && i.useCount < i.maxUses,
      createdAt: i.createdAt,
    })),
    pagination,
  });
});

/* DELETE /api/admin/guardians/invites/:inviteId   Revokes (the link stops working). */
export const revokeInvite = asyncHandler(async (req, res) => {
  const id = idOf(req.params.inviteId, "Invite");
  const result = await GuardianInvite.updateOne({ _id: id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  if (!result.matchedCount) throw notFoundError("Invite not found or already revoked.");
  audit(req, "guardian.revoke_invite", "guardian_invite", id, "Revoked an invite");
  ok(res, { message: "Invite revoked." });
});
