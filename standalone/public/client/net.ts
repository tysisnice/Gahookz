// The browser's one network boundary.
//
// Everything the client does over the wire lives here: room commands, the
// live-state subscription, snapshot ordering, and the server clock offset.
// It exists for two reasons.
//
// First, this logic is where the subtle bugs live — a snapshot applied out of
// order, a second EventSource left open after a remount, a reconnect storm
// after a failure — and none of it was reachable by a test. The smoke suite
// drives the server over HTTP and never executes the client, so a fault here
// passed every check and only showed up in someone's browser.
//
// Second, it is untyped `.jsx` today, outside every TypeScript project.
//
// So every ambient capability is injected rather than reached for: `fetch`,
// the `EventSource` constructor, timers, storage and the clock all arrive as
// dependencies. In the browser they are the real ones. In a test they are
// fakes, which is what makes ordering, cancellation and subscription lifetime
// verifiable in plain `node --test` without adding a browser to a project
// that deliberately has two runtime dependencies.
//
// Network *cadence* is deliberately unchanged here. P08 measures and reduces
// the recovery poll; this stage only moves the code and makes it testable, so
// that a later behavioural change has something to change against.

export type Json = unknown;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface TimerLike {
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(handle: number): void;
  setInterval(handler: () => void, ms: number): number;
  clearInterval(handle: number): void;
}

export interface EventSourceLike {
  close(): void;
  onopen: ((this: unknown, event: unknown) => void) | null;
  onerror: ((this: unknown, event: unknown) => void) | null;
  addEventListener(type: string, listener: (event: { data: string }) => void): void;
}

export interface ApiResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly roomMissing?: boolean;
  readonly roomLocked?: boolean;
  readonly banned?: boolean;
  readonly [key: string]: Json;
}

/** Fields that must never reach a log, a metric or an error report. */
const SECRET_FIELDS = ["playerKey", "password", "ticket", "credential", "hostKey", "token"];

/**
 * Strip credentials from a payload before it is logged or reported.
 *
 * Room commands carry `playerKey` and sometimes `password` on nearly every
 * request, so anything that echoes a payload — an error toast, a console
 * warning, a future diagnostic counter — is one careless line away from
 * printing a credential that grants control of someone's room.
 */
export function redactCredentials(value: Json): Json {
  if (Array.isArray(value)) return value.map(redactCredentials);
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, Json> = {};
  for (const [key, entry] of Object.entries(value as Record<string, Json>)) {
    out[key] = SECRET_FIELDS.includes(key) ? "[redacted]" : redactCredentials(entry);
  }
  return out;
}

/**
 * Turn a failed request into something a player can act on.
 *
 * The "Unknown action" case is specifically a client newer than the server,
 * which happens during a deploy and is not the player's fault or a room fault.
 */
export function connectionMessage(error: unknown): string {
  const source = error as { error?: unknown; message?: unknown } | null;
  const message = String(source?.error ?? source?.message ?? "").trim();
  if (message === "Unknown action.") {
    return "This screen is newer than the game server. The server needs to finish updating before this room can open.";
  }
  return message || "Could not reach this room. Check the server, then retry.";
}

export interface SnapshotGateOptions {
  readonly catchUpMs: number;
  readonly timers: TimerLike;
  readonly apply: (snapshot: Record<string, Json>) => void;
}

export interface SnapshotGate {
  /** Offer a snapshot. Older ones are dropped; newer ones may be coalesced. */
  offer(snapshot: unknown): void;
  /** Drop anything pending and stop. Safe to call twice. */
  dispose(): void;
  /** Highest applied `stateVersion`, for tests and diagnostics. */
  readonly appliedVersion: number;
}

/**
 * Orders and coalesces incoming snapshots.
 *
 * Two independent sources push state — the SSE stream and the recovery poll —
 * so snapshots arrive out of order routinely, not exceptionally. Applying a
 * stale one repaints the room with the previous phase, which players see as
 * the game jumping backwards. `stateVersion` decides, and a snapshot at or
 * below the highest applied version is dropped.
 *
 * Bursts are coalesced over `catchUpMs` so a reconnect that replays several
 * versions paints once, at the newest, rather than animating through history.
 */
