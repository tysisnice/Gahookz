import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_GAME_SETTINGS,
  GameSettingsInputSchema,
  HealthResponseSchema,
  type GameSettings,
  fromLegacyGameMode,
  normaliseGameSettings,
  scoringLabel,
  toLegacyGameMode,
  withLegacyGameMode
} from "../src/index.ts";

const QUIZ_CLASSIC: GameSettings = { gameFamily: "quiz", quizScoring: "classic" };
const QUIZ_MAJORITY: GameSettings = { gameFamily: "quiz", quizScoring: "majority" };
const HERD: GameSettings = { gameFamily: "herd", quizScoring: "classic" };

test("the legacy game mode round-trips through the canonical pair", () => {
  assert.equal(toLegacyGameMode(QUIZ_CLASSIC), "quiz");
  assert.equal(toLegacyGameMode(QUIZ_MAJORITY), "majority");
  assert.equal(toLegacyGameMode(HERD), "herd");

  for (const mode of ["quiz", "majority", "herd"] as const) {
    assert.equal(toLegacyGameMode(fromLegacyGameMode(mode)), mode, mode + " must round-trip");
  }
});

test("Herd maps to herd whatever Quiz scoring is remembered", () => {
  // The host's Majority toggle keeps its position while Herd is selected; it
  // must not turn the game into a Majority game.
  assert.equal(toLegacyGameMode({ gameFamily: "herd", quizScoring: "majority" }), "herd");
});

test("legacy-only payloads widen into the canonical pair", () => {
  const quiz = normaliseGameSettings({ gameMode: "quiz" });
  assert.equal(quiz.ok, true);
  assert.deepEqual(quiz.ok && quiz.settings, QUIZ_CLASSIC);
  assert.equal(quiz.ok && quiz.usedLegacy, true);

  const majority = normaliseGameSettings({ gameMode: "majority" });
  assert.deepEqual(majority.ok && majority.settings, QUIZ_MAJORITY);
});

test("legacy herd keeps the remembered Quiz scoring rather than resetting it", () => {
  // Legacy "herd" says nothing about Quiz scoring. Overwriting the host's
  // remembered Majority choice with Classic would silently change the rules of
  // their next Quiz game.
  const result = normaliseGameSettings({ gameMode: "herd" }, QUIZ_MAJORITY);
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.settings, { gameFamily: "herd", quizScoring: "majority" });
});

test("canonical payloads are used directly, filling gaps from the remembered settings", () => {
  const familyOnly = normaliseGameSettings({ gameFamily: "herd" }, QUIZ_MAJORITY);
  assert.deepEqual(familyOnly.ok && familyOnly.settings, { gameFamily: "herd", quizScoring: "majority" });

  const scoringOnly = normaliseGameSettings({ quizScoring: "majority" }, QUIZ_CLASSIC);
  assert.deepEqual(scoringOnly.ok && scoringOnly.settings, QUIZ_MAJORITY);
});

test("an empty payload keeps the current settings", () => {
  const result = normaliseGameSettings({}, QUIZ_MAJORITY);
  assert.deepEqual(result.ok && result.settings, QUIZ_MAJORITY);
  assert.equal(result.ok && result.usedLegacy, false);
});

test("agreeing legacy and canonical fields are accepted together", () => {
  const both = normaliseGameSettings({ gameMode: "majority", gameFamily: "quiz", quizScoring: "majority" });
  assert.equal(both.ok, true);
  assert.deepEqual(both.ok && both.settings, QUIZ_MAJORITY);

  const herd = normaliseGameSettings({ gameMode: "herd", gameFamily: "herd", quizScoring: "classic" });
  assert.equal(herd.ok, true);
});

