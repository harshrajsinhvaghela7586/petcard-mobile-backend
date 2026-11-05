import PetMember from "../models/PetMember.js";
import { asyncHandler, notFoundError, forbidden } from "../utils/http.js";
import { isObjectId } from "../utils/validators.js";

/*
 * Authorization for every /pets/:petId/... route. Membership is looked up
 * from the database on each request, using the authenticated user's id (never
 * an id from the request body). Non-members get 404, not 403, so pet ids
 * cannot be probed.
 *
 *   petAccess()          any member (owner or co-guardian)
 *   petAccess("owner")   owner only
 */
export const petAccess = (minRole = "co_guardian") =>
  asyncHandler(async (req, _res, next) => {
    const { petId } = req.params;
    if (!isObjectId(petId)) throw notFoundError("Pet not found.");

    const member = await PetMember.findOne({ pet: petId, user: req.user.id }).select("role permissions").lean();
    if (!member) throw notFoundError("Pet not found.");
    if (minRole === "owner" && member.role !== "owner") {
      throw forbidden("Only the pet owner can do that.");
    }

    req.petId = petId;
    req.petRole = member.role;
    req.petPermissions = member.role === "owner" ? ["*"] : (member.permissions?.length ? member.permissions : ["view_pet", "view_tasks"]);
    next();
  });

/** Use after petAccess(): only the owner may continue. */
export const requireOwner = (req, _res, next) =>
  req.petRole === "owner" ? next() : next(forbidden("Only the pet owner can do that."));


/** Enforce the least-privilege scope granted by the owner to a co-guardian. */
export const requirePetPermission = (permission) => (req, _res, next) => {
  if (req.petRole === "owner" || req.petPermissions?.includes("*") || req.petPermissions?.includes(permission)) return next();
  return next(forbidden("The pet owner has not granted this access."));
};
