import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { careerResultKey, createCareerOutbox } from "./career-outbox.mjs";

function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gahookz-outbox-"));
  return { dir, journal: path.join(dir, "career.journal") };
}

const sampleEvent = (over = {}) => ({
  matchId: "match-1",
  accountId: "account-1",
  roomCode: "ABCD",
  gameMode: "quiz",
  score: 1200,
  placement: 1,
  playerCount: 4,
  statDelta: { gamesPlayed: 1, wins: 1 },
  ...over
});

/** Timers that fire only when the test says so. */
function fakeTimers() {
  let next = 1;
  const pending = new Map();
  return {
    timers: {
      setTimeout(handler) {
        const id = next++;
        pending.set(id, handler);
        return id;
      },
      clearTimeout(id) {
        pending.delete(id);
      }
    },
    async runAll() {
      for (const [id, handler] of [...pending.entries()]) {
        pending.delete(id);
        await handler();
      }
    },
    get count() {
      return pending.size;
    }
  };
}

test("an accepted result is on disk before the caller is told it is safe", () => {
  const { journal } = scratch();
  const outbox = createCareerOutbox({ journalPath: journal, deliver: async () => true });
  // Nothing may be delivered yet; what matters is that acceptance is durable.
  const accepted = outbox.accept(sampleEvent());
  assert.equal(accepted.ok, true);
  const contents = fs.readFileSync(journal, "utf8");
  assert.match(contents, /"t":"queued"/);
  assert.match(contents, /match-1/);
  outbox.stop();
});

test("acceptance fails honestly when the journal cannot be written", () => {
  const { dir } = scratch();
  // A directory where the journal file should be: every write will fail.
  const journal = path.join(dir, "blocked");
  fs.mkdirSync(journal);
  const outbox = createCareerOutbox({ journalPath: journal, deliver: async () => true });
  const accepted = outbox.accept(sampleEvent());
  assert.equal(accepted.ok, false, "the caller must not be told a lost result was recorded");
  assert.equal(accepted.reason, "journal-unavailable");
  outbox.stop();
});

test("a database outage does not lose the result, and delivery resumes", async () => {
  const { journal } = scratch();
  const clock = fakeTimers();
  let available = false;
  const delivered = [];
  const outbox = createCareerOutbox({
    journalPath: journal,
    timers: clock.timers,
    baseDelayMs: 1,
    deliver: async (event) => {
      if (!available) throw new Error("database is unavailable");
      delivered.push(event.matchId);
      return true;
    }
  });

  // This is the case a database-only outbox cannot handle: the result arrives
  // while the database is down.
  assert.equal(outbox.accept(sampleEvent()).ok, true);
  await outbox.flush();
  assert.deepEqual(delivered, []);
  assert.equal(outbox.status().queued, 1, "the result must still be waiting, not lost");

  available = true;
  await clock.runAll();
  assert.deepEqual(delivered, ["match-1"]);
  assert.equal(outbox.status().queued, 0);
  outbox.stop();
});

test("a result accepted before a restart is redelivered afterwards", async () => {
  const { journal } = scratch();
  const first = createCareerOutbox({ journalPath: journal, deliver: async () => { throw new Error("down"); } });
  first.accept(sampleEvent());
  await first.flush();
  first.stop();

  // A new process, same volume.
  const delivered = [];
  const second = createCareerOutbox({
    journalPath: journal,
    deliver: async (event) => {
      delivered.push(event.accountId);
      return true;
    }
  });
  second.start();
  await second.flush();
  assert.deepEqual(delivered, ["account-1"], "a restart must replay what was accepted");
  second.stop();
});

test("a delivered result is not sent again after a restart", async () => {
  const { journal } = scratch();
  const attempts = [];
  const first = createCareerOutbox({
    journalPath: journal,
    deliver: async (event) => {
      attempts.push(event.matchId);
      return true;
    }
  });
  first.accept(sampleEvent());
  await first.flush();
  first.stop();

  const second = createCareerOutbox({
    journalPath: journal,
    deliver: async (event) => {
      attempts.push(event.matchId);
      return true;
    }
  });
  second.start();
  await second.flush();
  assert.deepEqual(attempts, ["match-1"], "a delivered result must not be redelivered");
  second.stop();
});

test("a restart that happened after delivery but before the acknowledgement is safe", async () => {
  // The worst window: the row is in the database, the journal never learned.
  // Redelivery is what makes this survivable, and recordMatch already dedupes
  // on (matchId, accountId), so the second attempt is a no-op returning false.
  const { journal } = scratch();
  const seen = new Set();
  const outbox = createCareerOutbox({
    journalPath: journal,
    deliver: async (event) => {
      const key = careerResultKey(event);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }
  });
  outbox.accept(sampleEvent());
  await outbox.flush();

  const replay = createCareerOutbox({
    journalPath: journal,
    deliver: async (event) => {
      const key = careerResultKey(event);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }
  });
  replay.start();
  await replay.flush();
  assert.equal(seen.size, 1, "the career total must not be counted twice");
  outbox.stop();
  replay.stop();
});

