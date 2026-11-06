import mongoose from "mongoose";

/* Must match RELATIONSHIPS in controller/meController.js and frontend/src/constants/relationships.ts. */
export const RELATIONSHIP_VALUES = ["Pet Parent", "Owner", "Guardian", "Family Member", "Caretaker"];

const mobileUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },

    /* Mobile number: E.164 in `phone`, plus the parts the country picker needs. */
    phone: { type: String, trim: true, default: "", maxlength: 20 },
    country: { type: String, uppercase: true, trim: true, default: "", maxlength: 2 },
    phoneCountryCode: { type: String, trim: true, default: "", maxlength: 6 },
    phoneNational: { type: String, trim: true, default: "", maxlength: 15 },
    language: { type: String, lowercase: true, trim: true, default: "en", maxlength: 8 },

    /* Optional free-text location from the guardian profile (e.g. "Mumbai, India"). */
    location: { type: String, trim: true, default: "", maxlength: 100 },

    /*
     * Relationship to the pet. This field was MISSING before: Mongoose strict mode
     * silently dropped it from every update, so it never saved.
     */
    relationship: { type: String, enum: ["", ...RELATIONSHIP_VALUES], default: "" },

    /* Profile photo (Cloudinary). `url` is what the app displays. */
    photo: {
      type: new mongoose.Schema(
        { publicId: String, url: String, width: Number, height: Number, format: String },
        { _id: false }
      ),
      default: null,
    },

    /* The pet the app is currently showing (must be one the user has access to). */
    activePet: { type: mongoose.Schema.Types.ObjectId, ref: "Pet", default: null },
    lastLoginAt: { type: Date, default: null },

    passwordHash: { type: String, required: false, select: false },
    googleId: { type: String, trim: true, default: undefined, select: false },

    isEmailVerified: { type: Boolean, default: false },
    disabledAt: { type: Date, default: null },

    /* Profile / preferences */
    timezone: { type: String, default: "", maxlength: 64 },
    notificationPrefs: {
      push: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
    },
    /* How reminders alert: ring (sound) and/or vibrate, plus the default lead time. */
    reminderPrefs: {
      sound: { type: Boolean, default: true },
      vibrate: { type: Boolean, default: true },
      defaultMinutesBefore: { type: Number, default: 10, min: 0, max: 1440 },
    },

    /* Referral: own shareable code (created lazily) and who invited this user */
    referralCode: { type: String, maxlength: 16 },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", default: null },

    /* Bumped on password change/reset/logout-all: invalidates every access token. */
    tokenVersion: { type: Number, default: 0 },

    /* Email verification OTP (HMAC hash only, never the code itself) */
    emailOtpHash: { type: String, select: false },
    emailOtpExpiresAt: { type: Date, select: false },
    emailOtpAttempts: { type: Number, select: false },
    emailOtpSentAt: { type: Date, select: false },

    /* Password reset OTP */
    resetOtpHash: { type: String, select: false },
    resetOtpExpiresAt: { type: Date, select: false },
    resetOtpAttempts: { type: Number, select: false },
    resetOtpSentAt: { type: Date, select: false },

    /* Per-account brute-force lock */
    loginFailures: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
  },
  // strictQuery: unknown fields in filters are dropped instead of reaching MongoDB.
  { timestamps: true, strictQuery: true }
);

/* Admin user list sorts by newest first; filters use these. */
mobileUserSchema.index({ createdAt: -1, _id: -1 });
mobileUserSchema.index({ isEmailVerified: 1, createdAt: -1 });
mobileUserSchema.index({ country: 1, createdAt: -1 });
mobileUserSchema.index({ language: 1 });
mobileUserSchema.index({ googleId: 1 }, { unique: true, sparse: true });
mobileUserSchema.index({ disabledAt: 1 }, { partialFilterExpression: { disabledAt: { $type: "date" } } });

/* Unique only when set (partial index: a missing code never collides). */
mobileUserSchema.index(
  { referralCode: 1 },
  { unique: true, partialFilterExpression: { referralCode: { $type: "string" } } }
);

/* Abandoned, never-verified signups are removed after 7 days. */
mobileUserSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 7 * 24 * 60 * 60,
    partialFilterExpression: { isEmailVerified: false },
  }
);

const MobileUser =
  mongoose.models.MobileUser || mongoose.model("MobileUser", mobileUserSchema);

export default MobileUser;