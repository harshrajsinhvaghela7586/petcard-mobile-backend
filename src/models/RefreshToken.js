import mongoose from "mongoose";

/*
 * Refresh tokens are opaque random strings. Only their SHA-256 is stored.
 * Every refresh rotates the token inside the same "family"; presenting an
 * already-used token revokes the whole family (stolen-token detection).
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", required: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    userAgent: { type: String, default: "", maxlength: 200 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, strictQuery: true }
);

refreshTokenSchema.index({ user: 1, revokedAt: 1 });
refreshTokenSchema.index({ family: 1 });
/* MongoDB deletes the document once expiresAt passes. */
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RefreshToken =
  mongoose.models.RefreshToken || mongoose.model("RefreshToken", refreshTokenSchema);

export default RefreshToken;