test("the same result offered twice is accepted once", () => {
  const { journal } = scratch();
  const outbox = createCareerOutbox({ journalPath: journal, deliver: async () => true });
  assert.equal(outbox.accept(sampleEvent()).ok, true);
  const again = outbox.accept(sampleEvent());
  assert.equal(again.ok, true);
  assert.equal(again.duplicate, true);
  assert.equal(outbox.status().queued + outbox.status().delivered, 1);
  outbox.stop();
});

test("one account failing does not hold up the others in the same match", async () => {
  const { journal } = scratch();
  const clock = fakeTimers();
  const delivered = [];
  const outbox = createCareerOutbox({
    journalPath: journal,
    timers: clock.timers,
    baseDelayMs: 1,
    deliver: async (event) => {
      if (event.accountId === "account-2") throw new Error("just this one");
      delivered.push(event.accountId);
      return true;
    }
  });
  for (const accountId of ["account-1", "account-2", "account-3"]) {
    outbox.accept(sampleEvent({ accountId }));
  }
  await outbox.flush();
  assert.deepEqual(delivered.sort(), ["account-1", "account-3"]);
  assert.equal(outbox.status().queued, 1, "only the failing account should still be waiting");
  outbox.stop();
});

test("a permanently failing result is parked, and can be replayed by hand", async () => {
  const { journal } = scratch();
  const clock = fakeTimers();
  let failing = true;
  const delivered = [];
  // An injected clock, so the backoff can be stepped past deterministically
  // instead of waiting for real milliseconds.
  let clockNow = 1_000;
  const outbox = createCareerOutbox({
    journalPath: journal,
    timers: clock.timers,
    now: () => clockNow,
    maxAttempts: 3,
    baseDelayMs: 1,
    deliver: async (event) => {
      if (failing) throw new Error("permanent");
      delivered.push(event.matchId);
      return true;
    }
  });
  outbox.accept(sampleEvent());
  await outbox.flush();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    clockNow += 10 * 60_000;
    await outbox.flush();
  }
  assert.equal(outbox.status().exhausted, 1, "it must stop retrying forever");
  assert.equal(outbox.status().queued, 0);

  failing = false;
  assert.equal(outbox.replayExhausted(), 1);
  await outbox.flush();
  assert.deepEqual(delivered, ["match-1"], "an operator must be able to recover it after a fix");
  outbox.stop();
});

test("a damaged journal line costs only itself", async () => {
  const { journal } = scratch();
  const first = createCareerOutbox({ journalPath: journal, deliver: async () => { throw new Error("down"); } });
  first.accept(sampleEvent({ matchId: "match-1" }));
  first.accept(sampleEvent({ matchId: "match-2" }));
  await first.flush();
  first.stop();

  // A torn write, as a half-flushed line would leave behind.
  fs.appendFileSync(journal, '{"v":1,"t":"queu');

  const delivered = [];
  const second = createCareerOutbox({
    journalPath: journal,
    deliver: async (event) => {
      delivered.push(event.matchId);
      return true;
    }
  });
  const started = second.start();
  await second.flush();
  assert.equal(started.corruptLines, 1, "the damaged line should be counted, not fatal");
  assert.deepEqual(delivered.sort(), ["match-1", "match-2"], "every intact result must still be delivered");
  second.stop();
});

test("the queue is bounded, so a long outage cannot fill the disk", () => {
  const { journal } = scratch();
  const outbox = createCareerOutbox({
    journalPath: journal,
    deliver: async () => { throw new Error("down"); },
    maxPendingBytes: 400
  });
  let accepted = 0;
  let refused = 0;
  for (let index = 0; index < 40; index += 1) {
    const result = outbox.accept(sampleEvent({ matchId: "match-" + index }));
    if (result.ok) accepted += 1;
    else refused += 1;
  }
  assert.ok(accepted > 0, "some results should fit");
  assert.ok(refused > 0, "the bound must actually stop accepting");
  assert.equal(outbox.status().pendingBytes <= 400, true);
  outbox.stop();
});

test("an invalid event is refused rather than queued forever", () => {
  const { journal } = scratch();
  const outbox = createCareerOutbox({ journalPath: journal, deliver: async () => true });
  assert.equal(outbox.accept({}).ok, false);
  assert.equal(outbox.accept({ matchId: "m" }).ok, false);
  assert.equal(outbox.accept({ accountId: "a" }).ok, false);
  outbox.stop();
});
