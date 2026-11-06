import mongoose from "mongoose";

const stickerOwnershipSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", required: true },
  stickerKey: { type: String, required: true, maxlength: 60 },
  purchasedAt: { type: Date, default: Date.now },
  pricePaid: { type: Number, required: true, min: 0 },
}, { timestamps: true, strictQuery: true });

stickerOwnershipSchema.index({ user: 1, stickerKey: 1 }, { unique: true });
stickerOwnershipSchema.index({ user: 1, purchasedAt: -1 });

export default mongoose.models.StickerOwnership || mongoose.model("StickerOwnership", stickerOwnershipSchema);
