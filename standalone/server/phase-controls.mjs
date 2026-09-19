// What the host's Skip and Pause controls may do, phase by phase.
//
// This is deliberately separate from `LIVE_GAME_PHASES` in `server.js`. That
// list also gates Gahook pokes and per-question Gahook accounting, so widening
// it to cover Herd's writing phase would quietly change who may Gahook whom
// and when. Skip and Pause need their own answer, so they get their own lists.
//
// Two real defects live behind this module and are the reason it exists.
//
// First, `skipPhase` handled only `reading`, `answering` and `reveal`. In Herd
// the host also sits through `herd-writing`, where the old function matched no
// branch, returned `undefined`, and the route answered `{ ok: true }` anyway.
// The host pressed Skip and nothing at all happened, with no explanation.
//
// Second, pausing threw `ReferenceError: Cannot access 'remainingMs' before
// initialization` — a `const remainingMs` later in `setGamePaused` shadowed the
// imported helper for the whole function body — which the request handler
// turned into a bare 500 "Server error" toast. That shadowing is fixed in
// `server.js`; `pauseDecision` exists so the *policy* half is testable without
// a running room, and the smoke suite covers the runtime half over HTTP.
//
// Everything here is pure: it takes a phase and a mode, and returns what the
// caller should do. No room, no timers, no I/O.

/** Phases where a countdown is running and pausing therefore means something. */
export const PAUSABLE_PHASES = Object.freeze(["reading", "answering", "reveal"]);

/**
 * Setup phases the host may cut short.
 *
 * These have no countdown — they end when everyone is ready — so "skip" means
 * "stop waiting and start the game with what we have", which is exactly what
 * force-start already does.
 */
export const SKIPPABLE_SETUP_PHASES = Object.freeze(["building", "herd-writing"]);

/** Every phase where the Skip control does something. */
export const SKIPPABLE_PHASES = Object.freeze([...PAUSABLE_PHASES, ...SKIPPABLE_SETUP_PHASES]);

/**
 * What Skip should do in this phase.
 *
 * Returns a discriminated action rather than performing one, so the phase
 * table can be tested without a room, timers or a game engine.
 */
export function skipDecision(phase) {
  switch (phase) {
    case "reading":
      return { ok: true, action: "begin-answering" };
    case "answering":
      return { ok: true, action: "reveal" };
    case "reveal":
      return { ok: true, action: "next-question" };
    // Herd's answer-writing phase and Classic's question-building phase both
    // wait on people rather than on a clock. Cutting them short is force-start:
    // fill whatever is missing, then play.
    case "building":
    case "herd-writing":
      return { ok: true, action: "force-start" };
    default:
      return {
        ok: false,
        action: "none",
        error: phase === "finished" ?
          "The game has already finished." :
          "There is nothing to skip right now."
      };
  }
}

/**
 * Whether Pause applies in this phase.
 *
 * Pause holds a countdown. `building` and `herd-writing` have no deadline to
 * hold, so they are refused with a reason a host can act on rather than with
 * the old generic line that named a "question" the host was not looking at.
 */
export function pauseDecision(phase) {
  if (PAUSABLE_PHASES.includes(phase)) return { ok: true };
  if (phase === "building" || phase === "herd-writing") {
    return { ok: false, error: "This part of the game waits for players, not a timer. Use Skip to move on." };
  }
  return { ok: false, error: "The game can only be paused during a question." };
}
