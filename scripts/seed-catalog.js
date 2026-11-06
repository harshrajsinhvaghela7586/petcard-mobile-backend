/*
 * Loads the avatar / sticker catalogue into MongoDB.
 *
 *   1. copy data/catalog.sample.json to data/catalog.json
 *   2. replace the sample keys with the keys your app sends
 *   3. npm run seed:catalog            (adds / updates)
 *      npm run seed:catalog -- --prune (also deactivates items not in the file)
 *
 * Once a kind (avatar / sticker) has any active item, the API only accepts keys
 * from the catalogue for that kind.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import CatalogItem from "../src/models/CatalogItem.js";

const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,59}$/;
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "catalog.json");
const prune = process.argv.includes("--prune");

if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is not set.");
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error("data/catalog.json not found. Copy data/catalog.sample.json and edit it.");
  process.exit(1);
}

const input = JSON.parse(fs.readFileSync(file, "utf8"));
const rows = [];
for (const [list, kind] of [["avatars", "avatar"], ["stickers", "sticker"]]) {
  (input[list] || []).forEach((item, index) => {
    if (!KEY_RE.test(item.key || "")) throw new Error(`Invalid key in ${list}[${index}]: ${item.key}`);
    rows.push({
      kind,
      key: item.key,
      petType: item.petType || "all",
      label: item.label || "",
      sortOrder: Number.isInteger(item.order) ? item.order : index,
      price: Math.max(0, Number(item.price || 0)),
      active: true,
    });
  });
}
if (!rows.length) throw new Error("The catalogue file has no items.");

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });

await CatalogItem.bulkWrite(
  rows.map((row) => ({
    updateOne: { filter: { kind: row.kind, key: row.key }, update: { $set: row }, upsert: true },
  }))
);

if (prune) {
  for (const kind of ["avatar", "sticker"]) {
    const keep = rows.filter((r) => r.kind === kind).map((r) => r.key);
    if (keep.length) {
      const res = await CatalogItem.updateMany({ kind, key: { $nin: keep } }, { $set: { active: false } });
      console.log(`${kind}: deactivated ${res.modifiedCount} item(s) not in the file.`);
    }
  }
}

console.log(`Catalogue loaded: ${rows.filter((r) => r.kind === "avatar").length} avatars, ${rows.filter((r) => r.kind === "sticker").length} stickers.`);
await mongoose.disconnect();
