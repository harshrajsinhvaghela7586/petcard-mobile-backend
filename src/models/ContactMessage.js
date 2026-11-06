import mongoose from "mongoose";

const contactMessageSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  subject: { type: String, default: "", trim: true, maxlength: 150 },
  message: { type: String, required: true, trim: true, maxlength: 5000 },
  status: { type: String, enum: ["received", "in_progress", "resolved"], default: "received" },
  replies: [{ admin: { type: String, maxlength: 100 }, message: { type: String, maxlength: 5000 }, sentAt: { type: Date, default: Date.now } }],
}, { timestamps: true, strictQuery: true });

contactMessageSchema.index({ createdAt: -1 });
contactMessageSchema.index({ status: 1, createdAt: -1 });
export default mongoose.models.ContactMessage || mongoose.model("ContactMessage", contactMessageSchema);
