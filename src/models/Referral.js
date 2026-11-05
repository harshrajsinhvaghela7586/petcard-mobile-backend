import mongoose from "mongoose";

/* `referee` is unique: a user can be referred exactly once, ever. */
const referralSchema = new mongoose.Schema(
  {
    referrer: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", required: true },
    referee: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", required: true, unique: true },
    code: { type: String, required: true, maxlength: 16 },
    rewarded: { type: Boolean, default: false },
    rewardedAt: { type: Date, default: null },
    rewardSkipped: { type: Boolean, default: false },
    adminNote: { type: String, default: "", maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, strictQuery: true }
);

referralSchema.index({ referrer: 1, createdAt: -1 });

const Referral = mongoose.models.Referral || mongoose.model("Referral", referralSchema);
export default Referral;
