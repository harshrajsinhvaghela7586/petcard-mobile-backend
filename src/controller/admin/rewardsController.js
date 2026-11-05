import crypto from "node:crypto";
import RewardWallet from "../../models/RewardWallet.js";
import RewardLedger, { LEDGER_KINDS } from "../../models/RewardLedger.js";
import MobileUser from "../../models/MobileUser.js";
import Referral from "../../models/Referral.js";
import Pet from "../../models/Pet.js";
import { asyncHandler, ok, ApiError, notFoundError } from "../../utils/http.js";
import { validate, field, t } from "../../utils/schema.js";
import { REFERRAL_REFERRER_POINTS } from "../../config/rewards.js";
import { grant, spend, getBalance } from "../../services/rewardService.js";
import { notify } from "../../services/notificationService.js";
import { audit } from "../../services/adminAudit.js";
import {
  pageArgs, searchOf, searchFilter, boolOf, enumOf, intOf, sortOf, dateRangeOf, allOf, compact, runPaged, idOf, idFilter, byId,
} from "../../utils/adminQuery.js";

const person = (u) => (u ? { id: String(u._id), name: u.name, email: u.email } : null);

/** User ids matching a text search (bounded) for the wallet/referral lists. */
async function userIdsFor(text) {
  const filter = searchFilter(text, ["name", "email", "referralCode"], { emailField: "email" });
  return MobileUser.find(filter).limit(500).distinct("_id");
}

/* GET /api/admin/rewards?search&min&max&sort=pawPoints|lifetimePoints|updatedAt&order&page&limit   Wallets. */
export const wallets = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageArgs(req);
  const { spec } = sortOf(req, ["pawPoints", "lifetimePoints", "updatedAt", "createdAt"], { field: "lifetimePoints", order: -1 });
  const min = intOf(req.query.min, { min: 0 });
  const max = intOf(req.query.max, { min: 0 });
  const search = searchOf(req);
  const filter = allOf(
    search ? { user: { $in: await userIdsFor(search) } } : null,
    compact({ user: idFilter(req.query.user, "user") }),
    min !== undefined || max !== undefined ? { pawPoints: { ...(min !== undefined ? { $gte: min } : {}), ...(max !== undefined ? { $lte: max } : {}) } } : null
  );
  const { items, pagination } = await runPaged(RewardWallet, { filter, sort: spec, skip, limit, page });
  const users = await MobileUser.find({ _id: { $in: items.map((w) => w.user) } }).select("name email").lean();
  const userOf = byId(users);
  ok(res, { items: items.map((w) => ({ id: String(w._id), user: person(userOf.get(String(w.user))), pawPoints: w.pawPoints, lifetimePoints: w.lifetimePoints, updatedAt: w.updatedAt })), pagination });
});

/* GET /api/admin/rewards/stats */
export const stats = asyncHandler(async (_req, res) => {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [totals, byKind] = await Promise.all([
    RewardWallet.aggregate([{ $group: { _id: null, wallets: { $sum: 1 }, circulating: { $sum: "$pawPoints" }, lifetime: { $sum: "$lifetimePoints" } } }]),
    RewardLedger.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: "$kind", entries: { $sum: 1 }, points: { $sum: "$points" }, xp: { $sum: "$xp" } } },
      { $sort: { entries: -1 } },
    ]),
  ]);
  ok(res, {
    stats: { wallets: totals[0]?.wallets ?? 0, pawPointsInCirculation: totals[0]?.circulating ?? 0, lifetimePointsEarned: totals[0]?.lifetime ?? 0 },
    last30Days: byKind.map((r) => ({ kind: r._id, entries: r.entries, points: r.points, xp: r.xp })),
    kinds: LEDGER_KINDS,
  });
});

/* GET /api/admin/rewards/ledger?user&pet&kind&from&to&sign=earned|spent&page&limit */
export const ledger = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageArgs(req);
  const sign = enumOf(req.query.sign, ["earned", "spent"], "sign");
  const filter = allOf(
    compact({
      user: idFilter(req.query.user, "user"),
      pet: idFilter(req.query.pet, "pet"),
      kind: enumOf(req.query.kind, LEDGER_KINDS, "kind"),
      createdAt: dateRangeOf(req),
      ...(sign === "earned" ? { points: { $gt: 0 } } : sign === "spent" ? { points: { $lt: 0 } } : {}),
    })
  );
  const { items, pagination } = await runPaged(RewardLedger, { filter, sort: { createdAt: -1, _id: -1 }, skip, limit, select: "-key", page });
  const [users, pets] = await Promise.all([
    MobileUser.find({ _id: { $in: items.map((l) => l.user) } }).select("name email").lean(),
    Pet.find({ _id: { $in: items.filter((l) => l.pet).map((l) => l.pet) } }).select("name").lean(),
  ]);
  const [userOf, petOf] = [byId(users), byId(pets)];
  ok(res, {
    items: items.map((l) => ({
      id: String(l._id), kind: l.kind, points: l.points, xp: l.xp, date: l.date, createdAt: l.createdAt,
      user: person(userOf.get(String(l.user))),
      pet: l.pet && petOf.get(String(l.pet)) ? { id: String(l.pet), name: petOf.get(String(l.pet)).name } : null,
    })),
    pagination,
  });
});

