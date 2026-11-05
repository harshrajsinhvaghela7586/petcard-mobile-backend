import HealthRecord from "../models/HealthRecord.js";
import Pet from "../models/Pet.js";
import PetMember from "../models/PetMember.js";
import Notification from "../models/Notification.js";
import { addDays, todayKey } from "../utils/schema.js";
import { dueInfo } from "../services/healthService.js";
import { notify } from "../services/notificationService.js";
import { log, serializeError } from "../utils/logger.js";

/*
 * Server-side "vaccination / medicine due" notifications. For every pending
 * health record this sends, once per stage: `soon` (reminderDaysBefore days
 * ahead, default 1 = the day before), `today`, and `overdue` (the day after).
 * A notification that already exists for (user, record, stage) is never sent
 * again, so running the job often, or on several instances, is safe.
 *
 * Due day of a record:
 *  - its nextDueDate, when it has one;
 *  - otherwise its own date, when the record was added IN ADVANCE (created before that day),
 *    e.g. "vaccination on 20 Nov" added on 5 Nov. These never get an "overdue" notice.
 *    A record logged on the day itself is history, not a reminder.
 */

const STAGES = {
  soon: (r, due) => due.daysLeft > 0 && due.daysLeft === (r.reminderDaysBefore ?? 1),
  today: (_r, due) => due.daysLeft === 0,
  overdue: (_r, due) => due.daysLeft === -1,
};

/* Records that describe a fact, not an appointment: never remind by date alone. */
const NOT_SCHEDULABLE = new Set(["weight", "allergy", "condition"]);

const canSeeHealth = (m) => m.role === "owner" || (m.permissions || []).includes("view_health");

function dueOf(record) {
  if (record.nextDueDate) return { date: record.nextDueDate, plannedByDate: false };
  if (NOT_SCHEDULABLE.has(record.type)) return null;
  const createdDay = record.createdAt ? new Date(record.createdAt).toISOString().slice(0, 10) : null;
  if (!createdDay || createdDay >= record.date) return null;
  return { date: record.date, plannedByDate: true };
}

export async function runHealthDueSweep({ today = todayKey(), limit = 500 } = {}) {
  const rows = await HealthRecord.find({
    completedAt: null,
    $or: [
      { nextDueDate: { $gte: addDays(today, -1), $lte: addDays(today, 90) } },
      { nextDueDate: null, date: { $gte: today, $lte: addDays(today, 90) } },
    ],
  })
    .select("pet type title date nextDueDate reminderDaysBefore createdAt")
    .limit(limit)
    .lean();

  const due = rows
    .map((r) => {
      const when = dueOf(r);
      if (!when) return null;
      const info = dueInfo(when.date, today);
      const stage = info ? Object.keys(STAGES).find((s) => STAGES[s](r, info)) : null;
      if (!stage || (when.plannedByDate && stage === "overdue")) return null;
      return { record: r, stage, info, dueDate: when.date };
    })
    .filter(Boolean);
  if (!due.length) return { checked: rows.length, sent: 0 };

  const petIds = [...new Set(due.map((d) => String(d.record.pet)))];
  const [pets, members, already] = await Promise.all([
    Pet.find({ _id: { $in: petIds } }).select("name").lean(),
    PetMember.find({ pet: { $in: petIds } }).select("pet user role permissions").lean(),
    Notification.find({
      type: { $in: ["health_due", "health_overdue"] },
      "data.recordId": { $in: due.map((d) => String(d.record._id)) },
    })
      .select("user data")
      .lean(),
  ]);
  const petName = new Map(pets.map((p) => [String(p._id), p.name]));
  const byPet = new Map();
  for (const m of members) if (canSeeHealth(m)) byPet.set(String(m.pet), [...(byPet.get(String(m.pet)) ?? []), String(m.user)]);
  const seen = new Set(already.map((n) => `${n.user}:${n.data?.get?.("recordId") ?? n.data?.recordId}:${n.data?.get?.("stage") ?? n.data?.stage}`));

  let sent = 0;
  for (const { record, stage, info, dueDate } of due) {
    const name = petName.get(String(record.pet)) ?? "Your pet";
    for (const userId of byPet.get(String(record.pet)) ?? []) {
      const key = `${userId}:${record._id}:${stage}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await notify(userId, {
        type: stage === "overdue" ? "health_overdue" : "health_due",
        title: stage === "overdue" ? `${record.title} is overdue` : `${record.title}: ${info.label.toLowerCase()}`,
        body: `${name}'s ${record.title.toLowerCase()} ${stage === "overdue" ? "was due yesterday." : stage === "today" ? "is due today." : `is due on ${dueDate}.`}`,
        data: { petId: String(record.pet), recordId: String(record._id), stage, dueDate },
      });
      sent += 1;
    }
  }
  return { checked: rows.length, due: due.length, sent };
}

/** Starts the hourly sweep. Returns a stop function. */
export function startJobs() {
  const run = () =>
    runHealthDueSweep()
      .then((r) => r.sent && log.info("job.health_due", r))
      .catch((error) => log.warn("job.health_due_failed", { error: serializeError(error) }));
  const first = setTimeout(run, 30_000);
  const timer = setInterval(run, 60 * 60 * 1000);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}