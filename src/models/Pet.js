import mongoose from "mongoose";
import crypto from "node:crypto";

const photoSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true, maxlength: 200 },
    url: { type: String, required: true, maxlength: 500 },
    width: { type: Number, min: 1, max: 20000 },
    height: { type: Number, min: 1, max: 20000 },
    format: { type: String, maxlength: 10 },
  },
  { _id: false }
);

const petSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", required: true },

    qrToken: { type: String, default: () => crypto.randomBytes(24).toString("base64url"), unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    type: { type: String, required: true, maxlength: 30 },
    breed: { type: String, default: "", maxlength: 60 },
    gender: { type: String, enum: ["male", "female", "unknown"], default: "unknown" },
    birthDate: { type: String, default: null }, // YYYY-MM-DD
    weightKg: { type: Number, default: null, min: 0, max: 500 },

    avatarKey: { type: String, default: null, maxlength: 60 },
    avatarLocalId: { type: String, default: null, maxlength: 30 },
    unlockedFrameKeys: { type: [String], default: ["frame_default"] },
    activeFrameKey: { type: String, default: "frame_default", maxlength: 40 },
    photo: { type: photoSchema, default: null },

    /* Stickers shown on the pet card. `stickerSlots` only ever grows (bought slots stay bought). */
    stickerKeys: { type: [String], default: [] },
    activeStickerKey: { type: String, default: null, maxlength: 60 },
    stickerSlots: { type: Number, required: true, min: 1, max: 50 },

    /* Optional daily targets set by the owner; empty = calculated from species, age, weight, breed. */
    trackerGoals: {
      foodGrams: { type: Number, default: null, min: 1, max: 5000 },
      waterMl: { type: Number, default: null, min: 1, max: 10000 },
      activityMin: { type: Number, default: null, min: 1, max: 600 },
      mealsPerDay: { type: Number, default: null, min: 1, max: 8 },
    },

    /* Optional health screen */
    health: {
      vaccinated: { type: Boolean, default: null },
      allergies: { type: [String], default: [] },
      conditions: { type: [String], default: [] },
      vetName: { type: String, default: "", maxlength: 80 },
      vetPhone: { type: String, default: "", maxlength: 25 },
      notes: { type: String, default: "", maxlength: 500 },
    },

    /* Reminder screen (the app schedules local notifications from this) */
    reminders: {
      enabled: { type: Boolean, default: true },
      time: { type: String, default: "09:00", maxlength: 5 },
    },

    /* Progress (server-authoritative; updated only through rewardService) */
    xp: { type: Number, default: 0, min: 0 },
    level: { type: Number, default: 1, min: 1 },
    streak: {
      current: { type: Number, default: 0, min: 0 },
      longest: { type: Number, default: 0, min: 0 },
      lastDate: { type: String, default: null },
    },

    /* Client-generated key that makes "create pet" safe to retry. */
    idempotencyKey: { type: String, maxlength: 80 },
  },
  { timestamps: true, strictQuery: true }
);

petSchema.index({ owner: 1, createdAt: 1 });
/* Admin filters and rankings. */
petSchema.index({ createdAt: -1, _id: -1 });
petSchema.index({ type: 1, breed: 1 });
petSchema.index({ xp: -1, _id: 1 });
petSchema.index({ level: -1, xp: -1 });
petSchema.index({ "streak.current": -1 });
petSchema.index({ "streak.longest": -1 });
petSchema.index({ owner: 1, xp: -1 });
petSchema.index(
  { owner: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);

const Pet = mongoose.models.Pet || mongoose.model("Pet", petSchema);
export default Pet;