/* POST /api/admin/rewards/:userId/adjust   { points (+/-), note }   Adds or removes Paw Points and tells the user. */
export const adjust = asyncHandler(async (req, res) => {
  const userId = idOf(req.params.userId, "User");
  const data = validate(req.body, {
    points: field(t.int({ min: -100000, max: 100000 }), { required: true }),
    note: field(t.string({ min: 3, max: 200 }), { required: true }),
  });
  if (data.points === 0) throw new ApiError(400, "Enter a non-zero amount.", { code: "VALIDATION_ERROR", extra: { fields: { points: "Must not be zero." } } });
  if (!(await MobileUser.exists({ _id: userId }))) throw notFoundError("User not found.");

  const key = `admin-adjust:${crypto.randomUUID()}`;
  if (data.points > 0) await grant({ userId, kind: "admin_adjustment", points: data.points, key });
  else await spend({ userId, kind: "admin_adjustment", points: -data.points, key });

  await notify(String(userId), {
    type: "admin_reward",
    title: data.points > 0 ? `You received ${data.points} Paw Points` : `${-data.points} Paw Points were adjusted`,
    body: data.note,
    data: {},
  });
  audit(req, "reward.adjust", "user", userId, `${data.points > 0 ? "+" : ""}${data.points} Paw Points`, { note: data.note });
  ok(res, { wallet: await getBalance(userId), ledgerKey: key }, 201);
});

/* GET /api/admin/referrals?search&rewarded&skipped&from&to&page&limit */
export const referrals = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageArgs(req);
  const search = searchOf(req);
  let searchPart = null;
  if (search) {
    const ids = await userIdsFor(search);
    searchPart = { $or: [{ referrer: { $in: ids } }, { referee: { $in: ids } }, { code: new RegExp(`^${search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i") }] };
  }
  const filter = allOf(searchPart, compact({ rewarded: boolOf(req.query.rewarded), rewardSkipped: boolOf(req.query.skipped), createdAt: dateRangeOf(req) }));
  const { items, pagination } = await runPaged(Referral, { filter, sort: { createdAt: -1, _id: -1 }, skip, limit, page });
  const users = await MobileUser.find({ _id: { $in: items.flatMap((r) => [r.referrer, r.referee]) } }).select("name email").lean();
  const userOf = byId(users);
  ok(res, {
    items: items.map((r) => ({
      id: String(r._id), code: r.code, rewarded: r.rewarded, rewardedAt: r.rewardedAt, rewardSkipped: r.rewardSkipped, adminNote: r.adminNote, createdAt: r.createdAt,
      referrer: person(userOf.get(String(r.referrer))), referee: person(userOf.get(String(r.referee))),
    })),
    pagination,
  });
});

/* POST /api/admin/referrals/:id/reward   { note? }
   Gives the referrer the referral reward by hand (for a referral that was missed or skipped). Safe to repeat: the ledger key makes it pay once. */
export const rewardReferral = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "Referral");
  const { note } = validate(req.body, { note: field(t.string({ max: 300, allowEmpty: true })) });
  const referral = await Referral.findById(id).lean();
  if (!referral) throw notFoundError("Referral not found.");
  const result = await grant({
    userId: String(referral.referrer),
    kind: "referral_referrer",
    points: REFERRAL_REFERRER_POINTS,
    key: `referral:referrer:${referral.referee}`,
  });
  if (result.duplicate && referral.rewarded && !referral.rewardSkipped) throw new ApiError(409, "This referral was already rewarded.", { code: "ALREADY_REWARDED" });
  await Referral.updateOne({ _id: id }, { $set: { rewarded: true, rewardSkipped: false, rewardedAt: new Date(), adminNote: note || "Rewarded by admin." } });
  if (!result.duplicate) {
    await notify(String(referral.referrer), { type: "referral_reward", title: "Referral bonus!", body: `You earned ${REFERRAL_REFERRER_POINTS} Paw Points for inviting a friend.`, data: { refereeId: String(referral.referee) } });
  }
  audit(req, "referral.reward", "referral", id, `Manual referral reward (${result.duplicate ? "already paid, status fixed" : `${REFERRAL_REFERRER_POINTS} points`})`);
  ok(res, { referral: { id: String(id), rewarded: true, rewardSkipped: false }, pointsGranted: result.duplicate ? 0 : REFERRAL_REFERRER_POINTS });
});

/* PATCH /api/admin/referrals/:id/skip   { note? }   Marks a referral as not eligible for the reward. */
export const skipReferral = asyncHandler(async (req, res) => {
  const id = idOf(req.params.id, "Referral");
  const { note } = validate(req.body, { note: field(t.string({ max: 300, allowEmpty: true })) });
  const referral = await Referral.findOneAndUpdate(
    { _id: id, rewarded: false },
    { $set: { rewardSkipped: true, rewarded: true, adminNote: note || "Marked ineligible by admin." } },
    { new: true }
  ).lean();
  if (!referral) throw new ApiError(409, "Referral is already rewarded or handled.", { code: "ALREADY_HANDLED" });
  audit(req, "referral.skip", "referral", id, "Marked referral ineligible");
  ok(res, { referral: { id: String(referral._id), rewarded: true, rewardSkipped: true, adminNote: referral.adminNote } });
});
