import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },

    passwordHash: { type: String, required: true, select: false },
    verified: { type: Boolean, default: false },
    tokenVersion: { type: Number, default: 0 },

    /* Verification OTP */
    otpHash: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    otpAttempts: { type: Number, select: false },
    otpSentAt: { type: Date, select: false },

    /* Password reset OTP */
    resetHash: { type: String, select: false },
    resetExpires: { type: Date, select: false },
    resetAttempts: { type: Number, select: false },
    resetSentAt: { type: Date, select: false },

    /* Brute-force lock */
    loginFailures: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
  },
  { timestamps: true, strictQuery: true }
);

const Admin = mongoose.models.Admin || mongoose.model("Admin", adminSchema);

export default Admin;
