import PetMember from "../models/PetMember.js";
import { bumpVersions } from "../services/syncService.js";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
const PET_PATH = /^\/api\/pets\/([a-f0-9]{24})(?:\/|$)/i;

/**
 * After every successful write, bump the version counters of whatever it may have changed.
 * It runs after the response is sent, so it never slows a request down.
 * Over-bumping is harmless (the app just re-downloads once); under-bumping would show stale data,
 * so any write by a user bumps that user's account scope as well.
 */
export function trackWrites(req, res, next) {
  if (SAFE.has(req.method)) return next();
  res.on("finish", () => {
    if (res.statusCode >= 400 || res.locals.noBump || !req.user?.id) return;
    const userId = req.user.id;
    const path = (req.originalUrl || "").split("?")[0];
    const keys = [`u:${userId}`];
    if (/\/notifications/.test(path)) keys.push(`n:${userId}`);
    const match = PET_PATH.exec(path);
    if (match) keys.push(`p:${match[1]}`);
    // Editing the pet itself (name, breed, type...) also changes the text of its know guides on every device.
    if (match && /^\/api\/pets\/[a-f0-9]{24}\/?$/i.test(path)) keys.push(`pf:${match[1]}`);
    void bumpVersions(keys);

    // Pet creation / deletion / guardian changes alter other people's pet lists.
    if (match && (req.method === "DELETE" || /\/guardians/.test(path))) {
      PetMember.find({ pet: match[1] }).select("user").lean()
        .then((rows) => bumpVersions(rows.map((r) => `u:${r.user}`)))
        .catch(() => undefined);
    }
  });
  next();
}
