/*
 * Per-account brute-force protection. Complements the IP/email rate limiters:
 * limiters are per-process memory, this counter lives in the database.
 */

export const MAX_LOGIN_FAILURES = 8;
export const LOCK_MINUTES = 15;

export const isLocked = (doc) =>
  Boolean(doc?.lockUntil) && new Date(doc.lockUntil).getTime() > Date.now();

export async function recordLoginFailure(Model, id) {
  const doc = await Model.findByIdAndUpdate(id, { $inc: { loginFailures: 1 } }, { new: true })
    .select("+loginFailures")
    .lean();

  if (doc && doc.loginFailures >= MAX_LOGIN_FAILURES) {
    await Model.updateOne(
      { _id: id },
      {
        $set: {
          loginFailures: 0,
          lockUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000),
        },
      }
    );
  }
}

export const clearLoginFailures = (Model, id) =>
  Model.updateOne({ _id: id }, { $set: { loginFailures: 0 }, $unset: { lockUntil: 1 } });
