import mongoose from "mongoose";

/* The unique (task, date) index is what makes "complete task" idempotent. */
const taskCompletionSchema = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true },
    pet: { type: mongoose.Schema.Types.ObjectId, ref: "Pet", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", required: true },
    date: { type: String, required: true }, // YYYY-MM-DD the task was done for
    pointsAwarded: { type: Number, default: 0 },
    xpAwarded: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, strictQuery: true }
);

taskCompletionSchema.index({ task: 1, date: 1 }, { unique: true });
taskCompletionSchema.index({ pet: 1, date: -1 });
taskCompletionSchema.index({ pet: 1, createdAt: -1, _id: -1 });
taskCompletionSchema.index({ createdAt: -1 });
taskCompletionSchema.index({ user: 1, createdAt: -1 });

const TaskCompletion =
  mongoose.models.TaskCompletion || mongoose.model("TaskCompletion", taskCompletionSchema);
export default TaskCompletion;
