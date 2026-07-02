import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";

import handler from "../api/webhook.cjs";

const SECRET = "test-secret";

function mockReq(body, { headers = {}, ip = "1.2.3.4" } = {}) {
  const req = new EventEmitter();
  req.method = "POST";
  req.headers = { "x-forwarded-for": ip, ...headers };
  req.socket = { remoteAddress: ip };
  req.destroy = () => req.emit("error", new Error("destroyed"));
  queueMicrotask(() => {
    req.emit("data", Buffer.from(body));
    req.emit("end");
  });
  return req;
}

function mockRes() {
  const res = { headers: {} };
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.setHeader = (k, v) => {
    res.headers[k] = v;
  };
  res.json = (obj) => {
    res.body = obj;
    return res;
  };
  res.end = () => res;
  return res;
}

function sign(body, secret = SECRET) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

beforeEach(() => {
  process.env.LS_WEBHOOK_SECRET = SECRET;
  delete process.env.LS_API_KEY;
  handler._internal.rateLimitState.clear();
  handler._internal.seenPayloads.clear();
});

test("fails closed when LS_WEBHOOK_SECRET is unset", async () => {
  delete process.env.LS_WEBHOOK_SECRET;
  const body = JSON.stringify({ meta: { event_name: "ping" } });
  const res = mockRes();
  await handler(mockReq(body, { headers: { "x-signature": sign(body) } }), res);
  assert.equal(res.statusCode, 500);
});

test("rejects missing signature header", async () => {
  const body = JSON.stringify({ meta: { event_name: "ping" }, data: { id: "1", attributes: {} } });
  const res = mockRes();
  await handler(mockReq(body), res);
  assert.equal(res.statusCode, 401);
});

test("rejects invalid signature", async () => {
  const body = JSON.stringify({ meta: { event_name: "ping" } });
  const res = mockRes();
  await handler(mockReq(body, { headers: { "x-signature": "0".repeat(64) } }), res);
  assert.equal(res.statusCode, 401);
});

test("accepts a validly signed, unrecognized event", async () => {
  const body = JSON.stringify({ meta: { event_name: "ping" }, data: { id: "1", attributes: {} } });
  const res = mockRes();
  await handler(mockReq(body, { headers: { "x-signature": sign(body) } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
});

test("rejects malformed JSON despite a valid signature", async () => {
  const body = "not-json{{{";
  const res = mockRes();
  await handler(mockReq(body, { headers: { "x-signature": sign(body) } }), res);
  assert.equal(res.statusCode, 400);
});

test("rejects oversized payloads without crashing", async () => {
  const body = "x".repeat(1_100_000);
  const res = mockRes();
  await handler(mockReq(body, { headers: { "x-signature": sign(body) } }), res);
  assert.equal(res.statusCode, 413);
});

test("deduplicates a replayed valid payload", async () => {
  const body = JSON.stringify({ meta: { event_name: "ping" }, data: { id: "1", attributes: {} } });
  const headers = { "x-signature": sign(body) };

  const res1 = mockRes();
  await handler(mockReq(body, { headers }), res1);
  assert.equal(res1.statusCode, 200);
  assert.equal(res1.body.duplicate, undefined);

  const res2 = mockRes();
  await handler(mockReq(body, { headers }), res2);
  assert.equal(res2.statusCode, 200);
  assert.equal(res2.body.duplicate, true);
});

test("rate limits a flood of requests from the same IP", async () => {
  const ip = "9.9.9.9";
  let lastStatus;
  for (let i = 0; i < 35; i++) {
    const body = JSON.stringify({ meta: { event_name: "ping" }, data: { id: String(i), attributes: {} } });
    const res = mockRes();
    await handler(mockReq(body, { headers: { "x-signature": sign(body) }, ip }), res);
    lastStatus = res.statusCode;
  }
  assert.equal(lastStatus, 429);
});
