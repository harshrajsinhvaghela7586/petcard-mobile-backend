import mongoose from "mongoose";

/* Paw Points belong to the user. Only rewardService writes here. */
const rewardWalletSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", required: true, unique: true },
    pawPoints: { type: Number, default: 0, min: 0 },
    lifetimePoints: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, strictQuery: true }
);

/* Admin ranking by points. */
rewardWalletSchema.index({ lifetimePoints: -1, _id: 1 });
rewardWalletSchema.index({ pawPoints: -1, _id: 1 });

const RewardWallet =
  mongoose.models.RewardWallet || mongoose.model("RewardWallet", rewardWalletSchema);
export default RewardWallet;
