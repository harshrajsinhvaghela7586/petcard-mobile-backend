import mongoose from "mongoose";

/*
 * Text of the five "Know" menu pages (Health & Wellness, Food & Nutrition,
 * Grooming, Safety, Training), one document per page and pet type.
 *
 *   breedKey = null      -> the page for the whole species (dog / cat / rabbit)
 *   breedKey = "border-collie" -> overrides only the fields it contains
 *                                 (key = BREEDS[..].key in config/breeds.js)
 *
 * "{{petName}}" in any text is replaced with the pet's name by the server.
 * Icons, colours and links stay in the app (matched by item `key`).
 */
export const KNOW_MENU_KEYS = ["health_wellness", "food_nutrition", "grooming", "safety", "training", "basic_care"];

const knowMenuSchema = new mongoose.Schema(
  {
    menuKey: { type: String, enum: KNOW_MENU_KEYS, required: true },
    petType: { type: String, enum: ["dog", "cat", "rabbit"], required: true },
    breedKey: { type: String, default: null },
    chip: { type: String, default: "", maxlength: 40 },
    heroTitle: { type: String, default: "", maxlength: 80 },
    heroSub: { type: String, default: "", maxlength: 200 },
    heading: { type: String, default: "", maxlength: 120 },
    sub: { type: String, default: "", maxlength: 200 },
    tip: {
      type: new mongoose.Schema({ title: { type: String, maxlength: 80 }, text: { type: String, maxlength: 400 } }, { _id: false }),
      default: undefined,
    },
    items: {
      type: [new mongoose.Schema({ key: { type: String, required: true }, title: { type: String, maxlength: 60 }, sub: { type: String, maxlength: 120 } }, { _id: false })],
      default: [],
    },
  },
  { timestamps: true }
);

knowMenuSchema.index({ menuKey: 1, petType: 1, breedKey: 1 }, { unique: true });

const KnowMenu = mongoose.models.KnowMenu || mongoose.model("KnowMenu", knowMenuSchema);
export default KnowMenu;