import Notification from "../../models/Notification.js";
import MobileUser from "../../models/MobileUser.js";
import Pet from "../../models/Pet.js";
import { asyncHandler, ok, ApiError, notFoundError } from "../../utils/http.js";
import { validate, field, t } from "../../utils/schema.js";
import { NOTIFICATION_TYPES, serializeNotification } from "../../services/notificationActions.js";
import { sendPushToMany } from "../../services/pushService.js";
import { COUNTRY_BY_ISO, LANGUAGE_CODES } from "../../config/countries.js";
import { audit } from "../../services/adminAudit.js";
import {
  pageArgs, searchOf, searchFilter, boolOf, enumOf, sortOf, dateRangeOf, allOf, compact, runPaged, idOf, idFilter, byId,
} from "../../utils/adminQuery.js";

const MAX_AUDIENCE = 50_000;
const BATCH = 1000;

/* GET /api/admin/notifications?search&user&type&read&from&to&sort&order&page&limit */
export const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageArgs(req);
  const { spec } = sortOf(req, ["createdAt"]);
  const read = boolOf(req.query.read);
  const filter = allOf(
    searchFilter(searchOf(req), ["title", "body"]),
    compact({
      user: idFilter(req.query.user, "user"),
      type: enumOf(req.query.type, NOTIFICATION_TYPES, "type"),
      createdAt: dateRangeOf(req),
      ...(read === true ? { readAt: { $type: "date" } } : read === false ? { readAt: null } : {}),
    })
  );
  const { items, pagination } = await runPaged(Notification, { filter, sort: spec, skip, limit, page });
  const users = await MobileUser.find({ _id: { $in: items.map((n) => n.user) } }).select("name email").lean();
  const userOf = byId(users);
  ok(res, {
    items: items.map((n) => ({
      ...serializeNotification(n),
      user: userOf.get(String(n.user)) ? { id: String(n.user), name: userOf.get(String(n.user)).name, email: userOf.get(String(n.user)).email } : { id: String(n.user), name: "Deleted user", email: "" },
      read: Boolean(n.readAt),
    })),
    pagination,
  });
});

