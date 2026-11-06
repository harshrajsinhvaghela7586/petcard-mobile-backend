import test from "node:test";
import assert from "node:assert/strict";
process.env.JWT_SECRET ??= "x".repeat(40);
process.env.MONGODB_URI ??= "mongodb://localhost/test";
process.env.NODE_ENV = "test";
const { statusFilter } = await import("../src/controller/admin/healthController.js");
const { levelTable } = await import("../src/services/adminProgress.js");

test("health status filters are relative to today", () => {
  assert.deepEqual(statusFilter("overdue", "2026-11-01"), { completedAt: null, nextDueDate: { $lt: "2026-11-01", $ne: null } });
  assert.deepEqual(statusFilter("today", "2026-11-01"), { completedAt: null, nextDueDate: "2026-11-01" });
  assert.deepEqual(statusFilter("soon", "2026-11-01"), { completedAt: null, nextDueDate: { $gt: "2026-11-01", $lte: "2026-11-08" } });
  assert.deepEqual(statusFilter("upcoming", "2026-11-01").nextDueDate, { $gt: "2026-11-08" });
  assert.equal(statusFilter("nonsense", "2026-11-01"), null);
});

test("level table covers every level once, in order", () => {
  const table = levelTable();
  assert.equal(table.length, 10);
  assert.deepEqual(table.map((r) => r.level), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(table[0].xpRequired, 0);
  assert.equal(table[9].nextLevelXp, null);
  assert.ok(table.every((r, i) => i === 0 || r.xpRequired > table[i - 1].xpRequired));
});
