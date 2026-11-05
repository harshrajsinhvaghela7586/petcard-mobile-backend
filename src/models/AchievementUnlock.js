import mongoose from "mongoose";

const achievementUnlockSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", required: true },
  pet: { type: mongoose.Schema.Types.ObjectId, ref: "Pet", required: true },
  key: { type: String, required: true, maxlength: 50 },
  unlockedAt: { type: Date, default: Date.now },
}, { timestamps: false, strictQuery: true });
achievementUnlockSchema.index({ user: 1, pet: 1, key: 1 }, { unique: true });
achievementUnlockSchema.index({ user: 1, pet: 1, unlockedAt: -1 });
achievementUnlockSchema.index({ unlockedAt: -1, _id: -1 });
achievementUnlockSchema.index({ key: 1, unlockedAt: -1 });
achievementUnlockSchema.index({ pet: 1 });
export default mongoose.models.AchievementUnlock || mongoose.model("AchievementUnlock", achievementUnlockSchema);
