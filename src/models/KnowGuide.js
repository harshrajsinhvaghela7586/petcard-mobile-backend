import mongoose from "mongoose";

/*
 * One inner "Know" guide for a page + species + breed. breed "" is the generic guide for the species and
 * is used when the pet's breed has no guide of its own. Text uses {{petName}}.
 */
const knowGuideSchema = new mongoose.Schema(
  {
    pageKey: { type: String, required: true, trim: true, maxlength: 60 },
    species: { type: String, enum: ["dog", "cat", "rabbit"], required: true },
    breed: { type: String, default: "", trim: true, maxlength: 60 },
    chip: { type: String, default: "", maxlength: 60 },
    sections: { type: [mongoose.Schema.Types.Mixed], default: [] },
    footer: { type: String, default: "", maxlength: 300 },
  },
  { timestamps: true, strictQuery: true }
);

knowGuideSchema.index({ pageKey: 1, species: 1, breed: 1 }, { unique: true });

const KnowGuide = mongoose.models.KnowGuide || mongoose.model("KnowGuide", knowGuideSchema);
export default KnowGuide;