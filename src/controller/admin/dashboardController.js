import MobileUser from "../../models/MobileUser.js";
import Pet from "../../models/Pet.js";
import Task from "../../models/Task.js";
import TaskCompletion from "../../models/TaskCompletion.js";
import HealthRecord from "../../models/HealthRecord.js";
import ContactMessage from "../../models/ContactMessage.js";
import GuardianRequest from "../../models/GuardianRequest.js";
import AchievementUnlock from "../../models/AchievementUnlock.js";
import RewardWallet from "../../models/RewardWallet.js";
import Referral from "../../models/Referral.js";
import Notification from "../../models/Notification.js";
import AdminAudit from "../../models/AdminAudit.js";
import { asyncHandler, ok } from "../../utils/http.js";
import { todayKey, addDays } from "../../utils/schema.js";
import { createTtlCache } from "../../utils/ttlCache.js";
import { statusFilter } from "./healthController.js";
import { attachPetProgress, levelDistribution } from "../../services/adminProgress.js";
import { pageArgs, searchOf, searchFilter, dateRangeOf, allOf, compact, runPaged } from "../../utils/adminQuery.js";

const cache = createTtlCache({ ttlMs: 30_000, max: 10 });
const DAYS = 14;

/** Daily counts for the last N days, filling the gaps with zero. */
async function trend(Model, dateField, days = DAYS, extra = {}) {
  const since = new Date(Date.now() - (days - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const rows = await Model.aggregate([
    { $match: { [dateField]: { $gte: since }, ...extra } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: `$${dateField}` } }, n: { $sum: 1 } } },
  ]);
  const byDay = new Map(rows.map((r) => [r._id, r.n]));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    return { date: d, count: byDay.get(d) ?? 0 };
  });
}

/* GET /api/admin/overview */
export const overview = asyncHandler(async (_req, res) => {
  const data = await cache.wrap("overview", async () => {
    const today = todayKey();
    const [
      users, verifiedUsers, pets, activeTasks, healthRecords, contacts, pendingContacts, pendingGuardians, achievements, referrals, notifications,
      wallets, healthOverdue, healthDueToday, healthDueWeek, completionsToday,
      signups, newPets, completions, topPets, recentUsers, recentContacts, levels,
    ] = await Promise.all([
      MobileUser.estimatedDocumentCount(),
      MobileUser.countDocuments({ isEmailVerified: true }),
      Pet.estimatedDocumentCount(),
      Task.countDocuments({ archivedAt: null }),
      HealthRecord.estimatedDocumentCount(),
      ContactMessage.estimatedDocumentCount(),
      ContactMessage.countDocuments({ status: { $ne: "resolved" } }),
      GuardianRequest.countDocuments({ status: "pending" }),
      AchievementUnlock.estimatedDocumentCount(),
      Referral.estimatedDocumentCount(),
      Notification.estimatedDocumentCount(),
      RewardWallet.aggregate([{ $group: { _id: null, circulating: { $sum: "$pawPoints" }, lifetime: { $sum: "$lifetimePoints" } } }]),
      HealthRecord.countDocuments(statusFilter("overdue", today)),
      HealthRecord.countDocuments(statusFilter("today", today)),
      HealthRecord.countDocuments(statusFilter("soon", today)),
      TaskCompletion.countDocuments({ date: today }),
      trend(MobileUser, "createdAt"),
      trend(Pet, "createdAt"),
      trend(TaskCompletion, "createdAt"),
      Pet.find().sort({ xp: -1, _id: 1 }).limit(5).select("name type breed xp level streak owner").lean(),
      MobileUser.find().sort({ createdAt: -1, _id: -1 }).limit(5).select("name email createdAt isEmailVerified").lean(),
      ContactMessage.find({ status: { $ne: "resolved" } }).sort({ createdAt: -1, _id: -1 }).limit(5).select("name email subject status createdAt").lean(),
      levelDistribution(),
    ]);
    const top = await attachPetProgress(topPets);
    return {
      stats: {
        users, verifiedUsers, unverifiedUsers: users - verifiedUsers, pets, activeTasks, healthRecords, contacts, achievementsUnlocked: achievements, referrals, notifications,
        pendingContacts, pendingGuardianRequests: pendingGuardians, taskCompletionsToday: completionsToday,
        pawPointsInCirculation: wallets[0]?.circulating ?? 0, lifetimePoints: wallets[0]?.lifetime ?? 0,
      },
      health: { overdue: healthOverdue, dueToday: healthDueToday, dueNext7Days: healthDueWeek },
      trends: { signups, newPets, taskCompletions: completions },
      levels,
      topPets: top.map((p) => ({ id: String(p._id), name: p.name, type: p.type, breed: p.breed, level: p.progress.level, xp: p.progress.xp, streak: p.progress.streak.current, achievements: p.achievements })),
      recentUsers,
      recentContacts,
      upcomingWindow: { from: today, to: addDays(today, 7) },
      generatedAt: new Date(),
    };
  });
  ok(res, data);
});

/* GET /api/admin/audit?search&action&admin&targetType&target&from&to&page&limit   Who changed what. */
export const auditLog = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageArgs(req);
  const str = (k, n = 60) => (typeof req.query[k] === "string" && req.query[k].trim() ? req.query[k].trim().slice(0, n) : undefined);
  const filter = allOf(
    searchFilter(searchOf(req), ["summary", "adminEmail"]),
    compact({ action: str("action"), adminEmail: str("admin", 254)?.toLowerCase(), targetType: str("targetType", 30), targetId: str("target", 40), createdAt: dateRangeOf(req) })
  );
  const { items, pagination } = await runPaged(AdminAudit, { filter, sort: { createdAt: -1, _id: -1 }, skip, limit, page });
  ok(res, { items: items.map((a) => ({ id: String(a._id), admin: a.adminEmail, action: a.action, targetType: a.targetType, targetId: a.targetId, summary: a.summary, meta: a.meta, createdAt: a.createdAt })), pagination });
});
