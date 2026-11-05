import mongoose from "mongoose";

export const LEDGER_KINDS = [
  "task_complete",
  "daily_login",
  "streak_bonus",
  "level_up_bonus",
  "referral_referrer",
  "referral_referee",
  "sticker_slot",
  "sticker_purchase",
  "admin_adjustment",
];

/*
 * Append-only history. `key` is unique: awarding the same thing twice
 * (retries, double taps, replays) is impossible by construction.
 */
const rewardLedgerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", required: true },
    pet: { type: mongoose.Schema.Types.ObjectId, ref: "Pet", default: null },
    kind: { type: String, enum: LEDGER_KINDS, required: true },
    points: { type: Number, default: 0 }, // negative for spending
    xp: { type: Number, default: 0 },
    date: { type: String, default: null }, // YYYY-MM-DD, for daily caps
    key: { type: String, required: true, unique: true, maxlength: 120 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, strictQuery: true }
);

rewardLedgerSchema.index({ user: 1, createdAt: -1, _id: -1 });
rewardLedgerSchema.index({ pet: 1, kind: 1, date: 1 });
rewardLedgerSchema.index({ createdAt: -1, _id: -1 });
rewardLedgerSchema.index({ kind: 1, createdAt: -1 });

const RewardLedger =
  mongoose.models.RewardLedger || mongoose.model("RewardLedger", rewardLedgerSchema);
export default RewardLedger;
