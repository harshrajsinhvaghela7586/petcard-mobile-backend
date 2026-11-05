import mongoose from "mongoose";
import CatalogItem from "../models/CatalogItem.js";
import StickerOwnership from "../models/StickerOwnership.js";
import RewardLedger from "../models/RewardLedger.js";
import RewardWallet from "../models/RewardWallet.js";
import { getBalance } from "./rewardService.js";
import { ApiError, notFoundError } from "../utils/http.js";

export async function purchaseStickerForUser(userId, key) {
  const item = await CatalogItem.findOne({ kind: "sticker", key, active: true }).select("price").lean();
  if (!item) throw notFoundError("Sticker not found.");
  const cost = Math.max(0, Number(item.price || 0));
  const ledgerKey = `sticker:${userId}:${key}`;
  const session = await mongoose.startSession();
  let alreadyOwned = false;
  let purchased = false;

  try {
    await session.withTransaction(async () => {
      alreadyOwned = false;
      purchased = false;
      const existing = await StickerOwnership.findOne({ user: userId, stickerKey: key }).session(session).lean();
      if (existing) {
        alreadyOwned = true;
        return;
      }

      await RewardLedger.create([{
        user: userId,
        pet: null,
        kind: "sticker_purchase",
        points: -cost,
        xp: 0,
        key: ledgerKey,
      }], { session });

      if (cost > 0) {
        const wallet = await RewardWallet.findOneAndUpdate(
          { user: userId, pawPoints: { $gte: cost } },
          { $inc: { pawPoints: -cost } },
          { new: true, session }
        );
        if (!wallet) {
          const balance = await RewardWallet.findOne({ user: userId }).session(session).select("pawPoints").lean();
          throw new ApiError(402, "Not enough Paw Points.", {
            code: "INSUFFICIENT_POINTS",
            extra: { required: cost, balance: balance?.pawPoints ?? 0 },
          });
        }
      }

      await StickerOwnership.create([{
        user: userId,
        stickerKey: key,
        pricePaid: cost,
      }], { session });
      purchased = true;
    });
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await StickerOwnership.findOne({ user: userId, stickerKey: key }).lean();
      if (existing) alreadyOwned = true;
      else throw new ApiError(409, "This sticker purchase is already being processed. Please refresh your stickers.", { code: "PURCHASE_IN_PROGRESS" });
    } else {
      throw error;
    }
  } finally {
    await session.endSession();
  }

  return {
    purchased,
    alreadyOwned,
    charged: purchased ? cost : 0,
    ownership: { key, pricePaid: cost },
    wallet: await getBalance(userId),
  };
}
