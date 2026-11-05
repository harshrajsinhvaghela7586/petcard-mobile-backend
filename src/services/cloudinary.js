import crypto from "node:crypto";
import { config } from "../config/env.js";
import { ApiError } from "../utils/http.js";
import { log, serializeError } from "../utils/logger.js";

/*
 * Signed direct uploads: the app uploads the image straight to Cloudinary using
 * a short-lived signature from this API. The API secret never leaves the server,
 * the server decides the destination folder, and only ids inside the caller's own
 * folder can later be attached to a pet, memory or profile.
 */

const cfg = config.cloudinary;
const ALLOWED_FORMATS = "jpg,jpeg,png,webp,heic,heif";
const INCOMING_TRANSFORMATION = "c_limit,w_1600,h_1600,q_auto";

export function assertEnabled() {
  if (!cfg.enabled) {
    throw new ApiError(503, "Photo uploads are not available right now.", {
      code: "UPLOADS_DISABLED",
    });
  }
}

const sign = (params) => {
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("sha1").update(toSign + cfg.apiSecret).digest("hex");
};

/** Folder every asset of this user+pet must live in. */
export const folderFor = (userId, petId) =>
  `${cfg.rootFolder}/users/${userId}/pets/${petId || "draft"}`;

/** Folder for the user's own profile photo (not tied to any pet). */
export const profileFolderFor = (userId) => `${cfg.rootFolder}/users/${userId}/profile`;

export function createUploadSignature({ userId, petId, purpose }) {
  assertEnabled();

  const timestamp = Math.floor(Date.now() / 1000);
  const base = purpose === "user_photo" ? profileFolderFor(userId) : folderFor(userId, petId);
  const publicId = `${base}/${purpose}/${crypto.randomBytes(12).toString("hex")}`;

  const params = {
    allowed_formats: ALLOWED_FORMATS,
    public_id: publicId,
    timestamp,
    transformation: INCOMING_TRANSFORMATION,
    ...(cfg.uploadPreset ? { upload_preset: cfg.uploadPreset } : {}),
  };

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`,
    apiKey: cfg.apiKey,
    timestamp,
    signature: sign(params),
    // The app must send exactly these fields (plus `file` and `api_key`).
    params,
    expiresInSeconds: 600,
  };
}

export const deliveryUrl = (publicId) =>
  `https://res.cloudinary.com/${cfg.cloudName}/image/upload/f_auto,q_auto/${publicId}`;

/** Accepts a client-reported upload result only if the id sits in the caller's own folder. */
export function acceptUploadedPhoto(photo, { userId, petId, profile = false }) {
  assertEnabled();
  // "draft" lets the app upload a pet photo before the pet exists.
  const prefixes = profile
    ? [`${profileFolderFor(userId)}/`]
    : [`${folderFor(userId, petId)}/`, `${folderFor(userId, null)}/`];
  const id = photo.publicId;
  if (!prefixes.some((p) => id.startsWith(p)) || id.includes("..") || !/^[A-Za-z0-9/_-]+$/.test(id)) {
    throw new ApiError(400, "That photo cannot be used here.", { code: "INVALID_PHOTO" });
  }
  return {
    publicId: id,
    url: deliveryUrl(id),
    width: photo.width,
    height: photo.height,
    format: photo.format,
  };
}

/** Best-effort removal; never blocks or fails the request. */
export function destroyAssets(publicIds) {
  if (!cfg.enabled) return;
  for (const publicId of publicIds.filter(Boolean)) {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = new URLSearchParams({
      public_id: publicId,
      timestamp: String(timestamp),
      api_key: cfg.apiKey,
      signature: sign({ public_id: publicId, timestamp }),
    });
    fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/destroy`, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    }).catch((error) => log.warn("cloudinary.destroy_failed", { error: serializeError(error) }));
  }
}