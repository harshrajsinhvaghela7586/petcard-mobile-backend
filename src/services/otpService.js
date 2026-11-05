import {
  makeOtp,
  hashOtp,
  matchesOtp,
  otpExpiryDate,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
} from "../utils/mobileOtp.js";

/*
 * Generic OTP issue/consume logic shared by mobile users and admins.
 *
 * `fields[purpose]` maps logical names to the model's column names:
 *   { hash, exp, attempts, sentAt }
 *
 * Both operations are atomic (single findOneAndUpdate / updateOne guarded by
 * the stored hash), so parallel requests cannot bypass attempt limits,
 * cooldowns, or reuse a code twice.
 */

const context = (scope, purpose, email) => `${scope}:${purpose}:${email}`;

const clearOtpFields = (f) => ({
  [f.hash]: 1,
  [f.exp]: 1,
  [f.attempts]: 1,
  [f.sentAt]: 1,
});

/**
 * @returns {Promise<
 *   | { status: "not_found" }
 *   | { status: "cooldown", retryAfterSeconds: number }
 *   | { status: "sent", otp: string, id: any }
 * >}
 */
export async function issueOtp({ Model, fields, scope, purpose, email, filter = {}, set = {} }) {
  const f = fields[purpose];

  const current = await Model.findOne({ email, ...filter })
    .select(`+${f.sentAt}`)
    .lean();
  if (!current) return { status: "not_found" };

  const now = Date.now();
  const lastSent = current[f.sentAt] ? new Date(current[f.sentAt]).getTime() : 0;
  const waitMs = lastSent + OTP_RESEND_COOLDOWN_SECONDS * 1000 - now;
  if (waitMs > 0) {
    return { status: "cooldown", retryAfterSeconds: Math.ceil(waitMs / 1000) };
  }

  const otp = makeOtp();
  const cutoff = new Date(now - OTP_RESEND_COOLDOWN_SECONDS * 1000);

  const updated = await Model.findOneAndUpdate(
    {
      _id: current._id,
      ...filter,
      $or: [{ [f.sentAt]: { $exists: false } }, { [f.sentAt]: { $lte: cutoff } }],
    },
    {
      $set: {
        ...set,
        [f.hash]: hashOtp(otp, context(scope, purpose, email)),
        [f.exp]: otpExpiryDate(),
        [f.attempts]: 0,
        [f.sentAt]: new Date(now),
      },
    },
    { new: true }
  )
    .select("_id")
    .lean();

  if (!updated) {
    // Another request won the race inside the cooldown window.
    return { status: "cooldown", retryAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS };
  }

  return { status: "sent", otp, id: updated._id };
}

/**
 * Verifies a code and, on success, consumes it in the same atomic step.
 * `set` / `buildSet(doc)` / `inc` are extra updates applied only on success.
 *
 * @returns {Promise<
 *   | { status: "ok", doc: any }
 *   | { status: "invalid" }
 *   | { status: "locked" }
 * >}
 */
export async function consumeOtp({
  Model,
  fields,
  scope,
  purpose,
  email,
  otp,
  filter = {},
  set = {},
  buildSet,
  inc,
}) {
  const f = fields[purpose];

  // Count the attempt BEFORE checking the code: parallel guesses cannot exceed the limit.
  const doc = await Model.findOneAndUpdate(
    {
      email,
      ...filter,
      [f.hash]: { $exists: true },
      [f.attempts]: { $not: { $gte: OTP_MAX_ATTEMPTS } },
    },
    { $inc: { [f.attempts]: 1 } },
    { new: true }
  )
    .select(`+${f.hash} +${f.exp} +${f.attempts}`)
    .lean();

  if (!doc) return { status: "invalid" };

  const attempts = doc[f.attempts] || 0;
  const expired = !doc[f.exp] || new Date(doc[f.exp]).getTime() < Date.now();
  const matches = !expired && matchesOtp(otp, doc[f.hash], context(scope, purpose, email));

  if (!matches) {
    if (expired || attempts >= OTP_MAX_ATTEMPTS) {
      // Burn the code: the user must request a new one.
      await Model.updateOne(
        { _id: doc._id, [f.hash]: doc[f.hash] },
        { $unset: clearOtpFields(f) }
      );
      return { status: expired ? "invalid" : "locked" };
    }
    return { status: "invalid" };
  }

  const dynamic = buildSet ? await buildSet(doc) : {};
  const update = { $unset: clearOtpFields(f) };
  const toSet = { ...set, ...dynamic };
  if (Object.keys(toSet).length > 0) update.$set = toSet;
  if (inc && Object.keys(inc).length > 0) update.$inc = inc;

  // Single-use: only the request that still sees the same hash wins.
  const result = await Model.updateOne({ _id: doc._id, [f.hash]: doc[f.hash] }, update);
  if (result.modifiedCount !== 1) return { status: "invalid" };

  return { status: "ok", doc };
}