/* GET /api/admin/notifications/stats   Counts for the header cards and the type filter. */
export const stats = asyncHandler(async (_req, res) => {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [total, unread, last7, byType] = await Promise.all([
    Notification.estimatedDocumentCount(),
    Notification.countDocuments({ readAt: null }),
    Notification.countDocuments({ createdAt: { $gte: since } }),
    Notification.aggregate([{ $group: { _id: "$type", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
  ]);
  ok(res, { stats: { total, unread, read: total - unread, last7Days: last7 }, byType: byType.map((r) => ({ type: r._id, count: r.count })), types: NOTIFICATION_TYPES });
});

const SEND_SPEC = {
  title: field(t.string({ min: 2, max: 100 }), { required: true }),
  body: field(t.string({ max: 300, allowEmpty: true, multiline: true })),
  userIds: field(t.array(t.objectId(), { max: 500 })),
  audience: field(
    t.object({
      all: field(t.bool()),
      country: field(t.string({ min: 2, max: 2 })),
      language: field(t.oneOf(LANGUAGE_CODES)),
      hasPet: field(t.bool()),
      verified: field(t.bool()),
    })
  ),
  push: field(t.bool()),
};

/** Streams matching user ids in _id order, BATCH at a time (no big in-memory list, index-friendly). */
async function* audienceBatches(filter, pre) {
  let last = null;
  let seen = 0;
  for (;;) {
    const rows = await MobileUser.find({ ...filter, ...(last ? { _id: { $gt: last } } : {}) })
      .sort({ _id: 1 })
      .limit(BATCH)
      .select("_id notificationPrefs.push")
      .lean();
    if (!rows.length) return;
    last = rows[rows.length - 1]._id;
    let batch = rows;
    if (pre) batch = await pre(batch);
    seen += batch.length;
    if (seen > MAX_AUDIENCE) throw new ApiError(400, `Audience is larger than ${MAX_AUDIENCE} users. Narrow it with filters.`, { code: "AUDIENCE_TOO_LARGE" });
    yield batch;
  }
}

/*
 * POST /api/admin/notifications/send
 *   { title, body?, push?: true, userIds: [...] }                    -> specific users
 *   { title, body?, push?: true, audience: { all: true, country?, language?, hasPet?, verified? } }
 * Creates the in-app notification for each person and (unless push:false) sends a push.
 */
export const send = asyncHandler(async (req, res) => {
  const data = validate(req.body, SEND_SPEC);
  if (!data.userIds?.length && !data.audience) {
    throw new ApiError(400, "Choose who should receive this: `userIds` or an `audience`.", { code: "VALIDATION_ERROR" });
  }
  if (data.userIds?.length && data.audience) throw new ApiError(400, "Use either `userIds` or `audience`, not both.", { code: "VALIDATION_ERROR" });
  const title = data.title;
  const body = data.body ?? "";
  const wantPush = data.push !== false;

  let filter;
  let pre = null;
  if (data.userIds?.length) {
    filter = { _id: { $in: data.userIds }, disabledAt: null };
  } else {
    const a = data.audience;
    const country = a.country?.toUpperCase();
    if (country && !COUNTRY_BY_ISO.has(country)) throw new ApiError(400, "Unknown country.", { code: "VALIDATION_ERROR" });
    const narrowed = Boolean(country || a.language || a.hasPet !== undefined || a.verified !== undefined);
    if (!a.all && !narrowed) throw new ApiError(400, "Set `audience.all: true` or add a filter.", { code: "VALIDATION_ERROR" });
    filter = { disabledAt: null, isEmailVerified: a.verified === false ? false : true, ...compact({ country, language: a.language }) };
    if (a.hasPet !== undefined) {
      pre = async (rows) => {
        const owners = new Set((await Pet.find({ owner: { $in: rows.map((r) => r._id) } }).distinct("owner")).map(String));
        return rows.filter((r) => owners.has(String(r._id)) === a.hasPet);
      };
    }
  }

  let sent = 0;
  let pushed = 0;
  for await (const batch of audienceBatches(filter, pre)) {
    if (!batch.length) continue;
    await Notification.insertMany(
      batch.map((u) => ({ user: u._id, type: "admin_announcement", title, body, data: {} })),
      { ordered: false }
    );
    sent += batch.length;
    if (wantPush) {
      const pushIds = batch.filter((u) => u.notificationPrefs?.push !== false).map((u) => u._id);
      pushed += pushIds.length;
      sendPushToMany(pushIds, { title, body, data: { type: "admin_announcement" } });
    }
  }
  if (!sent) throw notFoundError("No matching users found.");
  audit(req, "notification.send", "notification", "", `Sent "${title}" to ${sent} user(s)`, { sent, pushed, audience: data.audience ?? "userIds" });
  ok(res, { sent, pushed }, 201);
});

/* DELETE /api/admin/notifications/:id */
export const remove = asyncHandler(async (req, res) => {
  const result = await Notification.deleteOne({ _id: idOf(req.params.id, "Notification") });
  if (!result.deletedCount) throw notFoundError("Notification not found.");
  audit(req, "notification.delete", "notification", req.params.id, "Deleted one notification");
  ok(res, { message: "Notification deleted." });
});

/* POST /api/admin/notifications/delete-many   { ids: [...] }  or  { type, olderThanDays } */
export const removeMany = asyncHandler(async (req, res) => {
  const data = validate(req.body, {
    ids: field(t.array(t.objectId(), { max: 500, min: 1 })),
    type: field(t.oneOf(NOTIFICATION_TYPES)),
    olderThanDays: field(t.int({ min: 1, max: 3650 })),
  });
  let filter;
  if (data.ids) filter = { _id: { $in: data.ids } };
  else if (data.type && data.olderThanDays) filter = { type: data.type, createdAt: { $lt: new Date(Date.now() - data.olderThanDays * 86_400_000) } };
  else throw new ApiError(400, "Send `ids`, or both `type` and `olderThanDays`.", { code: "VALIDATION_ERROR" });
  const result = await Notification.deleteMany(filter);
  audit(req, "notification.delete_many", "notification", "", `Deleted ${result.deletedCount} notification(s)`, data);
  ok(res, { deleted: result.deletedCount });
});
