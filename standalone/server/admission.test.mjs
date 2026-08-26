import assert from "node:assert/strict";
import test from "node:test";
import { TokenBucketLimiter, createAdmissionController, requestAddress } from "./admission.mjs";

test("token buckets refill deterministically and cap key cardinality", () => {
  const limiter = new TokenBucketLimiter({ capacity: 2, refillPerSecond: 1, maximumKeys: 2 });
  assert.equal(limiter.consume("a", 1000).ok, true);
  assert.equal(limiter.consume("a", 1000).ok, true);
  assert.equal(limiter.consume("a", 1000).ok, false);
  assert.equal(limiter.consume("a", 2000).ok, true);
  limiter.consume("b", 2000);
  limiter.consume("c", 2000);
  assert(limiter.buckets.size <= 2);
});

test("event admission releases capacity exactly once", () => {
  const admission = createAdmissionController();
  const releaseFirst = admission.acquireEventStream("127.0.0.1", "GOOK");
  const releaseSecond = admission.acquireEventStream("127.0.0.1", "GOOK");
  assert.equal(admission.currentEventStreams(), 2);
  releaseFirst();
  releaseFirst();
  releaseSecond();
  assert.equal(admission.currentEventStreams(), 0);
});

test("forwarded addresses are trusted only when explicitly configured", () => {
  const req = { headers: { "x-forwarded-for": "203.0.113.4, 10.0.0.1" }, socket: { remoteAddress: "127.0.0.1" } };
  assert.equal(requestAddress(req), "127.0.0.1");
  assert.equal(requestAddress(req, { trustProxy: true }), "203.0.113.4");
});