test("contradictory legacy and canonical fields are rejected, not silently resolved", () => {
  // This is the case that would otherwise score a Herd game with Quiz rules.
  const familyClash = normaliseGameSettings({ gameMode: "herd", gameFamily: "quiz" });
  assert.equal(familyClash.ok, false);
  assert.match(familyClash.ok ? "" : familyClash.error, /Contradictory/);

  const scoringClash = normaliseGameSettings({ gameMode: "majority", gameFamily: "quiz", quizScoring: "classic" });
  assert.equal(scoringClash.ok, false);

  const otherWay = normaliseGameSettings({ gameMode: "quiz", quizScoring: "majority" }, QUIZ_CLASSIC);
  assert.equal(otherWay.ok, false);
});

test("unknown or malformed values fail safely instead of defaulting", () => {
  for (const bad of [
    { gameMode: "oddball" },
    { gameFamily: "quizzz" },
    { quizScoring: "vibes" },
    { gameFamily: 7 },
    null,
    "quiz",
    undefined
  ]) {
    assert.equal(normaliseGameSettings(bad).ok, false, JSON.stringify(bad) + " must be rejected");
  }
});

test("the legacy compatibility view is derived, never a second writable truth", () => {
  const view = withLegacyGameMode(QUIZ_MAJORITY, { code: "ABCD" });
  assert.deepEqual(view, {
    code: "ABCD",
    gameFamily: "quiz",
    quizScoring: "majority",
    gameMode: "majority"
  });
  // Feeding the derived view straight back must be accepted, not flagged as a
  // contradiction with itself.
  assert.equal(normaliseGameSettings(view).ok, true);
});

test("the scoring label names the rule actually in force", () => {
  assert.equal(scoringLabel(QUIZ_CLASSIC), "Quiz · Classic");
  assert.equal(scoringLabel(QUIZ_MAJORITY), "Quiz · Majority Rulez");
  assert.equal(scoringLabel({ gameFamily: "herd", quizScoring: "majority" }), "Herd");
});

test("new rooms default to Quiz Classic", () => {
  assert.deepEqual(DEFAULT_GAME_SETTINGS, QUIZ_CLASSIC);
});

test("the settings input schema validates shape and rejects unknown keys", () => {
  assert.equal(GameSettingsInputSchema.safeParse({ gameFamily: "herd" }).success, true);
  assert.equal(GameSettingsInputSchema.safeParse({ gameMode: "quiz" }).success, true);
  assert.equal(GameSettingsInputSchema.safeParse({ gameFamily: "nope" }).success, false);
  assert.equal(GameSettingsInputSchema.safeParse({ playerKey: "secret" }).success, false);
});

// P01 step 5: the health schema was strict and narrower than the server's real
// response, so parsing a healthy server rejected it. Verified against a live
// /api/health before this was changed.
test("the health schema accepts a real server response", () => {
  const real = {
    schemaVersion: 1,
    ok: true,
    serverTime: 1_788_870_857_903,
    release: "release-17037a408d92a05a",
    builtAt: "2026-09-05T22:31:55.480Z",
    revision: "815c7e494bef",
    serverBuiltAt: "2026-09-05T22:31:16Z",
    instance: "prod-1",
    draining: false,
    activeRooms: 0,
    accountPersistence: "memory",
    googleLoginAvailable: false
  };
  assert.equal(HealthResponseSchema.safeParse(real).success, true);
});

test("the health schema still rejects leaks and malformed required fields", () => {
  const valid = {
    schemaVersion: 1,
    ok: true,
    serverTime: 1_785_000_000_000,
    release: "release-0123456789abcdef",
    builtAt: "2026-08-10T00:00:00.000Z"
  };
  assert.equal(HealthResponseSchema.safeParse(valid).success, true);
  // Tolerating known operational fields must not tolerate an unknown one.
  assert.equal(HealthResponseSchema.safeParse({ ...valid, credential: "must-not-leak" }).success, false);
  assert.equal(HealthResponseSchema.safeParse({ ...valid, serverTime: -1 }).success, false);
  assert.equal(HealthResponseSchema.safeParse({ ...valid, draining: "yes" }).success, false);
  const { release: _omitted, ...missingRelease } = valid;
  assert.equal(HealthResponseSchema.safeParse(missingRelease).success, false);
});
