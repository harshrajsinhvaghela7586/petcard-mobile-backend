import test from "node:test";
import assert from "node:assert/strict";
import { parsePhone, phoneView } from "../src/utils/phone.js";

test("India needs exactly 10 digits starting 6-9", () => {
  const ok = parsePhone({ phone: "98765 43210", country: "IN" });
  assert.deepEqual([ok.ok, ok.e164, ok.national, ok.dialCode], [true, "+919876543210", "9876543210", "+91"]);
  assert.equal(parsePhone({ phone: "987654321", country: "IN" }).ok, false);
  assert.equal(parsePhone({ phone: "12345678901", country: "IN" }).ok, false);
  assert.equal(parsePhone({ phone: "5876543210", country: "IN" }).ok, false);
});
test("country code typed in the field is stripped / trunk zero removed", () => {
  assert.equal(parsePhone({ phone: "919876543210", country: "IN" }).national, "9876543210");
  assert.equal(parsePhone({ phone: "+91 98765-43210" }).e164, "+919876543210");
  assert.equal(parsePhone({ phone: "09876543210", country: "IN" }).national, "9876543210");
  assert.equal(parsePhone({ phone: "009198765 43210" }).country, "IN");
});
test("other countries and mismatches", () => {
  assert.equal(parsePhone({ phone: "501234567", country: "AE" }).e164, "+971501234567");
  assert.equal(parsePhone({ phone: "50123456", country: "AE" }).ok, false);
  assert.equal(parsePhone({ phone: "+971501234567", country: "IN" }).ok, false);
  assert.equal(parsePhone({ phone: "3012345678", dialCode: "+92" }).country, "PK");
  assert.equal(parsePhone({ phone: "2025550123", country: "US" }).e164, "+12025550123");
});
test("empty and garbage", () => {
  assert.deepEqual(parsePhone({ phone: "" }), { ok: true, empty: true });
  assert.deepEqual(parsePhone({}), { ok: true, empty: true });
  assert.equal(parsePhone({ phone: "abc" }).ok, false);
  assert.equal(parsePhone({ phone: { $gt: "" } }).ok, false);
});
test("legacy phone values still render", () => {
  assert.deepEqual(phoneView({ phone: "+919876543210" }), { phone: "+919876543210", phoneCountryCode: "+91", phoneNational: "9876543210" });
  assert.equal(phoneView({ phone: "" }).phoneNational, "");
});
