import mongoose from "mongoose";

/* Who changed what in the admin panel. Append-only, kept for a year. */
const adminAuditSchema = new mongoose.Schema(
  {
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    adminEmail: { type: String, default: "", maxlength: 254 },
    action: { type: String, required: true, maxlength: 60 }, // e.g. "user.update"
    targetType: { type: String, default: "", maxlength: 30 },
    targetId: { type: String, default: "", maxlength: 40 },
    summary: { type: String, default: "", maxlength: 300 },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, strictQuery: true }
);
adminAuditSchema.index({ createdAt: -1, _id: -1 });
adminAuditSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
adminAuditSchema.index({ admin: 1, createdAt: -1 });
adminAuditSchema.index({ action: 1, createdAt: -1 });
adminAuditSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export default mongoose.models.AdminAudit || mongoose.model("AdminAudit", adminAuditSchema);
