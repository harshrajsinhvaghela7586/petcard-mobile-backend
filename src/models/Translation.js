import mongoose from "mongoose";

/* One translated UI string, shared by every user: the same sentence is translated by the AI only once. */
const translationSchema = new mongoose.Schema(
  {
    lang: { type: String, required: true, index: true },
    hash: { type: String, required: true },
    source: { type: String, required: true, maxlength: 700 },
    text: { type: String, required: true, maxlength: 1500 },
  },
  { timestamps: true }
);
translationSchema.index({ lang: 1, hash: 1 }, { unique: true });

export default mongoose.models.Translation || mongoose.model("Translation", translationSchema);
