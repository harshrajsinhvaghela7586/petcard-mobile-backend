import mongoose from "mongoose";

const guardianRequestSchema = new mongoose.Schema(
  {
    pet: { type: mongoose.Schema.Types.ObjectId, ref: "Pet", required: true },
    requester: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", required: true },
    invite: { type: mongoose.Schema.Types.ObjectId, ref: "GuardianInvite", default: null },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
    },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", default: null },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true, strictQuery: true }
);

/* One open request per person per pet. */
guardianRequestSchema.index(
  { pet: 1, requester: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);
guardianRequestSchema.index({ pet: 1, status: 1, createdAt: -1 });
guardianRequestSchema.index({ requester: 1, status: 1, createdAt: -1 });

const GuardianRequest =
  mongoose.models.GuardianRequest || mongoose.model("GuardianRequest", guardianRequestSchema);
export default GuardianRequest;
