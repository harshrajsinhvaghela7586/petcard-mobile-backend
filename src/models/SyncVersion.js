import mongoose from "mongoose";

/*
 * One tiny counter per "scope" (a user's account data, a pet, a user's notifications).
 * Every successful write bumps the matching counters, so the app can ask
 * "did anything change?" with one ~200 byte request instead of re-downloading every page.
 *   u:<userId>   account data (profile, wallet, stickers, referral, ...)
 *   n:<userId>   notifications
 *   p:<petId>    everything that belongs to a pet (details, tasks, health, memories, trackers, ...)
 */
const syncVersionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    v: { type: Number, default: 1 },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, strictQuery: true }
);

const SyncVersion = mongoose.models.SyncVersion || mongoose.model("SyncVersion", syncVersionSchema);
export default SyncVersion;
