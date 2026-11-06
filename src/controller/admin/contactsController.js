import crypto from "node:crypto";
import ContactMessage from "../../models/ContactMessage.js";
import MobileUser from "../../models/MobileUser.js";
import { asyncHandler, ok, notFoundError } from "../../utils/http.js";
import { validate, field, t } from "../../utils/schema.js";
import { queueMail } from "../../services/mailer.js";
import { notify } from "../../services/notificationService.js";
import { audit } from "../../services/adminAudit.js";
import {
  pageArgs, searchOf, searchFilter, boolOf, enumOf, sortOf, dateRangeOf, allOf, compact, runPaged, idOf,
} from "../../utils/adminQuery.js";

const STATUSES = ["received", "in_progress", "resolved"];

const shape = (m) => ({
  id: String(m._id),
  name: m.name,
  email: m.email,
  subject: m.subject || "",
  message: m.message,
  status: m.status,
  replyCount: m.replies?.length ?? 0,
  replied: (m.replies?.length ?? 0) > 0,
  replies: m.replies,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
});

/* GET /api/admin/contacts?search&status&replied&from&to&sort&order&page&limit */
export const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageArgs(req);
  const { spec } = sortOf(req, ["createdAt", "updatedAt", "status"]);
  const replied = boolOf(req.query.replied);
  const filter = allOf(
    searchFilter(searchOf(req), ["name", "email", "subject", "message"], { emailField: "email" }),
    compact({
      status: enumOf(req.query.status, STATUSES, "status"),
      createdAt: dateRangeOf(req),
      ...(replied === true ? { "replies.0": { $exists: true } } : replied === false ? { "replies.0": { $exists: false } } : {}),
    })
  );
  const { items, pagination } = await runPaged(ContactMessage, { filter, sort: spec, skip, limit, page });
  // The list only needs a preview, not the whole conversation.
  ok(res, {
    items: items.map((m) => ({ ...shape(m), message: m.message.length > 200 ? `${m.message.slice(0, 200)}…` : m.message, replies: undefined })),
    pagination,
  });
});

/* GET /api/admin/contacts/stats */
export const stats = asyncHandler(async (_req, res) => {
  const rows = await ContactMessage.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]);
  const count = (s) => rows.find((r) => r._id === s)?.n ?? 0;
  ok(res, { stats: { received: count("received"), inProgress: count("in_progress"), resolved: count("resolved"), total: rows.reduce((a, r) => a + r.n, 0) } });
});

/* GET /api/admin/contacts/:id   Full message and conversation. */
export const detail = asyncHandler(async (req, res) => {
  const item = await ContactMessage.findById(idOf(req.params.id, "Message")).lean();
  if (!item) throw notFoundError("Message not found.");
  const user = await MobileUser.findOne({ email: item.email }).select("name").lean();
  ok(res, { item: shape(item), user: user ? { id: String(user._id), name: user.name } : null });
});

/* PATCH /api/admin/contacts/:id   { status } */
export const update = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "Message");
  const { status } = validate(req.body, { status: field(t.oneOf(STATUSES), { required: true }) });
  const item = await ContactMessage.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean();
  if (!item) throw notFoundError("Message not found.");
  audit(req, "contact.status", "contact", id, `Marked ${status}`);
  ok(res, { item: shape(item) });
});

/* POST /api/admin/contacts/:id/reply   { message, resolve? }
 * Emails the person; if they have an app account they also get an in-app notification. */
export const reply = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "Message");
  const data = validate(req.body, {
    message: field(t.string({ min: 2, max: 5000, multiline: true }), { required: true }),
    resolve: field(t.bool()),
  });
  const item = await ContactMessage.findByIdAndUpdate(
    id,
    {
      $push: { replies: { admin: req.admin.email, message: data.message, sentAt: new Date() } },
      $set: { status: data.resolve ? "resolved" : "in_progress" },
    },
    { new: true }
  ).lean();
  if (!item) throw notFoundError("Message not found.");

  const subject = `Re: ${item.subject || "Your PetCard enquiry"}`.slice(0, 180);
  const digest = crypto.createHash("sha256").update(data.message).digest("hex");
  queueMail({ to: item.email, subject, text: `${data.message}\n\n— PetCard Support` }, { dedupeKey: `admin-contact:${id}:${digest}` });

  const user = await MobileUser.findOne({ email: item.email }).select("_id").lean();
  if (user) {
    await notify(String(user._id), {
      type: "contact_reply",
      title: "PetCard Support replied",
      body: data.message.length > 120 ? `${data.message.slice(0, 117)}…` : data.message,
      data: { contactId: String(id) },
    });
  }
  audit(req, "contact.reply", "contact", id, `Replied to ${item.email}`);
  ok(res, { item: shape(item), emailQueued: true, inAppNotified: Boolean(user), message: "Reply sent." }, 201);
});

/* DELETE /api/admin/contacts/:id */
export const remove = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "Message");
  const result = await ContactMessage.deleteOne({ _id: id });
  if (!result.deletedCount) throw notFoundError("Message not found.");
  audit(req, "contact.delete", "contact", id, "Deleted a contact message");
  ok(res, { message: "Message deleted." });
});

