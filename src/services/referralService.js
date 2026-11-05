import Referral from "../models/Referral.js";
import MobileUser from "../models/MobileUser.js";
import { REFERRAL_REFERRER_POINTS, REFERRAL_MAX_REWARDED_PER_USER } from "../config/rewards.js";
import { grant, getBalance } from "./rewardService.js";
import { notify } from "./notificationService.js";

/** Reward a referrer only after the referred account creates its first pet. */
export async function qualifyReferral(refereeId) {
  const referral = await Referral.findOne({ referee: refereeId, rewarded: false }).lean();
  if (!referral) return { qualified: false, rewarded: false };

  const alreadyRewarded = await Referral.countDocuments({ referrer: referral.referrer, rewarded: true });
  if (alreadyRewarded >= REFERRAL_MAX_REWARDED_PER_USER) {
    await Referral.updateOne({ _id: referral._id, rewarded: false }, { $set: { rewarded: true, rewardSkipped: true } });
    return { qualified: true, rewarded: false, reason: "REFERRAL_LIMIT" };
  }

  const referee = await MobileUser.findById(refereeId).select("name").lean();
  const reward = await grant({
    userId: String(referral.referrer),
    kind: "referral_referrer",
    points: REFERRAL_REFERRER_POINTS,
    key: `referral:referrer:${refereeId}`,
  });
  await Referral.updateOne({ _id: referral._id, rewarded: false }, { $set: { rewarded: true, rewardedAt: new Date() } });

  if (!reward.duplicate) {
    await notify(String(referral.referrer), {
      type: "referral_reward",
      title: "Referral bonus!",
      body: `${referee?.name ?? "Your friend"} completed pet setup. You earned ${REFERRAL_REFERRER_POINTS} Paw Points.`,
      data: { refereeId: String(refereeId) },
    }, { email: true });
  }
  return { qualified: true, rewarded: !reward.duplicate, points: reward.duplicate ? 0 : REFERRAL_REFERRER_POINTS };
}
