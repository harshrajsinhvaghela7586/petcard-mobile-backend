import "dotenv/config";
import mongoose from "mongoose";
import Pet from "../src/models/Pet.js";
import RewardLedger from "../src/models/RewardLedger.js";
import StickerOwnership from "../src/models/StickerOwnership.js";

if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is not set.");
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
await StickerOwnership.syncIndexes();

let migrated = 0;
let selectedDefaults = 0;
const cursor = Pet.find({ stickerKeys: { $exists: true, $ne: [] } })
  .select("_id owner stickerKeys activeStickerKey")
  .cursor();

for await (const pet of cursor) {
  for (const stickerKey of pet.stickerKeys || []) {
    const ledger = await RewardLedger.findOne({
      user: pet.owner,
      kind: "sticker_purchase",
      key: `sticker:${pet._id}:${stickerKey}`,
    }).select("points").lean();
    const result = await StickerOwnership.updateOne(
      { user: pet.owner, stickerKey },
      { $setOnInsert: { user: pet.owner, stickerKey, pricePaid: ledger ? Math.abs(ledger.points) : 0 } },
      { upsert: true }
    );
    if (result.upsertedCount) migrated += 1;
  }
  if (!pet.activeStickerKey && pet.stickerKeys?.[0]) {
    await Pet.updateOne({ _id: pet._id, activeStickerKey: null }, { $set: { activeStickerKey: pet.stickerKeys[0] } });
    selectedDefaults += 1;
  }
}

console.log(`Sticker ownership migration complete. New ownership rows: ${migrated}; default active stickers assigned: ${selectedDefaults}.`);
await mongoose.disconnect();
