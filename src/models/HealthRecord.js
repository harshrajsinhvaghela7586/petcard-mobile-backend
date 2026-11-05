import mongoose from "mongoose";

export const HEALTH_TYPES = [
  "vaccination",
  "deworming",
  "flea_tick",
  "vet_visit",
  "checkup",
  "medication",
  "weight",
  "allergy",
  "condition",
  "surgery",
  "dental",
  "lab_test",
  "grooming",
  "other",
];

const healthRecordSchema = new mongoose.Schema(
  {
    pet: { type: mongoose.Schema.Types.ObjectId, ref: "Pet", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", required: true },

    type: { type: String, enum: HEALTH_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    date: { type: String, required: true }, // YYYY-MM-DD
    nextDueDate: { type: String, default: null },
    weightKg: { type: Number, default: null, min: 0, max: 500 },
    vetName: { type: String, default: "", maxlength: 80 },
    dosage: { type: String, default: "", maxlength: 80 },
    /* Repeats: marking this record done creates the next one this many days later. */
    repeatEveryDays: { type: Number, default: null, min: 1, max: 3650 },
    /* The app reminds this many days before nextDueDate. */
    reminderDaysBefore: { type: Number, default: 1, min: 0, max: 90 },
    completedAt: { type: Date, default: null },
    notes: { type: String, default: "", maxlength: 1000 },
  },
  { timestamps: true, strictQuery: true }
);

healthRecordSchema.index({ pet: 1, date: -1, _id: -1 });
healthRecordSchema.index({ pet: 1, nextDueDate: 1 });
healthRecordSchema.index({ pet: 1, type: 1, date: -1 });
/* Admin "due soon" view across every pet. */
healthRecordSchema.index({ nextDueDate: 1, completedAt: 1 });
healthRecordSchema.index({ createdAt: -1, _id: -1 });

const HealthRecord =
  mongoose.models.HealthRecord || mongoose.model("HealthRecord", healthRecordSchema);
export default HealthRecord;
