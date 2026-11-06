import mongoose from "mongoose";

/*
 * "Someone who scanned the pet's QR code wants to see the pet parent's contact details."
 * The details are released ONLY to `requester`, ONLY after the owner approves.
 */
const contactAccessRequestSchema = new mongoose.Schema(
  {
    pet: { type: mongoose.Schema.Types.ObjectId, ref: "Pet", required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", required: true },
    requester: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", required: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", default: null },
    decidedAt: { type: Date, default: null },
    /* Approved access is temporary: after this moment the requester must ask again. */
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true, strictQuery: true }
);

/* One open request per person per pet. */
contactAccessRequestSchema.index(
  { pet: 1, requester: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);
contactAccessRequestSchema.index({ pet: 1, requester: 1, createdAt: -1 });
contactAccessRequestSchema.index({ pet: 1, status: 1, createdAt: -1 });

/* Rules: one request per person per pet every 24 hours; approved access lasts 3 days. */
export const CONTACT_REQUEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const CONTACT_ACCESS_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/** "approved" only while the 3-day window is open; afterwards "expired" (treated like no access). */
export function effectiveContactStatus(doc, now = Date.now()) {
  if (!doc) return "none";
  if (doc.status !== "approved") return doc.status;
  const end = doc.expiresAt
    ? new Date(doc.expiresAt).getTime()
    : new Date(doc.decidedAt || doc.createdAt || 0).getTime() + CONTACT_ACCESS_TTL_MS;
  return end > now ? "approved" : "expired";
}

/** When this person may send the next request for the pet (null = right now). */
export function nextContactRequestAt(doc, now = Date.now()) {
  if (!doc?.createdAt) return null;
  const at = new Date(doc.createdAt).getTime() + CONTACT_REQUEST_COOLDOWN_MS;
  return at > now ? new Date(at) : null;
}

const ContactAccessRequest =
  mongoose.models.ContactAccessRequest || mongoose.model("ContactAccessRequest", contactAccessRequestSchema);
export default ContactAccessRequest;
