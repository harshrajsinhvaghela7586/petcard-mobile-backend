import test from "node:test";
import assert from "node:assert/strict";
import { buildAlarms, shiftMinutes, describeRepeat, describeReminder } from "../src/services/reminderService.js";
import { dueInfo } from "../src/services/healthService.js";
import { actionFor, serializeNotification } from "../src/services/notificationActions.js";

const task = (over) => ({
  _id: "t1", pet: "p1", title: "Dinner", category: "food", timeOfDay: "19:00",
  recurrence: { type: "daily", daysOfWeek: [], startDate: "2026-11-01", endDate: null },
  reminder: { enabled: true, minutesBefore: 15, sound: true, vibrate: false }, ...over,
});

test("daily task rings every day, 15 minutes early, without vibration", () => {
  const a = buildAlarms([task()], { from: "2026-11-01", to: "2026-11-03" });
  assert.equal(a.length, 3);
  assert.deepEqual([a[0].fireAt, a[0].sound, a[0].vibrate], ["2026-11-01T18:45", true, false]);
});
test("weekly task only rings on the chosen weekdays", () => {
  const t = task({ recurrence: { type: "weekly", daysOfWeek: [1, 3], startDate: "2026-11-01", endDate: null } });
  const a = buildAlarms([t], { from: "2026-11-01", to: "2026-11-08" });
  assert.deepEqual(a.map((x) => x.taskDate), ["2026-11-02", "2026-11-04"]);
  assert.match(a[0].repeat, /Mon, Wed/);
});
test("once task rings a single time; disabled or untimed tasks never ring", () => {
  const once = task({ recurrence: { type: "once", daysOfWeek: [], startDate: "2026-11-05", endDate: null } });
  assert.equal(buildAlarms([once], { from: "2026-11-01", to: "2026-11-30" }).length, 1);
  assert.equal(buildAlarms([task({ reminder: { enabled: false } })], { from: "2026-11-01", to: "2026-11-03" }).length, 0);
  assert.equal(buildAlarms([task({ timeOfDay: null })], { from: "2026-11-01", to: "2026-11-03" }).length, 0);
});
test("early reminder crosses midnight and respects end date", () => {
  assert.deepEqual(shiftMinutes("2026-11-02", "00:10", -30), { date: "2026-11-01", time: "23:40" });
  const t = task({ timeOfDay: "00:10", reminder: { enabled: true, minutesBefore: 30 }, recurrence: { type: "daily", daysOfWeek: [], startDate: "2026-11-01", endDate: "2026-11-02" } });
  const a = buildAlarms([t], { from: "2026-11-01", to: "2026-11-05" });
  assert.deepEqual(a.map((x) => x.fireAt), ["2026-10-31T23:40", "2026-11-01T23:40"]);
  assert.equal(describeReminder(0), "At the task time");
  assert.equal(describeReminder(90), "1 h 30 min before");
  assert.equal(describeRepeat({ type: "weekly", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startDate: "2026-11-01" }), "Every day");
});
test("health due labels", () => {
  assert.equal(dueInfo("2026-11-11", "2026-11-01").label, "Due in 10 days");
  assert.equal(dueInfo("2026-11-02", "2026-11-01").label, "Due tomorrow");
  assert.equal(dueInfo("2026-11-01", "2026-11-01").status, "today");
  assert.equal(dueInfo("2026-10-30", "2026-11-01").label, "Overdue by 2 days");
  assert.equal(dueInfo(null, "2026-11-01"), null);
});
test("notification taps open the right page", () => {
  assert.equal(actionFor("achievement_unlocked", { petId: "1" }).route, "/AchievementScreen");
  assert.equal(actionFor("referral_reward", {}).route, "/RewardScreen");
  assert.equal(actionFor("admin_announcement", {}).route, null);
  assert.equal(actionFor("unknown_type", {}).route, null);
  const n = serializeNotification({ _id: "a", type: "level_up", title: "t", data: new Map([["petId", "9"]]), createdAt: new Date() });
  assert.deepEqual(n.action, { route: "/LevelScreen", params: { petId: "9" } });
  assert.equal(n.read, false);
});
