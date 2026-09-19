import assert from "node:assert/strict";
import test from "node:test";

import {
  type ApiResult,
  type EventSourceLike,
  type Json,
  type TimerLike,
  connectionMessage,
  createApiClient,
  nextClockOffset,
  describeSnapshotCompatibility,
  createLiveConnection,
  createSnapshotGate,
  redactCredentials
} from "./net.ts";

/** A timer double with an explicit clock, so ordering is deterministic. */
function fakeTimers() {
  let next = 1;
  const pending = new Map<number, { run: () => void; at: number }>();
  let now = 0;
  const timers: TimerLike = {
    setTimeout(handler, ms) {
      const id = next++;
      pending.set(id, { run: handler, at: now + ms });
      return id;
    },
    clearTimeout(handle) {
      pending.delete(handle);
    },
    setInterval(handler, ms) {
      const id = next++;
      pending.set(id, { run: handler, at: now + ms });
      return id;
    },
    clearInterval(handle) {
      pending.delete(handle);
    }
  };
  return {
    timers,
    advance(ms: number) {
      now += ms;
      for (const [id, entry] of [...pending.entries()]) {
        if (entry.at <= now) {
          pending.delete(id);
          entry.run();
        }
      }
    },
    get pendingCount() {
      return pending.size;
    }
  };
}

function fakeEventSource() {
  const created: Array<{ url: string; closed: boolean; source: EventSourceLike }> = [];
  const create = (url: string): EventSourceLike => {
    const record = { url, closed: false } as { url: string; closed: boolean; source: EventSourceLike };
    const listeners = new Map<string, (event: { data: string }) => void>();
    const source: EventSourceLike = {
      onopen: null,
      onerror: null,
      close() {
        record.closed = true;
      },
      addEventListener(type, listener) {
        listeners.set(type, listener);
      }
    };
    (source as unknown as { emit: (t: string, d: string) => void }).emit = (t, d) =>
      listeners.get(t)?.({ data: d });
    record.source = source;
    created.push(record);
    return source;
  };
  return { create, created, get openCount() { return created.filter((c) => !c.closed).length; } };
}

// ---------------------------------------------------------------------------
// Snapshot ordering. Two sources push state, so out-of-order arrival is
// routine rather than exceptional.

test("a stale snapshot never repaints the room backwards", () => {
  const clock = fakeTimers();
  const applied: number[] = [];
  const gate = createSnapshotGate({
    catchUpMs: 0,
    timers: clock.timers,
    apply: (s) => applied.push(Number(s["stateVersion"]))
  });

  gate.offer({ stateVersion: 5 });
  gate.offer({ stateVersion: 3 });
  gate.offer({ stateVersion: 4 });
  gate.offer({ stateVersion: 6 });

  assert.deepEqual(applied, [5, 6]);
  assert.equal(gate.appliedVersion, 6);
});

test("a burst is coalesced to the newest, not animated through history", () => {
  const clock = fakeTimers();
  const applied: number[] = [];
  const gate = createSnapshotGate({
    catchUpMs: 40,
    timers: clock.timers,
    apply: (s) => applied.push(Number(s["stateVersion"]))
  });

  gate.offer({ stateVersion: 2 });
  gate.offer({ stateVersion: 3 });
  gate.offer({ stateVersion: 4 });
  assert.deepEqual(applied, [], "nothing should paint before the catch-up window closes");

  clock.advance(40);
  assert.deepEqual(applied, [4]);
});

test("malformed and unversioned payloads fail safely", () => {
  const clock = fakeTimers();
  const applied: unknown[] = [];
  const gate = createSnapshotGate({ catchUpMs: 0, timers: clock.timers, apply: (s) => applied.push(s) });

  for (const bad of [null, undefined, "snapshot", 42, true]) {
    gate.offer(bad);
  }
  assert.deepEqual(applied, [], "non-objects must be ignored rather than dispatched");

  // An error or role payload carries no stateVersion and must still apply.
  gate.offer({ ok: false, error: "nope" });
  assert.equal(applied.length, 1);
});

test("a disposed gate drops pending work and stops applying", () => {
  const clock = fakeTimers();
  const applied: number[] = [];
  const gate = createSnapshotGate({
    catchUpMs: 30,
    timers: clock.timers,
    apply: (s) => applied.push(Number(s["stateVersion"]))
  });

  gate.offer({ stateVersion: 9 });
  gate.dispose();
  clock.advance(100);

  assert.deepEqual(applied, [], "a snapshot must not land on a view that has gone away");
  assert.equal(clock.pendingCount, 0, "dispose must not leak a timer");
  gate.dispose();
});

// ---------------------------------------------------------------------------
// Subscription lifetime. The symptom of getting this wrong is a room that
// slows down the longer it stays open.

