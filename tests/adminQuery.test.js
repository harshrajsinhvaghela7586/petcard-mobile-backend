import test from "node:test";
import assert from "node:assert/strict";
const q = await import("../src/utils/adminQuery.js");
const { createTtlCache } = await import("../src/utils/ttlCache.js");
const req = (query) => ({ query });

test("pagination is clamped and reports next/prev", () => {
  assert.deepEqual(q.pageArgs(req({ page: "0", limit: "9999" })), { page: 1, limit: 100, skip: 0 });
  assert.deepEqual(q.pageArgs(req({ page: "3", limit: "20" })), { page: 3, limit: 20, skip: 40 });
  assert.deepEqual(q.paginationOf(2, 10, 25), { page: 2, limit: 10, total: 25, pages: 3, hasPrev: true, hasNext: true });
  assert.equal(q.paginationOf(1, 10, 0).pages, 1);
});

test("search escapes regex characters and anchors emails", () => {
  const f = q.searchFilter("a.b(", ["name"]);
  assert.ok(f.$or[0].name.test("xxA.B(yy"));
  assert.ok(!f.$or[0].name.test("aXb("));
  const e = q.searchFilter("Bob@x.com", ["name"], { emailField: "email" });
  assert.ok(e.email.test("bob@x.com.au") && !e.email.test("zbob@x.com"));
  assert.equal(q.searchFilter("", ["name"]), null);
});

test("enum, bool, int, id filters reject bad input", () => {
  assert.equal(q.enumOf("a", ["a", "b"]), "a");
  assert.equal(q.enumOf(undefined, ["a"]), undefined);
  assert.throws(() => q.enumOf("z", ["a"]), /Invalid/);
  assert.equal(q.boolOf("true"), true);
  assert.equal(q.boolOf("0"), false);
  assert.throws(() => q.boolOf("maybe"));
  assert.equal(q.intOf("5", { min: 1, max: 10 }), 5);
  assert.throws(() => q.intOf("50", { min: 1, max: 10 }));
  assert.equal(q.idFilter(undefined), undefined);
  assert.throws(() => q.idFilter("nope"));
  assert.equal(q.idFilter("a".repeat(24)), "a".repeat(24));
});

test("date ranges: `to` is inclusive and order is checked", () => {
  const r = q.dateRangeOf(req({ from: "2026-01-01", to: "2026-01-02" }));
  assert.equal(r.$gte.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(r.$lt.toISOString(), "2026-01-03T00:00:00.000Z");
  assert.deepEqual(q.dateKeyRangeOf(req({ from: "2026-01-01" })), { $gte: "2026-01-01" });
  assert.throws(() => q.dateRangeOf(req({ from: "2026-02-01", to: "2026-01-01" })));
  assert.throws(() => q.dateRangeOf(req({ from: "2026-13-40" })));
  assert.equal(q.dateRangeOf(req({})), undefined);
});

test("sort is whitelisted and always has a stable tiebreaker", () => {
  const s = q.sortOf(req({ sort: "name", order: "asc" }), ["name", "createdAt"]);
  assert.deepEqual(s.spec, { name: 1, _id: 1 });
  assert.deepEqual(q.sortOf(req({}), ["createdAt"]).spec, { createdAt: -1, _id: -1 });
  assert.throws(() => q.sortOf(req({ sort: "passwordHash" }), ["name"]));
});

test("allOf/compact drop empty filters", () => {
  assert.deepEqual(q.allOf(null, {}, undefined), {});
  assert.deepEqual(q.allOf({ a: 1 }, null), { a: 1 });
  assert.deepEqual(q.allOf({ a: 1 }, { b: 2 }), { $and: [{ a: 1 }, { b: 2 }] });
  assert.deepEqual(q.compact({ a: 1, b: undefined, c: null }), { a: 1, c: null });
});

test("ttl cache returns cached values, expires, and shares in-flight work", async () => {
  const cache = createTtlCache({ ttlMs: 30 });
  let calls = 0;
  const compute = async () => { calls += 1; await new Promise((r) => setTimeout(r, 5)); return calls; };
  const [a, b] = await Promise.all([cache.wrap("k", compute), cache.wrap("k", compute)]);
  assert.equal(a, 1); assert.equal(b, 1); assert.equal(calls, 1);
  assert.equal(await cache.wrap("k", compute), 1);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(await cache.wrap("k", compute), 2);
});
