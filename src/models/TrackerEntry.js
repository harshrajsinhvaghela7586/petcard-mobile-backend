import mongoose from "mongoose";

/*
 * One log line of the daily trackers. Totals are always computed for a single
 * `date`, so every day starts at 0.
 *
 *   food     amount = grams     title = Breakfast / Lunch / Snack ...
 *   water    amount = ml
 *   activity amount = minutes   title = what the pet did (Morning walk ...)
 *   clicker  amount = clicks    title = command label (Sit, Come ...)   [counter]
 *   whistle  amount = blows     title = command label                   [counter]
 */
export const TRACKER_KINDS = ["food", "water", "activity", "clicker", "whistle"];

const trackerEntrySchema = new mongoose.Schema(
  {
    pet: { type: mongoose.Schema.Types.ObjectId, ref: "Pet", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", required: true },
    kind: { type: String, enum: TRACKER_KINDS, required: true },
    date: { type: String, required: true }, // YYYY-MM-DD (the pet's local day)
    time: { type: String, default: null, maxlength: 5 }, // HH:mm
    title: { type: String, default: "", trim: true, maxlength: 80 },
    amount: { type: Number, required: true, min: 0, max: 100000 },
    note: { type: String, default: "", maxlength: 200 },
    /* clicker / whistle: one counter per (day, label), not one document per tap. */
    counter: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false }, strictQuery: true }
);

trackerEntrySchema.index({ pet: 1, date: 1, kind: 1, _id: -1 });
trackerEntrySchema.index({ pet: 1, kind: 1, date: -1 });
trackerEntrySchema.index({ createdAt: -1 });
trackerEntrySchema.index(
  { pet: 1, date: 1, kind: 1, title: 1 },
  { unique: true, partialFilterExpression: { counter: true } }
);

const TrackerEntry = mongoose.models.TrackerEntry || mongoose.model("TrackerEntry", trackerEntrySchema);
export default TrackerEntry;
