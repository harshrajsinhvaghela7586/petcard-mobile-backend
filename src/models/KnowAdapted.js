import mongoose from "mongoose";

/* A Know guide rewritten for one species + breed. Shared by every user with the same pet type and breed. */
const schema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    pageKey: { type: String, required: true, index: true },
    petType: { type: String, required: true },
    breed: { type: String, default: "" },
    sections: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);
export default mongoose.models.KnowAdapted || mongoose.model("KnowAdapted", schema);
