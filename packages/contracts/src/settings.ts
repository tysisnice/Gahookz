// Canonical game settings.
//
// The product has two game families, Quiz and Herd, and Quiz has two scoring
// rules, Classic and Majority Rulez. Majority is a *scoring choice inside
// Quiz*, not a third family — that is the whole point of the P03 selector
// merge.
//
// The wire has historically carried a single `gameMode` of "quiz" | "majority"
// | "herd", which conflates those two axes. Both spellings must coexist for a
// while: old clients and stored match records still send and hold `gameMode`,
// while new code wants to ask "which family?" and "which scoring?" separately.
//
// The rule that keeps that safe is: **there is exactly one writable truth.**
// `GameSettings` is it. `gameMode` is *derived* from it and never stored
// alongside it as an independently editable field, because two writable
// representations of the same fact drift, and the drift is silent — a room
// that says `herd` in one field and `quiz` in another scores a game wrongly
// rather than failing loudly.

import { GAME_MODES, type GameMode } from "./game.ts";

export const GAME_FAMILIES = ["quiz", "herd"] as const;
export type GameFamily = (typeof GAME_FAMILIES)[number];

export const QUIZ_SCORINGS = ["classic", "majority"] as const;
export type QuizScoring = (typeof QUIZ_SCORINGS)[number];

/**
 * The canonical pair.
 *
 * `quizScoring` is meaningful only while `gameFamily` is `"quiz"`, but it is
 * still carried while Herd is selected, deliberately: the lobby hides the
 * Majority toggle under Herd and must restore the host's previous choice when
 * they switch back, rather than silently resetting them to Classic.
 */
export interface GameSettings {
  readonly gameFamily: GameFamily;
  readonly quizScoring: QuizScoring;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  // New rooms stay on Quiz/Classic, which is the behaviour rooms already have.
  gameFamily: "quiz",
  quizScoring: "classic"
};

/** Reasons a tied vote was separated, reported instead of being guessed at. */
export const TIE_BREAK_REASONS = ["none", "fastest", "average", "order"] as const;
export type TieBreakReason = (typeof TIE_BREAK_REASONS)[number];

export function isGameFamily(value: unknown): value is GameFamily {
  return typeof value === "string" && (GAME_FAMILIES as readonly string[]).includes(value);
}

export function isQuizScoring(value: unknown): value is QuizScoring {
  return typeof value === "string" && (QUIZ_SCORINGS as readonly string[]).includes(value);
}

export function isGameMode(value: unknown): value is GameMode {
  return typeof value === "string" && (GAME_MODES as readonly string[]).includes(value);
}

/**
 * Derive the legacy wire value. Herd maps to `"herd"` whatever the remembered
 * Quiz scoring is, because the remembered value is lobby state, not the rule
 * this game will be played under.
 */
export function toLegacyGameMode(settings: GameSettings): GameMode {
  if (settings.gameFamily === "herd") return "herd";
  return settings.quizScoring === "majority" ? "majority" : "quiz";
}

/**
 * Widen a legacy value into the canonical pair.
 *
 * `"herd"` carries no scoring information, so it yields the Classic default.
 * A caller that knows the host's remembered Quiz scoring should overlay it
 * rather than expecting this function to invent it.
 */
export function fromLegacyGameMode(mode: GameMode): GameSettings {
  if (mode === "herd") return { gameFamily: "herd", quizScoring: "classic" };
  if (mode === "majority") return { gameFamily: "quiz", quizScoring: "majority" };
  return { gameFamily: "quiz", quizScoring: "classic" };
}

export type NormaliseResult =
  | { readonly ok: true; readonly settings: GameSettings; readonly usedLegacy: boolean }
  | { readonly ok: false; readonly error: string };

/**
 * The single normalisation entry point for untrusted input.
 *
 * Accepts a legacy `{ gameMode }`, a canonical `{ gameFamily, quizScoring }`,
 * or both. When both are present they must agree: a payload claiming
 * `gameMode: "herd"` alongside `gameFamily: "quiz"` is contradictory, and
 * silently preferring one of them is how a room ends up scoring a Herd game
 * with Quiz rules. Contradictions are rejected so the caller can ask the
 * client to refresh instead of guessing.
 *
 * Takes `unknown` on purpose — this runs at a trust boundary.
 */
export function normaliseGameSettings(
  input: unknown,
  fallback: GameSettings = DEFAULT_GAME_SETTINGS
): NormaliseResult {
  if (input === null || typeof input !== "object") {
    return { ok: false, error: "Game settings must be an object." };
  }

  const raw = input as Record<string, unknown>;
  const hasMode = raw.gameMode !== undefined;
  const hasFamily = raw.gameFamily !== undefined;
  const hasScoring = raw.quizScoring !== undefined;

  if (hasMode && !isGameMode(raw.gameMode)) {
    return { ok: false, error: "Unknown gameMode." };
  }
  if (hasFamily && !isGameFamily(raw.gameFamily)) {
    return { ok: false, error: "Unknown gameFamily." };
  }
  if (hasScoring && !isQuizScoring(raw.quizScoring)) {
    return { ok: false, error: "Unknown quizScoring." };
  }

  if (!hasMode && !hasFamily && !hasScoring) {
    return { ok: true, settings: fallback, usedLegacy: false };
  }

  // Canonical fields present: build from them, keeping the remembered scoring
  // when only the family was sent.
  if (hasFamily || hasScoring) {
    const settings: GameSettings = {
      gameFamily: hasFamily ? (raw.gameFamily as GameFamily) : fallback.gameFamily,
      quizScoring: hasScoring ? (raw.quizScoring as QuizScoring) : fallback.quizScoring
    };

    if (hasMode) {
      const legacy = raw.gameMode as GameMode;
      // Compare on the family axis always, and on scoring only where the
      // legacy value actually says something about it. Legacy "herd" is silent
      // about Quiz scoring, so a remembered "majority" beside it is not a
      // contradiction.
      const derived = toLegacyGameMode(settings);
      if (derived !== legacy) {
        return {
          ok: false,
          error: `Contradictory settings: gameMode "${legacy}" does not match gameFamily "${settings.gameFamily}" with quizScoring "${settings.quizScoring}".`
        };
      }
    }

    return { ok: true, settings, usedLegacy: false };
  }

  // Legacy only.
  const legacy = raw.gameMode as GameMode;
  const widened = fromLegacyGameMode(legacy);
  return {
    ok: true,
    // Legacy "herd" says nothing about Quiz scoring, so keep what the room
    // already remembered instead of resetting the host's toggle to Classic.
    settings:
      legacy === "herd"
        ? { gameFamily: "herd", quizScoring: fallback.quizScoring }
        : widened,
    usedLegacy: true
  };
}

/**
 * The compatibility view sent to clients that still read `gameMode`, and
 * stored on historical match records. Spread this into a snapshot; never
 * accept it back as a second source of truth.
 */
export function withLegacyGameMode<T extends object>(
  settings: GameSettings,
  extra: T = {} as T
): T & GameSettings & { gameMode: GameMode } {
  return { ...extra, ...settings, gameMode: toLegacyGameMode(settings) };
}

/** Human-facing name of the rule actually in force, for lobby and reveal copy. */
export function scoringLabel(settings: GameSettings): string {
  if (settings.gameFamily === "herd") return "Herd";
  return settings.quizScoring === "majority" ? "Quiz · Majority Rulez" : "Quiz · Classic";
}
