// A durable outbox for career results.
//
// The old path set `statsRecorded = true` before it wrote anything, then fired
// the write off with a `.catch` that only logged. If the database was down, or
// slow, or the process stopped in between, the result was gone and the room
// said it had been recorded.
//
// The important constraint, and the one that decides the design: **a
// database-only outbox cannot accept a result while that database is
// unavailable.** Queuing in memory is not durable, and queuing in the database
// is exactly what is failing. So acceptance happens against a local append-only
// journal, which is fsynced before the result is acknowledged. Delivery to
// PostgreSQL happens afterwards, and may be retried for as long as it takes.
//
// What this honestly provides:
//   * a result accepted here survives a process restart and is redelivered
//   * delivery is idempotent, because `recordMatch` already dedupes on
//     (matchId, accountId) in both the memory and PostgreSQL repositories
//   * if acceptance itself fails -- disk full, bad permissions -- the caller is
//     told, and nothing claims the result was recorded
//
// What it does not provide: durability against loss of the volume the journal
// sits on. That is a deployment property, not a code one.

import fs from "node:fs";
import path from "node:path";

const JOURNAL_VERSION = 1;

/** Entries older than this many delivered records trigger a compaction. */
const COMPACT_AFTER_DELIVERED = 200;

export function careerResultKey(event) {
  return String(event?.matchId || "") + ":" + String(event?.accountId || "");
}

/**
 * @param {object} options
 * @param {string} options.journalPath      file the journal is appended to
 * @param {(event: object) => Promise<boolean>} options.deliver
 * @param {() => number} [options.now]
 * @param {object} [options.timers]         injected for deterministic tests
 * @param {number} [options.maxAttempts]    before an entry is parked for replay
 * @param {number} [options.baseDelayMs]
 * @param {number} [options.maxDelayMs]
 * @param {number} [options.maxPendingBytes] bound so a long outage cannot fill a disk
 * @param {() => number} [options.random]   jitter source
 * @param {(message: string, detail?: object) => void} [options.log]
 */
