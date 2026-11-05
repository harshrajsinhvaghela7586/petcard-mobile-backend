/*
 * Writes every inner "Know" guide (9 pages x species x breeds) into MongoDB.
 * Run once:   node scripts/seedKnowGuide.js
 * Running it again only updates the text (nothing is duplicated), so you can edit
 * src/services/knowGuideContent.js and run it again.
 */
import mongoose from "mongoose";
import { config } from "../src/config/env.js";
import KnowGuide from "../src/models/KnowGuide.js";
import { allGuides, isValidSections } from "../src/services/KnowGuideContent.js";

async function main() {
  const guides = allGuides();
  const bad = guides.filter((g) => !isValidSections(g.sections));
  if (bad.length) throw new Error(`Invalid guide content: ${bad.map((g) => `${g.pageKey}/${g.species}/${g.breed || "generic"}`).join(", ")}`);

  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  const result = await KnowGuide.bulkWrite(
    guides.map((g) => ({
      updateOne: {
        filter: { pageKey: g.pageKey, species: g.species, breed: g.breed },
        update: { $set: { chip: g.chip, sections: g.sections, footer: g.footer } },
        upsert: true,
      },
    }))
  );
  console.log(`Know guides: ${guides.length} total, ${result.upsertedCount} created, ${result.modifiedCount} updated.`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});