import { daysBetween, addDays } from "../utils/schema.js";

/* Due-date maths for health records: shared by the app and the admin panel. */

export function dueInfo(nextDueDate, today) {
  if (!nextDueDate) return null;
  const daysLeft = daysBetween(today, nextDueDate);
  let status;
  let label;
  if (daysLeft < 0) {
    status = "overdue";
    const n = -daysLeft;
    label = `Overdue by ${n} day${n === 1 ? "" : "s"}`;
  } else if (daysLeft === 0) {
    status = "today";
    label = "Due today";
  } else if (daysLeft === 1) {
    status = "soon";
    label = "Due tomorrow";
  } else {
    status = daysLeft <= 7 ? "soon" : "upcoming";
    label = `Due in ${daysLeft} days`;
  }
  return { daysLeft, status, label, dueDate: nextDueDate };
}

export const TYPE_LABELS = Object.freeze({
  vaccination: "Vaccination",
  deworming: "Deworming",
  flea_tick: "Flea & tick",
  vet_visit: "Vet visit",
  checkup: "Check-up",
  medication: "Medication",
  weight: "Weight",
  allergy: "Allergy",
  condition: "Condition",
  surgery: "Surgery",
  dental: "Dental",
  lab_test: "Lab test",
  grooming: "Grooming",
  other: "Other",
});

export const serializeHealth = (r, today = null) => ({
  id: String(r._id),
  petId: String(r.pet),
  type: r.type,
  typeLabel: TYPE_LABELS[r.type] ?? r.type,
  title: r.title,
  date: r.date,
  nextDueDate: r.nextDueDate || null,
  weightKg: r.weightKg ?? null,
  vetName: r.vetName || "",
  dosage: r.dosage || "",
  repeatEveryDays: r.repeatEveryDays ?? null,
  reminderDaysBefore: r.reminderDaysBefore ?? 1,
  completedAt: r.completedAt ?? null,
  notes: r.notes || "",
  createdAt: r.createdAt,
  due: today && r.nextDueDate && !r.completedAt ? dueInfo(r.nextDueDate, today) : null,
});

/** "Repeat every N days" without an explicit due date. */
export const dueFromRepeat = (date, repeatEveryDays) => (repeatEveryDays ? addDays(date, repeatEveryDays) : null);
