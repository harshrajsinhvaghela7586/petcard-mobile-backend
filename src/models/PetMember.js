import mongoose from "mongoose";

/* Membership is the ONLY thing that grants access to a pet. */
const petMemberSchema = new mongoose.Schema(
  {
    pet: { type: mongoose.Schema.Types.ObjectId, ref: "Pet", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", required: true },
    role: { type: String, enum: ["owner", "co_guardian"], required: true },
    permissions: { type: [String], default: ["view_pet", "view_tasks"] },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, strictQuery: true }
);

petMemberSchema.index({ pet: 1, user: 1 }, { unique: true });
petMemberSchema.index({ user: 1, createdAt: 1 });

const PetMember = mongoose.models.PetMember || mongoose.model("PetMember", petMemberSchema);
export default PetMember;
