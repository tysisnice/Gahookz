// Phase progression as a pure decision.
//
// The server decides what happens next by mutating a room in place, which
// means the rules are only observable by standing a server up and playing a
// game. These are the parts of that decision that depend on nothing but the
// current state and the time: which phase follows, and when it ends.
//
// Clock and randomness are arguments, never ambient. A transition that reads
// `Date.now()` internally cannot be tested for the case that actually breaks
// rooms -- a timer firing late, or a phase deadline landing in the past after
// a pause.

export const PHASE_DURATIONS_MS = {
  reading: 5_000,
  answering: 14_000,
  reveal: 12_000
} as const;

export type LivePhase = keyof typeof PHASE_DURATIONS_MS;
export type GamePhase = LivePhase | "lobby" | "building" | "herd-writing" | "finished";

export interface RoundState {
  readonly phase: GamePhase;
  readonly questionIndex: number;
  readonly questionCount: number;
}

export type PhaseTransition =
  | { readonly phase: LivePhase; readonly questionIndex: number; readonly endsAt: number }
  | { readonly phase: "finished"; readonly questionIndex: number; readonly endsAt: null };

/**
 * What follows the phase a room is in.
 *
 * `reading` leads to `answering` leads to `reveal`, and a reveal either starts
 * the next question or finishes the game. A game with no questions finishes
 * immediately rather than opening a round nobody can answer.
 */
export function nextPhase(state: RoundState, now: number): PhaseTransition {
  const finish = (index: number): PhaseTransition => ({
    phase: "finished",
    // Clamped so a finished room never reports an index past its own
    // questions, which a reveal screen would then try to read.
    questionIndex: Math.max(0, Math.min(index, state.questionCount - 1)),
    endsAt: null
  });

  if (state.questionCount <= 0) return finish(0);

  if (state.phase === "reading") {
    return { phase: "answering", questionIndex: state.questionIndex, endsAt: now + PHASE_DURATIONS_MS.answering };
  }
  if (state.phase === "answering") {
    return { phase: "reveal", questionIndex: state.questionIndex, endsAt: now + PHASE_DURATIONS_MS.reveal };
  }
  if (state.phase === "reveal") {
    const next = state.questionIndex + 1;
    if (next >= state.questionCount) return finish(state.questionIndex);
    return { phase: "reading", questionIndex: next, endsAt: now + PHASE_DURATIONS_MS.reading };
  }

  // Starting a game from setup opens the first question.
  return { phase: "reading", questionIndex: 0, endsAt: now + PHASE_DURATIONS_MS.reading };
}

/**
 * Milliseconds left in a phase, never negative.
 *
 * A deadline in the past means the phase is over, not that it has negative
 * time remaining; returning a negative number here put "-3s" on a countdown
 * when a timer fired late or a tab woke from sleep.
 */
export function remainingMs(endsAt: number | null, now: number): number {
  if (!endsAt || !Number.isFinite(endsAt)) return 0;
  return Math.max(0, endsAt - now);
}

/**
 * The deadline a paused phase resumes to.
 *
 * Resuming must give back the time that was left when the pause began, not
 * restart the phase and not resume to a deadline that has since passed while
 * the room sat paused.
 */
export function resumeDeadline(remaining: number, now: number): number {
  return now + Math.max(0, remaining);
}

/** Total rounds a game will play, given what has been written and the cap. */
export function plannedRounds(available: number, maximum: number): number {
  if (!Number.isFinite(available) || available <= 0) return 0;
  if (!Number.isFinite(maximum)) return Math.trunc(available);
  return Math.max(0, Math.min(Math.trunc(available), Math.trunc(maximum)));
}

/**
 * A rough duration for a planned game, for the lobby to show.
 *
 * Deliberately a range rather than a promise: real games run longer than the
 * sum of their timers because people read, pause and Gahook each other.
 */
export function estimatedDurationMs(rounds: number): number {
  const perRound = PHASE_DURATIONS_MS.reading + PHASE_DURATIONS_MS.answering + PHASE_DURATIONS_MS.reveal;
  return Math.max(0, Math.trunc(rounds)) * perRound;
}
