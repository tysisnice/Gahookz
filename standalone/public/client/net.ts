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

/** What one `/api/state` answer means. Routing, decided once, in one place. */
export type SnapshotOutcome =
  | { readonly kind: "apply"; readonly snapshot: Record<string, Json> }
  | { readonly kind: "roomMissing" }
  | { readonly kind: "banned" }
  | { readonly kind: "roomLocked" }
  /** The server answered and said no. `error` is its own payload. */
  | { readonly kind: "refused"; readonly error: Json; readonly immediate: boolean }
  /** Nothing usable came back: unreachable, timed out, or not a snapshot. */
  | { readonly kind: "unreachable" };

/**
 * Read one snapshot response.
 *
 * Pure, because these five branches decide whether a player stays in the room,
 * goes back to the welcome screen, or is asked for the room password again,
 * and until now they were inline in a `.jsx` effect where no test could reach
 * them.
 *
 * A 200 that is not an object is treated as unreachable rather than applied.
 * A proxy error page, a truncated body or a stray array used to be handed to
 * the snapshot gate, which correctly refused to dispatch it — and the room
 * then sat there with no explanation, because nothing had failed loudly.
 */
export function describeSnapshotResponse(status: number, ok: boolean, body: unknown): SnapshotOutcome {
  const payload = body !== null && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, Json>)
    : null;
  if (status === 404 && payload?.["roomMissing"]) return { kind: "roomMissing" };
  // Banned first: a banned player in a locked room is out, not re-admitted.
  if (payload?.["banned"]) return { kind: "banned" };
  if (payload?.["roomLocked"]) return { kind: "roomLocked" };
  if (!ok) {
    // A 4xx is the server's considered answer, so it is worth saying at once;
    // a 5xx may be one bad second of a deploy and waits for a second opinion.
    return { kind: "refused", error: payload ?? {}, immediate: status >= 400 && status < 500 };
  }
  if (!payload) return { kind: "unreachable" };
  return { kind: "apply", snapshot: payload };
}

/**
 * How long one snapshot request may hold the single slot.
 *
 * The stream sends a keepalive every 15 seconds and the client only reaches
 * for a snapshot after 25 seconds of silence, so a request still unanswered
 * after 10 has already lost its race with the next attempt. Holding the slot
 * longer cannot produce fresher state; it only delays the attempt that might.
 */
export const SNAPSHOT_TIMEOUT_MS = 10_000;

export interface SnapshotFetcherOptions {
  readonly fetch: (input: string, init: Record<string, Json>) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<Json>;
  }>;
  readonly timers: TimerLike;
  /** Read afresh per request: role and credential change without a remount. */
  readonly request: () => { code: string; role: string; playerKey: string };
  readonly onOutcome: (outcome: SnapshotOutcome) => void;
  readonly timeoutMs?: number;
}

export interface SnapshotFetcher {
  /** Ask for the room state. Overlapping asks collapse into one follow-up. */
  refresh(): void;
  /** Stop. In-flight answers are discarded, not dispatched. */
  dispose(): void;
  /** Requests this fetcher has in flight. Tests assert it is never above 1. */
  readonly activeRequests: number;
}

/**
 * Fetches room snapshots, one at a time.
 *
 * Three things ask for a snapshot — the recovery poll every five seconds of
 * silence, every settled command, and a tab becoming visible — and none of
 * them knew about the others. Nothing waited for a reply and nothing timed
 * out, so a request that was never answered did not stop the next one being
 * sent: a tab with a black-holed connection stacked one more every five
 * seconds for as long as the room stayed open. Measured in a real browser,
 * eight in sixty seconds, all still open at the end, and when the network
 * returns they all land at once, each serialising a whole room.
 *
 * So one request at a time, with at most one follow-up queued behind it. The
 * follow-up matters: a trigger means "the room changed, look again", and
 * dropping it outright could leave the last change unseen. One is enough,
 * because a snapshot is the whole room state and a later one supersedes it.
 *
 * Cadence on a healthy connection is unchanged — replies arrive in
 * milliseconds, so nothing overlaps and nothing is collapsed. P08 owns the
 * cadence itself.
 */
export function createSnapshotFetcher(options: SnapshotFetcherOptions): SnapshotFetcher {
  const { fetch: doFetch, timers, request, onOutcome } = options;
  const timeoutMs = options.timeoutMs ?? SNAPSHOT_TIMEOUT_MS;
  let active = 0;
  let queued = false;
  let disposed = false;

  // One place decides whether a request may start, so that the rule has a
  // single reading. A caller that arrives mid-flight leaves a follow-up
  // behind instead; the `finally` below starts it.
  const run = async (): Promise<void> => {
    if (disposed) return;
    if (active > 0) {
      queued = true;
      return;
    }
    active += 1;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller ? timers.setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const target = request();
      const response = await doFetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Gahookz-Room": target.code },
        body: JSON.stringify({ code: target.code, role: target.role, playerKey: target.playerKey }),
        cache: "no-store",
        ...(controller ? { signal: controller.signal } : {})
      });
      const body = await response.json();
      if (disposed) return;
      onOutcome(describeSnapshotResponse(response.status, response.ok, body));
    } catch {
      // The thrown value is deliberately not forwarded. An aborted or failed
      // fetch carries a browser-authored message ("Failed to fetch", "This
      // operation was aborted") and this one is shown to a player in a room
      // that will not open.
      if (!disposed) onOutcome({ kind: "unreachable" });
    } finally {
      if (timeout !== null) timers.clearTimeout(timeout);
      active -= 1;
      if (queued && !disposed) {
        queued = false;
        void run();
      }
    }
  };

  return {
    refresh() {
      void run();
    },
    dispose() {
      disposed = true;
      queued = false;
    },
    get activeRequests() {
      return active;
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
