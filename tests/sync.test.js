import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

process.env.NODE_ENV = "test";
process.env.GEMINI_API_KEY ||= "test-key";
const { geminiGenerate } = await import("../src/services/geminiClient.js");
const { privateRevalidate } = await import("../src/middleware/security.js");

test("Gemini falls back to the next model when the first one is overloaded", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return calls.length === 1 ? { ok: false, status: 503 } : { ok: true, status: 200 };
  };
  const res = await geminiGenerate({ contents: [] }, { fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].split("models/")[1], calls[1].split("models/")[1]);
});

test("Gemini does not retry a client error (400)", async () => {
  let n = 0;
  const res = await geminiGenerate({ contents: [] }, { fetchImpl: async () => { n += 1; return { ok: false, status: 400 }; } });
  assert.equal(res.status, 400);
  assert.equal(n, 1);
});

test("GET responses carry an ETag and answer 304 when nothing changed", async () => {
  const app = express();
  app.get("/data", privateRevalidate, (_req, res) => res.json({ success: true, items: [1, 2, 3] }));
  const server = http.createServer(app).listen(0);
  const { port } = server.address();
  try {
    const first = await fetch(`http://127.0.0.1:${port}/data`);
    const etag = first.headers.get("etag");
    assert.ok(etag);
    assert.equal(first.headers.get("cache-control"), "private, no-cache");
    const second = await fetch(`http://127.0.0.1:${port}/data`, { headers: { "If-None-Match": etag } });
    assert.equal(second.status, 304);
  } finally {
    server.close();
  }
});
