import test from "node:test";
import assert from "node:assert/strict";
import { effectiveContactStatus, nextContactRequestAt, CONTACT_ACCESS_TTL_MS, CONTACT_REQUEST_COOLDOWN_MS } from "../src/models/ContactAccessRequest.js";

const now = Date.now();
const ago = (ms) => new Date(now - ms);

test("approved access lasts 3 days then expires", () => {
  const fresh = { status: "approved", decidedAt: ago(1000), expiresAt: new Date(now + CONTACT_ACCESS_TTL_MS - 1000) };
  assert.equal(effectiveContactStatus(fresh, now), "approved");
  const old = { status: "approved", decidedAt: ago(CONTACT_ACCESS_TTL_MS + 1000), expiresAt: ago(1000) };
  assert.equal(effectiveContactStatus(old, now), "expired");
});

test("legacy approved rows without expiresAt fall back to decidedAt + 3 days", () => {
  assert.equal(effectiveContactStatus({ status: "approved", decidedAt: ago(2 * 24 * 3600 * 1000) }, now), "approved");
  assert.equal(effectiveContactStatus({ status: "approved", decidedAt: ago(4 * 24 * 3600 * 1000) }, now), "expired");
});

test("other statuses pass through, none when no request", () => {
  assert.equal(effectiveContactStatus(null, now), "none");
  assert.equal(effectiveContactStatus({ status: "pending" }, now), "pending");
  assert.equal(effectiveContactStatus({ status: "rejected" }, now), "rejected");
});

test("one request per 24 hours", () => {
  assert.ok(nextContactRequestAt({ createdAt: ago(60 * 1000) }, now));
  assert.equal(nextContactRequestAt({ createdAt: ago(CONTACT_REQUEST_COOLDOWN_MS + 1000) }, now), null);
  assert.equal(nextContactRequestAt(null, now), null);
});
