import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    pet: { type: mongoose.Schema.Types.ObjectId, ref: "Pet", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", required: true },

    title: { type: String, required: true, trim: true, maxlength: 80 },
    note: { type: String, default: "", maxlength: 300 },
    category: { type: String, required: true, maxlength: 20 },

    recurrence: {
      type: { type: String, enum: ["once", "daily", "weekly"], required: true },
      daysOfWeek: { type: [Number], default: [] }, // 0 = Sunday .. 6 = Saturday (weekly only)
      startDate: { type: String, required: true }, // YYYY-MM-DD
      endDate: { type: String, default: null },
    },
    timeOfDay: { type: String, default: null, maxlength: 5 }, // HH:mm

    /*
     * Alert settings: the app schedules a local notification `minutesBefore`
     * minutes before the task time on the days the task occurs, and rings
     * and/or vibrates as chosen here.
     */
    reminder: {
      enabled: { type: Boolean, default: true },
      minutesBefore: { type: Number, default: 0, min: 0, max: 1440 },
      sound: { type: Boolean, default: true },
      vibrate: { type: Boolean, default: true },
    },

    /* Fixed by the server from the category when the task is created. */
    points: { type: Number, required: true, min: 0 },
    xp: { type: Number, required: true, min: 0 },

    archivedAt: { type: Date, default: null },
  },
  { timestamps: true, strictQuery: true }
);

taskSchema.index({ pet: 1, archivedAt: 1, "recurrence.startDate": 1 });
taskSchema.index({ createdAt: -1, _id: -1 });
taskSchema.index({ category: 1, archivedAt: 1 });

const Task = mongoose.models.Task || mongoose.model("Task", taskSchema);
export default Task;