export function createSnapshotGate(options: SnapshotGateOptions): SnapshotGate {
  const { catchUpMs, timers, apply } = options;
  let applied = 0;
  let pending: Record<string, Json> | null = null;
  let flushHandle: number | null = null;
  let disposed = false;

  const versionOf = (snapshot: Record<string, Json>): number => {
    const raw = Number(snapshot["stateVersion"]);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  };

  const applyNow = (snapshot: Record<string, Json>): void => {
    if (disposed) return;
    const version = versionOf(snapshot);
    // A snapshot without a version cannot be ordered, so it is always applied;
    // that matches an error or role payload that carries no stateVersion.
    if (version && version < applied) return;
    applied = Math.max(applied, version);
    apply(snapshot);
  };

  const flush = (): void => {
    flushHandle = null;
    const next = pending;
    pending = null;
    if (next) applyNow(next);
  };

  return {
    get appliedVersion() {
      return applied;
    },
    offer(snapshot: unknown) {
      if (disposed || snapshot === null || typeof snapshot !== "object") return;
      const record = snapshot as Record<string, Json>;
      const version = versionOf(record);
      if (version && (version < applied || (pending && version < versionOf(pending)))) return;
      if (catchUpMs <= 0) {
        if (flushHandle !== null) {
          timers.clearTimeout(flushHandle);
          flushHandle = null;
        }
        pending = null;
        applyNow(record);
        return;
      }
      pending = record;
      if (flushHandle === null) flushHandle = timers.setTimeout(flush, catchUpMs);
    },
    dispose() {
      disposed = true;
      pending = null;
      if (flushHandle !== null) {
        timers.clearTimeout(flushHandle);
        flushHandle = null;
      }
    }
  };
}

export interface ApiClientOptions {
  readonly fetch: (input: string, init: Record<string, Json>) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<Json>;
  }>;
  readonly timers: TimerLike;
  /** Supplies the room code and client key that every command carries. */
  readonly context: () => { code: string; playerKey: string };
  readonly onSettled?: (path: string) => void;
}

export interface ApiCallOptions {
  readonly timeoutMs?: number;
  readonly refresh?: boolean;
  readonly signal?: unknown;
}

/**
 * Sends one room command.
 *
 * Always a POST, never a query string: room credentials in a URL end up in
 * proxy logs, browser history and referrer headers. `GET /api/state` returns
 * 405 by design for the same reason.
 */
export function createApiClient(options: ApiClientOptions) {
  const { fetch: doFetch, context, onSettled } = options;

  return async function api(
    path: string,
    payload: Record<string, Json> = {},
    call: ApiCallOptions = {}
  ): Promise<ApiResult> {
    const ctx = context();
    const body: Record<string, Json> = { ...payload };
    if (ctx.code && !body["code"]) body["code"] = ctx.code;
    if (!body["playerKey"]) body["playerKey"] = ctx.playerKey;

    const controller =
      call.timeoutMs && typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout =
      controller && call.timeoutMs
        ? options.timers.setTimeout(() => controller.abort(), call.timeoutMs)
        : null;

    try {
      const response = await doFetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(body["code"] ? { "X-Gahookz-Room": String(body["code"]) } : {})
        },
        body: JSON.stringify(body),
        ...(controller ? { signal: controller.signal } : {})
      });
      const raw = await response.json();
      if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof (raw as Record<string, unknown>)["ok"] !== "boolean") {
        return { ok: false, error: "The server returned an invalid response. Refresh and retry." };
      }
      const result = raw as ApiResult;
      if (result?.ok && path !== "/api/room" && call.refresh !== false) onSettled?.(path);
      return result;
    } catch {
      // Deliberately does not include the payload: it holds the player key.
      return { ok: false, error: "Could not reach the game server." };
    } finally {
      if (timeout !== null) options.timers.clearTimeout(timeout);
    }
  };
}

export interface LiveConnectionOptions {
  readonly api: (path: string, payload: Record<string, Json>, call?: ApiCallOptions) => Promise<ApiResult>;
  readonly createEventSource: (url: string) => EventSourceLike;
  readonly timers: TimerLike;
  readonly reconnectMs: number;
  readonly random?: () => number;
  readonly onActivity?: () => void;
  readonly room: { code: string; role: string; playerKey: string };
  readonly onSnapshot: (snapshot: unknown) => void;
  readonly onConnected: (connected: boolean) => void;
  readonly onFailure: (error: unknown, options: { immediate: boolean }) => void;
  readonly onRoomMissing: () => void;
  readonly onBanned: () => void;
  readonly onRoomLocked: () => Promise<void> | void;
}

export interface LiveConnection {
  /** Idempotent: calling twice must not leave two streams open. */
  connect(): Promise<void>;
  close(): void;
  /** Open streams this connection is responsible for. Tests assert it is 0 or 1. */
  readonly openStreams: number;
}

/**
 * Owns the live-state subscription.
 *
 * The stream is authorised by a short-lived single-use ticket rather than by
 * credentials in the URL, because an EventSource URL is not a private place.
 *
 * The invariant worth protecting is **one stream per connection**. A remount,
 * a fast reconnect, or a `connect()` that races its own retry can each leave
 * an orphaned EventSource feeding a disposed view, and the symptom is a room
 * that gets slower the longer it stays open. Every path closes the previous
 * stream before opening another, and a closed connection never opens one.
 */
