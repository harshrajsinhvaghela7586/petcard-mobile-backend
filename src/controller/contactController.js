import ContactMessage from "../models/ContactMessage.js";
import { config } from "../config/env.js";
import { queueMail } from "../services/mailer.js";
import { asyncHandler, ok, ApiError } from "../utils/http.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const createContactMessage = asyncHandler(async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const subject = String(req.body?.subject ?? "").trim();
  const message = String(req.body?.message ?? "").trim();
  if (name.length < 2 || name.length > 100) throw new ApiError(400, "Enter a valid name.", { code: "VALIDATION_ERROR" });
  if (!EMAIL.test(email) || email.length > 254) throw new ApiError(400, "Enter a valid email address.", { code: "VALIDATION_ERROR" });
  if (subject.length > 150) throw new ApiError(400, "Subject must be 150 characters or fewer.", { code: "VALIDATION_ERROR" });
  if (message.length < 5 || message.length > 5000) throw new ApiError(400, "Message must be between 5 and 5,000 characters.", { code: "VALIDATION_ERROR" });

  const saved = await ContactMessage.create({ name, email, subject, message });
  if (config.smtp.supportEmail) {
    queueMail({
      to: config.smtp.supportEmail,
      replyTo: email,
      subject: `[PetCard Support] ${subject || "New contact message"}`,
      text: `From: ${name} <${email}>\n\n${message}`,
    }, { dedupeKey: `contact:${saved._id}` });
  }
  ok(res, { message: "Your message has been received. Our team will get back to you soon.", id: String(saved._id) }, 201);
});
