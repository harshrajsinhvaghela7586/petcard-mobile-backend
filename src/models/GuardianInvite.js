import mongoose from "mongoose";

/* Only the SHA-256 of the invite token is stored. */
const guardianInviteSchema = new mongoose.Schema(
  {
    pet: { type: mongoose.Schema.Types.ObjectId, ref: "Pet", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    useCount: { type: Number, default: 0 },
    maxUses: { type: Number, default: 5 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, strictQuery: true }
);

guardianInviteSchema.index({ pet: 1, revokedAt: 1, expiresAt: 1 });
guardianInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

const GuardianInvite =
  mongoose.models.GuardianInvite || mongoose.model("GuardianInvite", guardianInviteSchema);
export default GuardianInvite;
