import PetMember from "../models/PetMember.js";
import { asyncHandler, ok, notFoundError, forbidden } from "../utils/http.js";
import { validate, field, t } from "../utils/schema.js";
import { isObjectId } from "../utils/validators.js";
import { createUploadSignature } from "../services/cloudinary.js";

/*
 * POST /api/uploads/sign   { purpose: "pet_photo" | "memory" | "user_photo", petId? }
 * Returns what the app needs to upload ONE image straight to Cloudinary. After the
 * upload, send the result (public_id, width, height, format) to the pet / memory /
 * profile endpoint. "user_photo" is the guardian's own profile picture (no petId).
 */
export const signUpload = asyncHandler(async (req, res) => {
  const data = validate(req.body, {
    purpose: field(t.oneOf(["pet_photo", "memory", "user_photo"]), { required: true }),
    petId: field(t.objectId()),
  });

  if (data.purpose === "user_photo") {
    ok(res, { upload: createUploadSignature({ userId: req.user.id, petId: null, purpose: "user_photo" }) });
    return;
  }

  if (data.purpose === "memory" && !data.petId) {
    throw notFoundError("Pet not found.");
  }

  if (data.petId) {
    if (!isObjectId(data.petId)) throw notFoundError("Pet not found.");
    const member = await PetMember.findOne({ pet: data.petId, user: req.user.id }).select("role").lean();
    if (!member) throw notFoundError("Pet not found.");
    if (data.purpose === "pet_photo" && member.role !== "owner") throw forbidden("Only the pet owner can do that.");
  }

  ok(res, { upload: createUploadSignature({ userId: req.user.id, petId: data.petId ?? null, purpose: data.purpose }) });
});