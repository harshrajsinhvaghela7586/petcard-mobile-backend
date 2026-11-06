import mongoose from "mongoose";

/*
 * Avatars and stickers the app offers. `key` must match the asset key the app
 * uses (bundled image or Cloudinary id). Managed with `npm run seed:catalog`.
 */
const catalogItemSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["avatar", "sticker"], required: true },
    key: { type: String, required: true, maxlength: 60 },
    petType: { type: String, default: "all", maxlength: 30 }, // "all" or a pet type slug
    label: { type: String, default: "", maxlength: 60 },
    sortOrder: { type: Number, default: 0 },
    price: { type: Number, default: 0, min: 0, max: 100000 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, strictQuery: true }
);

catalogItemSchema.index({ kind: 1, key: 1 }, { unique: true });
catalogItemSchema.index({ kind: 1, active: 1, petType: 1, sortOrder: 1 });

const CatalogItem =
  mongoose.models.CatalogItem || mongoose.model("CatalogItem", catalogItemSchema);
export default CatalogItem;