function connectionHarness(ticket: ApiResult) {
  const clock = fakeTimers();
  const sources = fakeEventSource();
  const events: string[] = [];
  const connection = createLiveConnection({
    api: async () => ticket,
    createEventSource: sources.create,
    timers: clock.timers,
    reconnectMs: 1500,
    room: { code: "ABCD", role: "player", playerKey: "key" },
    onSnapshot: () => events.push("snapshot"),
    onActivity: () => events.push("activity"),
    random: () => 1,
    onConnected: (c) => events.push("connected:" + c),
    onFailure: () => events.push("failure"),
    onRoomMissing: () => events.push("missing"),
    onBanned: () => events.push("banned"),
    onRoomLocked: () => {
      events.push("locked");
    }
  });
  return { clock, sources, events, connection };
}

test("connecting twice leaves exactly one stream open", async () => {
  const h = connectionHarness({ ok: true, ticket: "t1" });
  await h.connection.connect();
  await h.connection.connect();
  assert.equal(h.sources.openCount, 1);
  assert.equal(h.connection.openStreams, 1);
});

test("concurrent connects cannot both open a stream", async () => {
  const h = connectionHarness({ ok: true, ticket: "t1" });
  await Promise.all([h.connection.connect(), h.connection.connect(), h.connection.connect()]);
  assert.equal(h.sources.openCount, 1, "a racing caller must not orphan a second stream");
});

test("a flapping connection closes the old stream before retrying", async () => {
  const h = connectionHarness({ ok: true, ticket: "t1" });
  await h.connection.connect();
  const first = h.sources.created[0]!;

  first.source.onerror?.call(null, {});
  assert.equal(first.closed, true, "the failed stream must be closed, not abandoned");

  h.clock.advance(1500);
  await Promise.resolve();
  await Promise.resolve();
  assert.ok(h.sources.openCount <= 1, "a reconnect must never accumulate streams");
});

test("closing stops retries and leaves nothing open", async () => {
  const h = connectionHarness({ ok: true, ticket: "t1" });
  await h.connection.connect();
  h.sources.created[0]!.source.onerror?.call(null, {});
  h.connection.close();
  h.clock.advance(10_000);

  assert.equal(h.sources.openCount, 0);
  assert.equal(h.connection.openStreams, 0);
  assert.equal(h.clock.pendingCount, 0, "close must not leak a retry timer");
});

test("a closed connection never opens a stream, even if connect is called", async () => {
  const h = connectionHarness({ ok: true, ticket: "t1" });
  h.connection.close();
  await h.connection.connect();
  assert.equal(h.sources.openCount, 0);
});

test("the stream is authorised by ticket, never by credentials in the URL", async () => {
  const h = connectionHarness({ ok: true, ticket: "t-secret" });
  await h.connection.connect();
  const url = h.sources.created[0]!.url;
  assert.match(url, /^\/events\?ticket=/);
  assert.ok(!url.includes("playerKey"), "the event stream URL must not carry a player key");
  assert.ok(!url.includes("password"), "the event stream URL must not carry a room password");
});

test("refused tickets route instead of retrying blindly", async () => {
  for (const [ticket, expected] of [
    [{ ok: false, roomMissing: true }, "missing"],
    [{ ok: false, banned: true }, "banned"],
    [{ ok: false, roomLocked: true }, "locked"]
  ] as const) {
    const h = connectionHarness(ticket as ApiResult);
    await h.connection.connect();
    assert.ok(h.events.includes(expected), "expected " + expected);
    assert.equal(h.sources.openCount, 0, "a refused ticket must not open a stream");
  }
});

// ---------------------------------------------------------------------------
// Commands.

test("commands are POSTed with the room header and never a query string", async () => {
  const seen: Array<{ url: string; init: Record<string, Json> }> = [];
  const api = createApiClient({
    fetch: async (url, init) => {
      seen.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    },
    timers: fakeTimers().timers,
    context: () => ({ code: "ABCD", playerKey: "key-1" })
  });

  await api("/api/player/vote", { answerId: "a1" });
  const call = seen[0]!;
  assert.equal(call.url, "/api/player/vote");
  assert.equal(call.init["method"], "POST");
  assert.ok(!call.url.includes("?"), "credentials must not be placed in a query string");
  const body = JSON.parse(String(call.init["body"])) as Record<string, unknown>;
  assert.equal(body["code"], "ABCD");
  assert.equal(body["playerKey"], "key-1");
});

test("an unreachable server yields a usable error and never leaks the payload", async () => {
  const api = createApiClient({
    fetch: async () => {
      throw new Error("boom: playerKey=super-secret");
    },
    timers: fakeTimers().timers,
    context: () => ({ code: "ABCD", playerKey: "super-secret" })
  });

  const result = await api("/api/player/vote", { playerKey: "super-secret" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "Could not reach the game server.");
  assert.ok(!JSON.stringify(result).includes("super-secret"), "an error must not echo a credential");
});

test("a timed-out command clears its timer", async () => {
  const clock = fakeTimers();
  const api = createApiClient({
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }),
    timers: clock.timers,
    context: () => ({ code: "ABCD", playerKey: "k" })
  });
  await api("/api/player/ping", {}, { timeoutMs: 1800 });
  assert.equal(clock.pendingCount, 0, "a settled request must not leave an abort timer behind");
});

