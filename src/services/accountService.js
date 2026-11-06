import DeviceToken from "../models/DeviceToken.js";
import GuardianInvite from "../models/GuardianInvite.js";
import GuardianRequest from "../models/GuardianRequest.js";
import Memory from "../models/Memory.js";
import MobileUser from "../models/MobileUser.js";
import Notification from "../models/Notification.js";
import PetMember from "../models/PetMember.js";
import Referral from "../models/Referral.js";
import RefreshToken from "../models/RefreshToken.js";
import RewardLedger from "../models/RewardLedger.js";
import RewardWallet from "../models/RewardWallet.js";
import StickerOwnership from "../models/StickerOwnership.js";
import TaskCompletion from "../models/TaskCompletion.js";
import TrackerEntry from "../models/TrackerEntry.js";
import AchievementUnlock from "../models/AchievementUnlock.js";
import { deletePetCascade } from "./petService.js";
import { destroyAssets } from "./cloudinary.js";

/**
 * Permanently deletes a user and what they own. Pets they OWN are deleted with
 * all their data (co-guardians lose access); on pets they only help with, their
 * own memories and membership are removed.
 */
export async function deleteAccount(userId) {
  const owned = await PetMember.find({ user: userId, role: "owner" }).select("pet").lean();
  for (const { pet } of owned) await deletePetCascade(pet);

  const memories = await Memory.find({ author: userId }).select("photo.publicId").lean();
  const me = await MobileUser.findById(userId).select("photo.publicId").lean();
  destroyAssets([...memories.map((m) => m.photo?.publicId), me?.photo?.publicId]);

  await Promise.all([
    Memory.deleteMany({ author: userId }),
    PetMember.deleteMany({ user: userId }),
    TaskCompletion.deleteMany({ user: userId }),
    TrackerEntry.deleteMany({ user: userId }),
    AchievementUnlock.deleteMany({ user: userId }),
    GuardianRequest.deleteMany({ requester: userId }),
    GuardianInvite.deleteMany({ createdBy: userId }),
    DeviceToken.deleteMany({ user: userId }),
    Notification.deleteMany({ user: userId }),
    RefreshToken.deleteMany({ user: userId }),
    RewardLedger.deleteMany({ user: userId }),
    RewardWallet.deleteMany({ user: userId }),
    StickerOwnership.deleteMany({ user: userId }),
    Referral.deleteMany({ $or: [{ referrer: userId }, { referee: userId }] }),
  ]);

  await MobileUser.deleteOne({ _id: userId });
}