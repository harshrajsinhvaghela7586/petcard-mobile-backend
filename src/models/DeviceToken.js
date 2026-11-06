import mongoose from "mongoose";

const deviceTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", required: true },
    token: { type: String, required: true, unique: true, maxlength: 200 },
    platform: { type: String, enum: ["ios", "android", "web"], default: "android" },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false }, strictQuery: true }
);

deviceTokenSchema.index({ user: 1 });

const DeviceToken =
  mongoose.models.DeviceToken || mongoose.model("DeviceToken", deviceTokenSchema);
export default DeviceToken;
