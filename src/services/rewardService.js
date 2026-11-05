import Pet from "../models/Pet.js";
import RewardWallet from "../models/RewardWallet.js";
import RewardLedger from "../models/RewardLedger.js";
import PetMember from "../models/PetMember.js";
import { ApiError } from "../utils/http.js";
import { log, serializeError } from "../utils/logger.js";
import { notifyMany } from "./notificationService.js";
import {
  levelForXp,
  LEVEL_UP_BONUS_PER_LEVEL,
  FRAME_UNLOCKS,
} from "../config/rewards.js";

/*
 * Every Paw Point / XP change goes through here.
 *
 * Idempotency: each change writes a RewardLedger row with a UNIQUE `key`
 * first. If that row already exists the change was applied before, so it is
 * skipped. Balances are then updated with atomic $inc operations; if a later
 * step fails, earlier steps are reversed so ledger and balances stay equal.
 */

const isDuplicateKey = (error) => error?.code === 11000;

async function incWallet(userId, points) {
  const update = { $inc: { pawPoints: points, lifetimePoints: Math.max(points, 0) } };
  const options = { upsert: true, new: true };
  // `pawPoints >= 0` is guaranteed by callers (spend checks the balance first).
  try {
    return await RewardWallet.findOneAndUpdate({ user: userId }, update, options);
  } catch (error) {
    if (!isDuplicateKey(error)) throw error; // concurrent first upsert: retry once
    return RewardWallet.findOneAndUpdate({ user: userId }, update, options);
  }
}

export async function getBalance(userId) {
  const wallet = await RewardWallet.findOne({ user: userId }).select("pawPoints lifetimePoints").lean();
  return { pawPoints: wallet?.pawPoints ?? 0, lifetimePoints: wallet?.lifetimePoints ?? 0 };
}

/**
 * Grants points and/or XP once per `key`.
 * @returns {{ duplicate: boolean, pawPoints?: number, pet?: object, leveledUp?: number|null }}
 */
export async function grant({ userId, petId = null, kind, points = 0, xp = 0, key, date = null }) {
  try {
    await RewardLedger.create({ user: userId, pet: petId, kind, points, xp, key, date });
  } catch (error) {
    if (isDuplicateKey(error)) return { duplicate: true };
    throw error;
  }

  let walletDone = false;
  try {
    let wallet = null;
    if (points !== 0) {
      wallet = await incWallet(userId, points);
      walletDone = true;
    }

    let pet = null;
    let leveledUp = null;
    if (xp > 0 && petId) {
      pet = await Pet.findByIdAndUpdate(petId, { $inc: { xp } }, { new: true })
        .select("name xp level")
        .lean();
      if (pet) {
        const target = levelForXp(pet.xp);
        if (target > pet.level) {
          const res = await Pet.updateOne({ _id: petId, level: { $lt: target } }, { $set: { level: target } });
          if (res.modifiedCount === 1) leveledUp = target;
        }
      }
    }

    if (leveledUp) await onLevelUp({ userId, pet, level: leveledUp });

    return { duplicate: false, pawPoints: wallet?.pawPoints, pet, leveledUp };
  } catch (error) {
    // Roll back so the ledger never claims something the balances do not reflect.
    if (walletDone) {
      await RewardWallet.updateOne(
        { user: userId },
        { $inc: { pawPoints: -points, lifetimePoints: -Math.max(points, 0) } }
      ).catch(() => {});
    }
    await RewardLedger.deleteOne({ key }).catch(() => {});
    throw error;
  }
}

async function onLevelUp({ userId, pet, level }) {
  try {
    const frameKey = FRAME_UNLOCKS[level];
    if (frameKey) await Pet.updateOne({ _id: pet._id }, { $addToSet: { unlockedFrameKeys: frameKey } });
    await grant({
      userId,
      petId: pet._id,
      kind: "level_up_bonus",
      points: LEVEL_UP_BONUS_PER_LEVEL * level,
      key: `levelup:${pet._id}:${level}`,
    });
    const members = await PetMember.find({ pet: pet._id }).select("user").lean();
    await notifyMany(
      members.map((m) => String(m.user)),
      {
        type: "level_up",
        title: `${pet.name} reached level ${level}!`,
        body: frameKey ? `${pet.name} unlocked a new avatar frame!` : `Keep it up: ${pet.name} reached a new level.`,
        data: { petId: String(pet._id), level: String(level), ...(frameKey ? { frameKey } : {}) },
      }
    );
  } catch (error) {
    log.warn("reward.level_up_followup_failed", { error: serializeError(error) });
  }
}

/**
 * Spends Paw Points once per `key` (reserve ledger row, then debit atomically).
 * Throws 402 INSUFFICIENT_POINTS or 409 ALREADY_PURCHASED. Returns a `refund()` the
 * caller must invoke if the purchase it pays for cannot be completed.
 */
export async function spend({ userId, petId = null, kind, points, key }) {
  if (points <= 0) throw new Error("spend() needs a positive amount");

  try {
    await RewardLedger.create({ user: userId, pet: petId, kind, points: -points, xp: 0, key });
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new ApiError(409, "This was already unlocked.", { code: "ALREADY_PURCHASED" });
    }
    throw error;
  }

  const wallet = await RewardWallet.findOneAndUpdate(
    { user: userId, pawPoints: { $gte: points } },
    { $inc: { pawPoints: -points } },
    { new: true }
  );

  if (!wallet) {
    await RewardLedger.deleteOne({ key }).catch(() => {});
    const { pawPoints } = await getBalance(userId);
    throw new ApiError(402, "Not enough Paw Points.", {
      code: "INSUFFICIENT_POINTS",
      extra: { required: points, balance: pawPoints },
    });
  }

  return {
    pawPoints: wallet.pawPoints,
    refund: async () => {
      await RewardWallet.updateOne({ user: userId }, { $inc: { pawPoints: points } }).catch(() => {});
      await RewardLedger.deleteOne({ key }).catch(() => {});
    },
  };
}

/** Paw Points a pet already earned from tasks on `date` (for the daily cap). */
export async function taskPointsEarned(petId, date) {
  const [row] = await RewardLedger.aggregate([
    { $match: { pet: petId, kind: "task_complete", date } },
    { $group: { _id: null, total: { $sum: "$points" } } },
  ]);
  return row?.total ?? 0;
}
