import SyncVersion from "../models/SyncVersion.js";
import PetMember from "../models/PetMember.js";
import CatalogItem from "../models/CatalogItem.js";
import KnowGuide from "../models/KnowGuide.js";
import KnowMenu from "../models/KnowMenu.js";
import { log, serializeError } from "../utils/logger.js";

/** Bump version counters. Never throws: a failed bump must not fail the user's request. */
export async function bumpVersions(keys) {
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) return;
  try {
    await SyncVersion.bulkWrite(
      unique.map((key) => ({
        updateOne: { filter: { key }, update: { $inc: { v: 1 }, $set: { updatedAt: new Date() } }, upsert: true },
      })),
      { ordered: false }
    );
  } catch (error) {
    log.warn("sync.bump_failed", { keys: unique, error: serializeError(error) });
  }
}

/* Catalog / know-guide / know-menu content is edited by admins, so its version comes from the data itself.
 * It is cached for a short time so the sync call stays cheap even when many users call it. */
const CONTENT_TTL_MS = 30_000;
let contentCache = { value: "0", at: 0 };
let contentInflight = null;

const newest = (Model) => Model.findOne().sort({ updatedAt: -1 }).select("updatedAt").lean();

async function computeContentVersion() {
  const [a, b, c, na, nb, nc] = await Promise.all([
    newest(CatalogItem), newest(KnowGuide), newest(KnowMenu),
    CatalogItem.estimatedDocumentCount(), KnowGuide.estimatedDocumentCount(), KnowMenu.estimatedDocumentCount(),
  ]);
  const t = (d) => (d?.updatedAt ? new Date(d.updatedAt).getTime() : 0);
  const release = process.env.RENDER_GIT_COMMIT || process.env.APP_RELEASE || "dev";
  return `${t(a)}.${t(b)}.${t(c)}.${na}.${nb}.${nc}.${String(release).slice(0, 7)}`;
}

export async function contentVersion() {
  if (Date.now() - contentCache.at < CONTENT_TTL_MS) return contentCache.value;
  if (!contentInflight) {
    contentInflight = computeContentVersion()
      .then((value) => { contentCache = { value, at: Date.now() }; return value; })
      .catch(() => contentCache.value)
      .finally(() => { contentInflight = null; });
  }
  return contentInflight;
}

/** Everything the app needs to decide which cached screens are still valid. */
export async function versionsForUser(userId) {
  const members = await PetMember.find({ user: userId }).select("pet").lean();
  const petIds = members.map((m) => String(m.pet));
  const keys = [`u:${userId}`, `n:${userId}`, ...petIds.map((id) => `p:${id}`), ...petIds.map((id) => `pf:${id}`)];
  const [rows, content] = await Promise.all([
    SyncVersion.find({ key: { $in: keys } }).select("key v").lean(),
    contentVersion(),
  ]);
  const byKey = new Map(rows.map((r) => [r.key, r.v]));
  const pets = {};
  const profiles = {};
  for (const id of petIds) { pets[id] = byKey.get(`p:${id}`) ?? 0; profiles[id] = byKey.get(`pf:${id}`) ?? 0; }
  return { user: byKey.get(`u:${userId}`) ?? 0, notifications: byKey.get(`n:${userId}`) ?? 0, pets, profiles, content };
}