test("credential redaction reaches nested payloads", () => {
  const redacted = redactCredentials({
    code: "ABCD",
    playerKey: "secret-key",
    nested: { password: "hunter2", ticket: "t", safe: "keep" },
    list: [{ credential: "c" }]
  }) as Record<string, Json>;

  const text = JSON.stringify(redacted);
  for (const secret of ["secret-key", "hunter2", '"t"', '"c"']) {
    assert.ok(!text.includes(secret), "must not contain " + secret);
  }
  assert.equal((redacted["code"] as string), "ABCD");
  assert.equal(((redacted["nested"] as Record<string, Json>)["safe"] as string), "keep");
});

test("a client newer than the server explains itself", () => {
  assert.match(connectionMessage({ error: "Unknown action." }), /newer than the game server/);
  assert.match(connectionMessage({ error: "Room is full." }), /Room is full\./);
  assert.match(connectionMessage(null), /Could not reach this room/);
  assert.match(connectionMessage(new Error("offline")), /offline/);
});

// ---------------------------------------------------------------------------

test("the clock offset smooths jitter but follows a real skew", () => {
  // Mirrors the algorithm the client has always used: sub-750ms measurements
  // pull toward zero, and each result is blended with the previous one.
  assert.equal(nextClockOffset(1000, 1000, 0), 0);
  assert.equal(nextClockOffset(1200, 1000, 0), 0, "200ms of jitter must not move timers");

  // A real skew is approached over several samples rather than snapped to.
  let offset = 0;
  for (let i = 0; i < 25; i += 1) offset = nextClockOffset(31_000, 1_000, offset);
  assert.ok(Math.abs(offset - 30_000) < 50, "a sustained 30s skew must be corrected, got " + offset);

  assert.equal(nextClockOffset(0, 1000, 1234), 1234, "a missing server time must not reset the offset");
  assert.equal(nextClockOffset("nonsense", 1000, 1234), 1234, "a malformed server time must not reset the offset");
  assert.equal(nextClockOffset(undefined, 1000, 1234), 1234);
});

test("a schema mismatch explains itself instead of breaking the lobby", () => {
  assert.equal(describeSnapshotCompatibility({ schemaVersion: 1 }, 1).supported, true);
  // Servers have always been allowed to omit the version; refusing those would
  // break every room that exists today.
  assert.equal(describeSnapshotCompatibility({ code: "ABCD" }, 1).supported, true);
  assert.equal(describeSnapshotCompatibility(null, 1).supported, true);

  const newer = describeSnapshotCompatibility({ schemaVersion: 2 }, 1);
  assert.equal(newer.supported, false);
  assert.equal(newer.supported === false && newer.action, "refresh");
  assert.match(newer.supported === false ? newer.message : "", /Refresh the page/);

  const older = describeSnapshotCompatibility({ schemaVersion: 1 }, 2);
  assert.equal(older.supported, false);
  assert.equal(older.supported === false && older.action, "wait");
  assert.match(older.supported === false ? older.message : "", /still finishing an update/);
});

test("coalescing retains the newest pending version when an older poll arrives", () => {
  const clock = fakeTimers();
  const applied: unknown[] = [];
  const gate = createSnapshotGate({ catchUpMs: 10, timers: clock.timers, apply: (snapshot) => applied.push(snapshot["stateVersion"]) });
  gate.offer({ stateVersion: 10 }); gate.offer({ stateVersion: 9 });
  clock.advance(10);
  assert.deepEqual(applied, [10]);
  gate.dispose();
});

test("API rejects malformed JSON shapes instead of trusting a cast", async () => {
  const clock = fakeTimers();
  for (const payload of [null, [], 42, { ok: "true" }]) {
    const api = createApiClient({ timers: clock.timers, context: () => ({ code: "TEST", playerKey: "synthetic" }), fetch: async () => ({ ok: true, status: 200, json: async () => payload }) });
    assert.equal((await api('/api/host/settings')).ok, false);
  }
});


test("heartbeats refresh activity and retired streams cannot dispatch", async () => {
  const h = connectionHarness({ ok: true, ticket: "synthetic" });
  await h.connection.connect();
  const first = h.sources.created[0]!.source as EventSourceLike & { emit: (type: string, data: string) => void };
  first.emit("heartbeat", "{}");
  assert.ok(h.events.includes("activity"));
  h.connection.close();
  const count = h.events.length;
  first.emit("state", "{}"); first.emit("heartbeat", "{}");
  assert.equal(h.events.length, count);
});
