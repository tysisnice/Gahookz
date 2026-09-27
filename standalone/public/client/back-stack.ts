// The browser Back button, as a stack of things that can be closed.
//
// Tyson (25 Sep): players making a custom Gahook "will press back to get out
// of that menu and accidentally leave the whole room". A room is one URL,
// `/<CODE>`, and every menu, sheet, editor and dialog inside it used to be
// React state only, so Back skipped straight past all of them and out of the
// room.
//
// This module gives each open overlay one history entry of its own, above one
// "guard" entry that represents the room itself:
//
//   [ ... | /CODE (base) | /CODE guard | /CODE overlay 1 | /CODE overlay 2 ]
//
// - Back pops the top entry; we close the overlay that owned it.
// - Back from the guard lands on the base entry; we ask "Leave game?" and do
//   NOT push again until the player answers No (see below for why).
// - An overlay closed by its own button consumes its entry with history.go(),
//   so history never grows while people open and close things.
//
// Entries are interchangeable: an entry is marked only with its path and depth
// (`{ gahookzBack: { path, depth } }`), never with which overlay made it. The
// stack decides how many entries it wants (guard + open overlays) and
// reconciles the browser to that number, coalescing a close and an open in the
// same tick (a menu closing because its "Change name & profile" opened the
// profile editor) into no history traffic at all.
//
// Why no re-push without a tap: Chrome skips history entries that a page added
// without a user activation when the person presses its Back button (the
// "history manipulation intervention"). Every push here happens within a tap
// that opened something, or the tap on "No", so the entries stay real. A
// second Back while "Leave game?" is showing therefore leaves the room, like a
// second press of an Android "press back again to exit" prompt.
//
// This file is pure (no React, no window) so node:test can drive it with a
// fake history; client/history.jsx wires it to the real one.

export interface BackStackHistory {
  readonly state: unknown;
  pushState(data: unknown, unused: string, url?: string | null): void;
  go(delta?: number): void;
}

export interface BackStackLocation {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
}

export interface BackStackEnvironment {
  history: BackStackHistory;
  location: BackStackLocation;
  /** Subscribe to popstate; returns an unsubscribe function. */
  listen(onPopState: () => void): () => void;
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** Run after the current task's synchronous work (a microtask). */
  defer(task: () => void): void;
}

export interface BackStack {
  /** An overlay opened. Returns its id. Back will call `onBack` to close it. */
  open(onBack: () => void): number;
  /** The overlay closed itself (its button, Escape, a save, unmounting). */
  close(id: number): void;
  /** Whether this overlay is the one Back or Escape should close next. */
  isTop(id: number): boolean;
  /**
   * The room is on screen: Back with nothing open calls `onBack` (which shows
   * "Leave game?") instead of leaving. Returns a release function.
   */
  guard(onBack: () => void): () => void;
  /** The player answered No: put the guard entry back (call from the tap). */
  restoreGuard(): void;
  /** Entries this stack wants above the base entry right now. */
  wanted(): number;
  dispose(): void;
}

export const BACK_STACK_MARK = "gahookzBack";
// If a history.go() we asked for never produces a popstate (it was out of
// range, or the browser ignored it), stop waiting rather than wedge the stack.
const TRAVEL_TIMEOUT_MS = 1000;

interface Layer {
  id: number;
  onBack: () => void;
}

interface Guard {
  path: string;
  onBack: () => void;
  held: boolean;
}

export function createBackStack(env: BackStackEnvironment): BackStack {
  let layers: Layer[] = [];
  let guard: Guard | null = null;
  let page = env.location.pathname;
  let nextId = 1;
  let travelling = false;
  let travelTimer: unknown = null;
  let syncQueued = false;

  const entryDepth = (): number => {
    const state = env.history.state;
    if (!state || typeof state !== "object") return 0;
    const mark = (state as Record<string, unknown>)[BACK_STACK_MARK];
    if (!mark || typeof mark !== "object") return 0;
    const { path, depth } = mark as { path?: unknown; depth?: unknown };
    if (path !== env.location.pathname) return 0;
    return typeof depth === "number" && Number.isInteger(depth) && depth > 0 ? depth : 0;
  };

  const guardCounts = (): boolean => Boolean(guard && guard.held && guard.path === page);
  const wanted = (): number => (guardCounts() ? 1 : 0) + layers.length;

  // Another page (the welcome screen after leaving, /information, a new room)
  // owns none of our overlays. They are forgotten without calling onBack: the
  // components that owned them are unmounting, and must not be told to close
  // into a screen that no longer exists.
  const followPage = (): boolean => {
    const path = env.location.pathname;
    if (path === page) return false;
    page = path;
    layers = [];
    return true;
  };

  const stopTravelling = (): void => {
    travelling = false;
    if (travelTimer !== null) env.clearTimeout(travelTimer);
    travelTimer = null;
  };

  const sync = (): void => {
    syncQueued = false;
    if (travelling) return;
    followPage();
    const want = wanted();
    const have = entryDepth();
    if (have < want) {
      const url = env.location.pathname + env.location.search + env.location.hash;
      for (let depth = have + 1; depth <= want; depth += 1) {
        env.history.pushState({ [BACK_STACK_MARK]: { path: page, depth } }, "", url);
      }
    } else if (have > want) {
      travelling = true;
      travelTimer = env.setTimeout(stopTravelling, TRAVEL_TIMEOUT_MS);
      env.history.go(want - have);
    }
  };

  const schedule = (): void => {
    if (syncQueued) return;
    syncQueued = true;
    env.defer(sync);
  };

  const onPopState = (): void => {
    if (travelling) {
      // The traversal we asked for has landed. Something may have opened
      // while we waited, so reconcile once more.
      stopTravelling();
      if (!followPage()) schedule();
      return;
    }
    if (followPage()) return;
    const have = entryDepth();
    const want = wanted();
    // Forward, or a move onto an entry this stack does not count: nothing
    // was closed by it.
    if (have >= want) return;
    let excess = want - have;
    const closing: Layer[] = [];
    while (excess > 0 && layers.length) {
      closing.push(layers.pop() as Layer);
      excess -= 1;
    }
    const askToLeave = excess > 0 && guardCounts() ? guard : null;
    if (askToLeave) askToLeave.held = false;
    for (const layer of closing) layer.onBack();
    askToLeave?.onBack();
  };

  const unlisten = env.listen(onPopState);

  return {
    open(onBack) {
      followPage();
      const id = nextId;
      nextId += 1;
      layers.push({ id, onBack });
      schedule();
      return id;
    },
    close(id) {
      const index = layers.findIndex((layer) => layer.id === id);
      // Already closed by Back, or forgotten when the page changed.
      if (index === -1) return;
      layers.splice(index, 1);
      schedule();
    },
    isTop(id) {
      return layers.length > 0 && layers[layers.length - 1]?.id === id;
    },
    guard(onBack) {
      followPage();
      const entry: Guard = { path: page, onBack, held: true };
      guard = entry;
      schedule();
      return () => {
        if (guard !== entry) return;
        guard = null;
        schedule();
      };
    },
    restoreGuard() {
      if (!guard || guard.held) return;
      guard.held = true;
      // Synchronously, inside the No tap, so the entry carries its activation.
      sync();
    },
    wanted,
    dispose() {
      unlisten();
      stopTravelling();
    }
  };
}
