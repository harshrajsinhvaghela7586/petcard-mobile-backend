import Memory from "../models/Memory.js";
import MobileUser from "../models/MobileUser.js";
import {
  asyncHandler,
  ok,
  ApiError,
  notFoundError,
  forbidden,
  encodeCursor,
  decodeCursor,
} from "../utils/http.js";
import { validate, field, t, isValidDateKey, todayKey } from "../utils/schema.js";
import { isObjectId } from "../utils/validators.js";
import { LIMITS } from "../config/rewards.js";
import { syncPetAchievements } from "../services/achievementService.js";
import { acceptUploadedPhoto, destroyAssets } from "../services/cloudinary.js";

const photoSpec = t.object({
  publicId: field(t.string({ min: 10, max: 200, pattern: /^[A-Za-z0-9/_-]+$/ }), { required: true }),
  width: field(t.int({ min: 1, max: 20000 })),
  height: field(t.int({ min: 1, max: 20000 })),
  format: field(t.key({ max: 10 })),
});

const SPEC = {
  title: field(t.string({ max: 100, allowEmpty: true })),
  caption: field(t.string({ max: 1000, allowEmpty: true, multiline: true })),
  date: field(t.dateKey({ allowFuture: false })),
  photo: field(photoSpec, { nullable: true }),
};

const serialize = (m, authors) => ({
  id: String(m._id),
  petId: String(m.pet),
  title: m.title || "",
  caption: m.caption || "",
  date: m.date,
  photo: m.photo ? { url: m.photo.url, width: m.photo.width ?? null, height: m.photo.height ?? null } : null,
  author: { id: String(m.author), name: authors?.get(String(m.author)) ?? null },
  createdAt: m.createdAt,
});

const authorNames = async (rows) => {
  const ids = [...new Set(rows.map((r) => String(r.author)))];
  const users = await MobileUser.find({ _id: { $in: ids } }).select("name").lean();
  return new Map(users.map((u) => [String(u._id), u.name]));
};

const memoryIdOf = (req) => {
  if (!isObjectId(req.params.memoryId)) throw notFoundError("Memory not found.");
  return req.params.memoryId;
};

/* GET /api/pets/:petId/memories?cursor&limit */
export const list = asyncHandler(async (req, res) => {
  const q = validate(req.query, {
    limit: field(t.int({ min: 1, max: 30, coerce: true })),
    cursor: field(t.string({ max: 300 })),
  });
  const limit = q.limit ?? 12;
  const cursor = decodeCursor(q.cursor);

  const filter = { pet: req.petId };
  if (cursor) {
    if (!isValidDateKey(cursor.date) || !isObjectId(cursor.id)) {
      throw new ApiError(400, "Invalid cursor.", { code: "INVALID_CURSOR" });
    }
    filter.$or = [{ date: { $lt: cursor.date } }, { date: cursor.date, _id: { $lt: cursor.id } }];
  }

  const rows = await Memory.find(filter).sort({ date: -1, _id: -1 }).limit(limit + 1).lean();
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const authors = await authorNames(page);

  ok(res, {
    memories: page.map((m) => serialize(m, authors)),
    nextCursor: rows.length > limit ? encodeCursor({ date: last.date, id: String(last._id) }) : null,
  });
});

/* POST /api/pets/:petId/memories */
export const create = asyncHandler(async (req, res) => {
  const data = validate(req.body, SPEC);
  if (!data.photo && !data.caption && !data.title) {
    throw new ApiError(400, "Add a photo or some text.", { code: "EMPTY_MEMORY" });
  }

  // Reject photos that are not in the caller's own upload folder before touching the database.
  const photo = data.photo ? acceptUploadedPhoto(data.photo, { userId: req.user.id, petId: req.petId }) : null;

  const count = await Memory.countDocuments({ pet: req.petId });
  if (count >= LIMITS.memoriesPerPet) {
    throw new ApiError(403, "Memory limit reached.", { code: "MEMORY_LIMIT" });
  }

  const memory = await Memory.create({
    pet: req.petId,
    author: req.user.id,
    title: data.title ?? "",
    caption: data.caption ?? "",
    date: data.date ?? todayKey(),
    photo,
  });

  await syncPetAchievements(req.user.id, req.petId).catch(() => undefined);
  ok(res, { memory: serialize(memory.toObject(), new Map([[req.user.id, req.user.name]])) }, 201);
});

/* GET /api/pets/:petId/memories/:memoryId */
export const get = asyncHandler(async (req, res) => {
  const memory = await Memory.findOne({ _id: memoryIdOf(req), pet: req.petId }).lean();
  if (!memory) throw notFoundError("Memory not found.");
  ok(res, { memory: serialize(memory, await authorNames([memory])) });
});

/* PATCH /api/pets/:petId/memories/:memoryId   (author or pet owner) */
export const update = asyncHandler(async (req, res) => {
  const data = validate(req.body, SPEC);
  const memory = await Memory.findOne({ _id: memoryIdOf(req), pet: req.petId });
  if (!memory) throw notFoundError("Memory not found.");
  if (String(memory.author) !== req.user.id && req.petRole !== "owner") throw forbidden();

  let oldPhotoId = null;
  if (data.photo !== undefined) {
    oldPhotoId = memory.photo?.publicId ?? null;
    memory.photo = data.photo ? acceptUploadedPhoto(data.photo, { userId: req.user.id, petId: req.petId }) : null;
  }
  for (const key of ["title", "caption", "date"]) if (data[key] !== undefined) memory[key] = data[key];
  await memory.save();

  if (oldPhotoId && oldPhotoId !== memory.photo?.publicId) destroyAssets([oldPhotoId]);
  ok(res, { memory: serialize(memory.toObject(), await authorNames([memory])) });
});

/* DELETE /api/pets/:petId/memories/:memoryId   (author or pet owner) */
export const remove = asyncHandler(async (req, res) => {
  const memory = await Memory.findOne({ _id: memoryIdOf(req), pet: req.petId }).lean();
  if (!memory) throw notFoundError("Memory not found.");
  if (String(memory.author) !== req.user.id && req.petRole !== "owner") throw forbidden();

  await Memory.deleteOne({ _id: memory._id });
  destroyAssets([memory.photo?.publicId]);
  ok(res, { message: "Memory deleted." });
});
