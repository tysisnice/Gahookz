import { HttpError } from "./transport.mjs";

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function requestAddress(req, { trustProxy = false } = {}) {
  if (trustProxy) {
    const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",", 1)[0].trim();
    if (forwarded) return forwarded.slice(0, 96);
  }
  return String(req.socket?.remoteAddress || "unknown").slice(0, 96);
}

export class TokenBucketLimiter {
  constructor({ capacity, refillPerSecond, maximumKeys = 10_000 }) {
    this.capacity = positiveNumber(capacity, 1);
    this.refillPerMs = positiveNumber(refillPerSecond, 1) / 1000;
    this.maximumKeys = Math.max(1, Math.trunc(positiveNumber(maximumKeys, 10_000)));
    this.buckets = new Map();
  }

  consume(key, now = Date.now()) {
    const safeKey = String(key || "unknown");
    let bucket = this.buckets.get(safeKey);
    if (!bucket) {
      this.prune(now);
      bucket = { tokens: this.capacity, updatedAt: now, lastSeenAt: now };
      this.buckets.set(safeKey, bucket);
    }
    const elapsed = Math.max(0, now - bucket.updatedAt);
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerMs);
    bucket.updatedAt = now;
    bucket.lastSeenAt = now;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { ok: true, retryAfterMs: 0 };
    }
    return { ok: false, retryAfterMs: Math.max(1, Math.ceil((1 - bucket.tokens) / this.refillPerMs)) };
  }

  prune(now = Date.now()) {
    const staleBefore = now - Math.max(60_000, Math.ceil(this.capacity / this.refillPerMs));
    for (const [key, bucket] of this.buckets) {
      if (bucket.lastSeenAt < staleBefore) this.buckets.delete(key);
    }
    while (this.buckets.size >= this.maximumKeys) {
      const oldestKey = this.buckets.keys().next().value;
      if (!oldestKey) break;
      this.buckets.delete(oldestKey);
    }
  }
}

function rejectRateLimit(result, scope) {
  if (result.ok) return;
  const error = new HttpError(429, "rate_limited", "Too many requests. Try again shortly.");
  error.retryAfterMs = result.retryAfterMs;
  error.scope = scope;
  throw error;
}

export function createAdmissionController({ relaxed = false } = {}) {
  const scale = relaxed ? 10 : 1;
  const globalMutations = new TokenBucketLimiter({ capacity: 600 * scale, refillPerSecond: 80 * scale, maximumKeys: 20_000 });
  const actorMutations = new TokenBucketLimiter({ capacity: 120 * scale, refillPerSecond: 20 * scale, maximumKeys: 50_000 });
  const roomCreations = new TokenBucketLimiter({ capacity: 12 * scale, refillPerSecond: 0.2 * scale, maximumKeys: 20_000 });
  const eventTickets = new TokenBucketLimiter({ capacity: 20 * scale, refillPerSecond: 1 * scale, maximumKeys: 50_000 });
  // Unauthenticated GET routes need their own bucket: /api/lobby answers whether
  // any given four-letter code is live, so without one it is a free room-code
  // enumeration oracle.
  const reads = new TokenBucketLimiter({ capacity: 120 * scale, refillPerSecond: 20 * scale, maximumKeys: 20_000 });
  const connectionsByAddress = new Map();
  const connectionsByRoom = new Map();
  let connectionTotal = 0;

  return {
    assertMutation(address, pathname, actorKey = "") {
      rejectRateLimit(globalMutations.consume(address), "address");
      const actor = actorKey ? address + ":" + String(actorKey).slice(0, 96) : address + ":anonymous";
      rejectRateLimit(actorMutations.consume(actor), "actor");
      if (pathname === "/api/room") rejectRateLimit(roomCreations.consume(address), "room_creation");
      if (pathname === "/api/events/ticket") rejectRateLimit(eventTickets.consume(actor), "event_ticket");
    },

    assertRead(address) {
      rejectRateLimit(reads.consume(address), "read");
    },

    acquireEventStream(address, roomCode) {
      const addressCount = connectionsByAddress.get(address) || 0;
      const roomCount = connectionsByRoom.get(roomCode) || 0;
      if (connectionTotal >= 1024 || addressCount >= 32 || roomCount >= 64) {
        const error = new HttpError(503, "event_capacity", "Live room connections are at capacity. Try again shortly.");
        error.retryAfterMs = 1500;
        throw error;
      }
      connectionTotal += 1;
      connectionsByAddress.set(address, addressCount + 1);
      connectionsByRoom.set(roomCode, roomCount + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        connectionTotal = Math.max(0, connectionTotal - 1);
        const nextAddressCount = Math.max(0, (connectionsByAddress.get(address) || 1) - 1);
        const nextRoomCount = Math.max(0, (connectionsByRoom.get(roomCode) || 1) - 1);
        if (nextAddressCount) connectionsByAddress.set(address, nextAddressCount); else connectionsByAddress.delete(address);
        if (nextRoomCount) connectionsByRoom.set(roomCode, nextRoomCount); else connectionsByRoom.delete(roomCode);
      };
    },

    currentEventStreams() {
      return connectionTotal;
    }
  };
}