export function createLiveConnection(options: LiveConnectionOptions): LiveConnection {
  const { api, createEventSource, timers, reconnectMs, room } = options;
  let source: EventSourceLike | null = null;
  let retryHandle: number | null = null;
  let closed = false;
  let opening = false;
  let retryAttempt = 0;

  const dropStream = (): void => {
    if (source) {
      source.close();
      source = null;
    }
  };

  const scheduleRetry = (): void => {
    if (closed || retryHandle !== null) return;
    retryHandle = timers.setTimeout(() => {
      retryHandle = null;
      void connect();
    }, Math.min(30_000, reconnectMs * 2 ** Math.min(retryAttempt++, 5)) * (0.5 + (options.random ?? Math.random)() * 0.5));
  };

  async function connect(): Promise<void> {
    // Guard against a second caller arriving while the ticket request is in
    // flight; without it both callers open a stream and only one is tracked.
    if (closed || opening) return;
    opening = true;
    try {
      const ticket = await api(
        "/api/events/ticket",
        { code: room.code, role: room.role, playerKey: room.playerKey },
        { refresh: false }
      );
      if (closed) return;

      if (!ticket.ok) {
        options.onConnected(false);
        if (ticket.roomMissing) return options.onRoomMissing();
        if (ticket.banned) return options.onBanned();
        if (ticket.roomLocked) {
          await options.onRoomLocked();
          return;
        }
        options.onFailure(ticket, { immediate: true });
        scheduleRetry();
        return;
      }

      dropStream();
      if (closed) return;

      const url =
        "/events?ticket=" +
        encodeURIComponent(String(ticket["ticket"])) +
        "&room=" +
        encodeURIComponent(room.code);
      const stream = createEventSource(url);
      source = stream;
      stream.onopen = () => { if (!closed && source === stream) options.onConnected(true); };
      stream.addEventListener("heartbeat", () => {
        if (closed || source !== stream) return;
        retryAttempt = 0;
        options.onActivity?.();
      });
      stream.onerror = () => {
        if (closed || source !== stream) return;
        options.onConnected(false);
        // Close before retrying so a flapping connection cannot accumulate
        // streams, each with its own error handler scheduling another retry.
        dropStream();
        scheduleRetry();
      };
      stream.addEventListener("state", (event: { data: string }) => {
        if (closed || source !== stream) return;
        retryAttempt = 0;
        options.onActivity?.();
        try {
          options.onSnapshot(JSON.parse(event.data));
        } catch (error) {
          options.onFailure(error, { immediate: true });
        }
      });
    } catch (error) {
      if (!closed) {
        options.onConnected(false);
        options.onFailure(error, { immediate: true });
        dropStream();
        scheduleRetry();
      }
    } finally {
      opening = false;
    }
  }

  return {
    connect,
    close() {
      closed = true;
      if (retryHandle !== null) {
        timers.clearTimeout(retryHandle);
        retryHandle = null;
      }
      dropStream();
    },
    get openStreams() {
      return source ? 1 : 0;
    }
  };
}

export type SnapshotCompatibility =
  | { readonly supported: true }
  | { readonly supported: false; readonly action: "refresh" | "wait"; readonly message: string };

/**
 * Decide whether this client can render a snapshot at all.
 *
 * A version mismatch happens during a deploy, and the failure mode to avoid is
 * a lobby that renders half-empty because fields moved — a player sees a broken
 * room and no explanation. Both directions get a message that says what to do,
 * and neither is treated as a room fault.
 *
 * A snapshot with no `schemaVersion` is supported: servers have always been
 * allowed to omit it, and refusing those would break every current room.
 */
export function describeSnapshotCompatibility(
  snapshot: unknown,
  expectedVersion: number
): SnapshotCompatibility {
  if (snapshot === null || typeof snapshot !== "object") return { supported: true };
  const raw = (snapshot as Record<string, Json>)["schemaVersion"];
  if (raw === undefined || raw === null) return { supported: true };
  const version = Number(raw);
  if (!Number.isFinite(version) || version === expectedVersion) return { supported: true };
  if (version > expectedVersion) {
    return {
      supported: false,
      action: "refresh",
      message: "This room is running a newer version of Gahookz. Refresh the page to keep playing."
    };
  }
  return {
    supported: false,
    action: "wait",
    message: "The game server is still finishing an update. This room will reconnect on its own."
  };
}

/** Offsets smaller than this are treated as network jitter, not clock skew. */
export const CLOCK_JITTER_MS = 750;

/**
 * The next server-clock offset for this device.
 *
 * Phase countdowns are server deadlines, so a device with a skewed clock shows
 * the wrong timer. Two things stop that correction from becoming its own
 * problem: a measurement under `CLOCK_JITTER_MS` is read as ordinary network
 * variance and pulls toward zero rather than being trusted, and the result is
 * smoothed into the previous value so a single slow response cannot make every
 * countdown in the room jump.
 *
 * Pure on purpose — the caller owns where the offset is stored.
 */
export function nextClockOffset(serverTime: unknown, now: number, previous: number): number {
  if (!serverTime) return previous;
  const measured = Number(serverTime) - now;
  if (!Number.isFinite(measured)) return previous;
  const target = Math.abs(measured) < CLOCK_JITTER_MS ? 0 : measured;
  const prior = Number.isFinite(previous) ? previous : 0;
  return Math.round(prior * 0.65 + target * 0.35);
}
