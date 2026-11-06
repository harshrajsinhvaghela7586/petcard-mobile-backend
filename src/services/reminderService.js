import { addDays, dayOfWeek } from "../utils/schema.js";

/*
 * Pure helpers (no database) that turn a task's repeat rule + reminder
 * settings into concrete alarm times. The app schedules local notifications
 * from this list, so a task rings only on the days it really occurs, ahead of
 * its time by `minutesBefore`, with the sound/vibration chosen for that task.
 */
const pad = (n) => String(n).padStart(2, "0");

export function occursOn(task, date) {
  const r = task.recurrence;
  if (date < r.startDate) return false;
  if (r.endDate && date > r.endDate) return false;
  if (r.type === "once") return date === r.startDate;
  if (r.type === "daily") return true;
  const days = r.daysOfWeek?.length ? r.daysOfWeek : [dayOfWeek(r.startDate)];
  return days.includes(dayOfWeek(date));
}

/** ("2026-11-02", "09:30", -15) -> { date, time } (handles midnight rollover). */
export function shiftMinutes(date, time, minutesDelta) {
  const [h, m] = time.split(":").map(Number);
  let total = h * 60 + m + minutesDelta;
  let d = date;
  while (total < 0) { total += 1440; d = addDays(d, -1); }
  while (total >= 1440) { total -= 1440; d = addDays(d, 1); }
  return { date: d, time: `${pad(Math.floor(total / 60))}:${pad(total % 60)}` };
}

export const describeRepeat = (recurrence) => {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (recurrence.type === "once") return "Once";
  if (recurrence.type === "daily") return "Every day";
  const days = recurrence.daysOfWeek?.length ? recurrence.daysOfWeek : [dayOfWeek(recurrence.startDate)];
  if (days.length === 7) return "Every day";
  return `Every week: ${[...days].sort((a, b) => a - b).map((d) => names[d]).join(", ")}`;
};

export const describeReminder = (minutesBefore) => {
  if (!minutesBefore) return "At the task time";
  if (minutesBefore < 60) return `${minutesBefore} minutes before`;
  if (minutesBefore % 60 === 0) {
    const h = minutesBefore / 60;
    return h === 1 ? "1 hour before" : h === 24 ? "1 day before" : `${h} hours before`;
  }
  return `${Math.floor(minutesBefore / 60)} h ${minutesBefore % 60} min before`;
};

/** Defaults when a task has no explicit reminder block (older tasks). */
export const reminderOf = (task, prefs = {}) => ({
  enabled: task.reminder?.enabled ?? true,
  minutesBefore: task.reminder?.minutesBefore ?? 0,
  sound: task.reminder?.sound ?? prefs.sound ?? true,
  vibrate: task.reminder?.vibrate ?? prefs.vibrate ?? true,
});

/** Alarms between `from` and `to` (inclusive local dates). Untimed / disabled tasks produce none. */
export function buildAlarms(tasks, { from, to, prefs = {}, limit = 200 }) {
  const alarms = [];
  for (const task of tasks) {
    const reminder = reminderOf(task, prefs);
    if (!reminder.enabled || !task.timeOfDay) continue;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!occursOn(task, d)) continue;
      const fire = shiftMinutes(d, task.timeOfDay, -reminder.minutesBefore);
      alarms.push({
        taskId: String(task._id ?? task.id),
        petId: String(task.pet ?? task.petId),
        title: task.title,
        category: task.category,
        taskDate: d,
        taskTime: task.timeOfDay,
        fireDate: fire.date,
        fireTime: fire.time,
        fireAt: `${fire.date}T${fire.time}`, // local wall-clock time of the user's device
        minutesBefore: reminder.minutesBefore,
        sound: reminder.sound,
        vibrate: reminder.vibrate,
        repeat: describeRepeat(task.recurrence),
      });
    }
  }
  alarms.sort((a, b) => a.fireAt.localeCompare(b.fireAt) || a.title.localeCompare(b.title));
  return alarms.slice(0, limit);
}