export function createCareerOutbox(options) {
  const {
    journalPath,
    deliver,
    now = () => Date.now(),
    timers = { setTimeout, clearTimeout },
    maxAttempts = 12,
    baseDelayMs = 500,
    maxDelayMs = 5 * 60_000,
    maxPendingBytes = 4 * 1024 * 1024,
    random = Math.random,
    io = fs,
    maxJournalBytes = maxPendingBytes * 2 + 128 * 1024,
    onStateChange = () => {},
    log = () => {}
  } = options;

  /** key -> { event, attempts, state, nextAttemptAt } */
  const entries = new Map();
  let pendingBytes = 0;
  let deliveredSinceCompact = 0;
  let retryHandle = null;
  let running = null;
  let stopped = false;
  let corruptLines = 0;
  let journalBytes = 0;
  let needsBoundary = true;
  let journalErrors = 0;

  const syncDirectory = () => {
    const handle = io.openSync(path.dirname(journalPath), "r");
    try { io.fsyncSync(handle); } finally { io.closeSync(handle); }
  };

  // A failed/partial append must never swallow a subsequently acknowledged record.
  const repairBoundary = () => {
    if (!needsBoundary) return;
    let raw;
    try { raw = io.readFileSync(journalPath); }
    catch (error) { if (error.code === "ENOENT") { needsBoundary = false; return; } throw error; }
    journalBytes = raw.length;
    if (raw.length && raw[raw.length - 1] !== 10) {
      const handle = io.openSync(journalPath, "a");
      try { io.writeFileSync(handle, "\n"); io.fsyncSync(handle); }
      finally { io.closeSync(handle); }
      journalBytes += 1;
    }
    needsBoundary = false;
  };

  const append = (record) => {
    repairBoundary();
    const line = JSON.stringify(record) + "\n";
    const size = Buffer.byteLength(line);
    if (journalBytes + size > maxJournalBytes) compact();
    if (journalBytes + size > maxJournalBytes) throw new Error("career journal capacity reached");
    io.mkdirSync(path.dirname(journalPath), { recursive: true });
    // Opened and fsynced per record. This is the whole point: the caller is
    // told a result is safe only once it is actually on the disk.
    const handle = io.openSync(journalPath, "a");
    try {
      needsBoundary = true;
      io.writeFileSync(handle, line);
      io.fsyncSync(handle);
      syncDirectory();
      journalBytes += size;
      needsBoundary = false;
    } finally {
      io.closeSync(handle);
    }
    return Buffer.byteLength(line);
  };

  const applyRecord = (record) => {
    if (!record || record.v !== JOURNAL_VERSION || !record.key) return;
    if (record.t === "queued") {
      entries.set(record.key, {
        event: record.event,
        attempts: record.attempts || 0,
        state: "queued",
        nextAttemptAt: record.nextAttemptAt || 0
      });
    } else if (record.t === "delivered" || record.t === "exhausted") {
      const existing = entries.get(record.key);
      if (existing) existing.state = record.t;
    }
  };

  /** Replay the journal. Damaged lines are skipped and counted, never fatal. */
  const load = () => {
    let raw = "";
    try {
      raw = io.readFileSync(journalPath, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      return;
    }
    journalBytes = Buffer.byteLength(raw);
    repairBoundary();
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        applyRecord(JSON.parse(line));
      } catch {
        // A torn final write, or a corrupted file. One unreadable record must
        // not cost every other result in the journal.
        corruptLines += 1;
      }
    }
    for (const entry of entries.values()) {
      if (entry.state !== "delivered") pendingBytes += Buffer.byteLength(JSON.stringify(entry.event));
    }
  };

  const compact = () => {
    const survivors = [...entries.entries()].filter(([, entry]) => entry.state !== "delivered");
    const lines = survivors.map(([key, entry]) =>
      JSON.stringify({ v: JOURNAL_VERSION, t: "queued", key, event: entry.event, attempts: entry.attempts, nextAttemptAt: entry.nextAttemptAt, at: now() })
    );
    const exhausted = survivors.
      filter(([, entry]) => entry.state === "exhausted").
      map(([key]) => JSON.stringify({ v: JOURNAL_VERSION, t: "exhausted", key, at: now() }));
    const temporary = journalPath + ".compact";
    io.mkdirSync(path.dirname(journalPath), { recursive: true });
    const contents = [...lines, ...exhausted].join("\n") + (lines.length || exhausted.length ? "\n" : "");
    const handle = io.openSync(temporary, "w", 0o600);
    try { io.writeFileSync(handle, contents); io.fsyncSync(handle); }
    finally { io.closeSync(handle); }
    io.renameSync(temporary, journalPath);
    syncDirectory();
    journalBytes = Buffer.byteLength(contents);
    for (const [key, entry] of [...entries.entries()]) {
      if (entry.state === "delivered") entries.delete(key);
    }
    deliveredSinceCompact = 0;
  };

  const backoffFor = (attempts) => {
    const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempts - 1));
    // Jitter so a room full of accounts does not retry in lockstep after an
    // outage and knock the database over again.
    const drawn = random();
    const jitter = Number.isFinite(drawn) ? drawn : 0.5;
    return Math.round(exponential * (0.5 + Math.min(Math.max(jitter, 0), 1) * 0.5));
  };

  const scheduleRetry = () => {
    if (stopped || retryHandle !== null) return;
    const waiting = [...entries.values()].filter((entry) => entry.state === "queued");
    if (!waiting.length) return;
    const soonest = Math.min(...waiting.map((entry) => entry.nextAttemptAt || 0));
    const delay = Math.max(0, soonest - now());
    retryHandle = timers.setTimeout(() => {
      retryHandle = null;
      void flush();
    }, delay);
  };

  /**
   * Attempt delivery of everything currently due. Safe to call at any time.
   *
   * A caller that awaits this must see the in-flight run finish, not return
   * early: `accept` kicks off a flush of its own, and a test or a shutdown that
   * awaited a no-op would be reasoning about work that had not happened yet.
   */
  function flush() {
    if (stopped) return Promise.resolve();
    if (running) return running;
    running = runFlush().catch(() => {
      journalErrors += 1;
      log("career journal update failed; retained results will retry");
      for (const entry of entries.values()) {
        if (entry.state === "queued") entry.nextAttemptAt = now() + maxDelayMs;
      }
    }).finally(() => {
      running = null;
      scheduleRetry();
    });
    return running;
  }

  async function runFlush() {
    // Drains rather than taking a single snapshot. `accept` starts a flush of
    // its own, so results queued while an attempt is in flight -- every other
    // account in the same finished match -- would otherwise sit until a timer
    // fired, and a caller awaiting the flush would see only the first one.
    for (let sweep = 0; sweep < 1_000; sweep += 1) {
      let handled = 0;
      for (const [key, entry] of [...entries.entries()]) {
        if (entry.state !== "queued") continue;
        if ((entry.nextAttemptAt || 0) > now()) continue;
        entry.attempts += 1;
        handled += 1;
        try {
          await deliver(entry.event);
          // `deliver` returning false means the row already existed, which is a
          // successful outcome for an idempotent write, not a failure.
          append({ v: JOURNAL_VERSION, t: "delivered", key, at: now() });
          entry.state = "delivered";
          pendingBytes = Math.max(0, pendingBytes - Buffer.byteLength(JSON.stringify(entry.event)));
          deliveredSinceCompact += 1;
          onStateChange(entry.event, "delivered");
        } catch (error) {
          if (entry.attempts >= maxAttempts) {
            append({ v: JOURNAL_VERSION, t: "exhausted", key, at: now() });
            entry.state = "exhausted";
            onStateChange(entry.event, "exhausted");
            // Kept on disk deliberately: an operator can replay it.
            log("career result delivery exhausted", { key, attempts: entry.attempts });
          } else {
            entry.nextAttemptAt = now() + backoffFor(entry.attempts);
            append({ v: JOURNAL_VERSION, t: "queued", key, event: entry.event, attempts: entry.attempts, nextAttemptAt: entry.nextAttemptAt, at: now() });
            log("career result delivery failed, will retry", {
              key,
              attempts: entry.attempts,
              reason: String(error?.message || error).slice(0, 200)
            });
          }
        }
      }
      if (deliveredSinceCompact >= COMPACT_AFTER_DELIVERED) compact();
      if (!handled) break;
    }
  }

  return {
    /** Replay the journal and resume delivery. Call once at start-up. */
    start() {
      load();
      stopped = false;
      void flush();
      return { corruptLines, pending: this.status().queued };
    },

    /**
     * Durably accept one result. Returns whether it is safe.
     *
     * A false result means the caller must NOT tell anyone the match was
     * recorded. That is the entire contract.
     */
    accept(event) {
      event = structuredClone(event);
      const key = careerResultKey(event);
      if (!event?.matchId || !event?.accountId) return { ok: false, reason: "invalid" };
      const existing = entries.get(key);
      if (existing) return { ok: true, duplicate: true };

      const size = Buffer.byteLength(JSON.stringify(event));
      if (pendingBytes + size > maxPendingBytes) {
        log("career outbox is full", { pendingBytes, size });
        return { ok: false, reason: "full" };
      }

      try {
        append({ v: JOURNAL_VERSION, t: "queued", key, event, at: now() });
      } catch (error) {
        // Disk full, read-only volume, bad permissions. Say so rather than
        // pretending; the caller reports the career status as unavailable.
        log("career outbox could not accept a result", { reason: String(error?.message || error).slice(0, 200) });
        return { ok: false, reason: "journal-unavailable" };
      }

      entries.set(key, { event, attempts: 0, state: "queued", nextAttemptAt: 0 });
      pendingBytes += size;
      void flush();
      return { ok: true };
    },

    /** Put exhausted entries back in the queue. For an operator, after a fix. */
    replayExhausted() {
      let replayed = 0;
      for (const [key, entry] of entries) {
        if (entry.state !== "exhausted") continue;
        append({ v: JOURNAL_VERSION, t: "queued", key, event: entry.event, at: now() });
        entry.state = "queued";
        entry.attempts = 0;
        entry.nextAttemptAt = 0;
        replayed += 1;
      }
      if (replayed) void flush();
      return replayed;
    },

    flush,
    compact,
    stateFor(event) { return entries.get(careerResultKey(event))?.state || "unavailable"; },

    status() {
      let queued = 0;
      let delivered = 0;
      let exhausted = 0;
      for (const entry of entries.values()) {
        if (entry.state === "queued") queued += 1;
        else if (entry.state === "delivered") delivered += 1;
        else if (entry.state === "exhausted") exhausted += 1;
      }
      return { queued, delivered, exhausted, corruptLines, pendingBytes, journalBytes, journalErrors };
    },

    stop() {
      stopped = true;
      if (retryHandle !== null) {
        timers.clearTimeout(retryHandle);
        retryHandle = null;
      }
    }
  };
}
