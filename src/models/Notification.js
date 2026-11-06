import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", required: true },
    type: { type: String, required: true, maxlength: 40 },
    title: { type: String, required: true, maxlength: 100 },
    body: { type: String, default: "", maxlength: 300 },
    /* Small routing payload for the app, e.g. { petId, requestId }. Ids only. */
    data: { type: Map, of: String, default: {} },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, strictQuery: true }
);

notificationSchema.index({ user: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ user: 1, readAt: 1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ type: 1, "data.recordId": 1 }, { sparse: true });
notificationSchema.index({ createdAt: -1, _id: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const Notification =
  mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
export default Notification;
