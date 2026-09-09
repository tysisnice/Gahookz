import assert from "node:assert/strict";
import test from "node:test";
import {
  GAHOOK_EFFECT_POLICIES,
  HostSettingsRequestSchema,
  HostSettingsResponseSchema,
  type GameSettings,
  type QuestionAnswerKeys,
  isClassicReady,
  questionReadinessProblem
} from "../src/index.ts";

const keys = (over: Partial<QuestionAnswerKeys> = {}): QuestionAnswerKeys => ({
  questionId: "q1",
  intendedAnswerId: null,
  authorPredictionId: null,
  ...over
});

test("a settings request carries only what changed", () => {
  assert.equal(HostSettingsRequestSchema.safeParse({}).success, true);
  assert.equal(HostSettingsRequestSchema.safeParse({ gameFamily: "herd" }).success, true);
  assert.equal(HostSettingsRequestSchema.safeParse({ gahookEffects: "visual" }).success, true);
});

test("an unknown setting is rejected, not silently ignored", () => {
  // A host who toggles something must not be told it saved when it did not.
  assert.equal(HostSettingsRequestSchema.safeParse({ allowChaosMode: true }).success, false);
  assert.equal(HostSettingsRequestSchema.safeParse({ gahookEffects: "mayhem" }).success, false);
  assert.equal(HostSettingsRequestSchema.safeParse({ promptStyle: "rude" }).success, false);
});

test("a settings request cannot smuggle credentials", () => {
  assert.equal(HostSettingsRequestSchema.safeParse({ playerKey: "k" }).success, false);
  assert.equal(HostSettingsRequestSchema.safeParse({ password: "p" }).success, false);
});

test("the quota is bounded and whole", () => {
  assert.equal(HostSettingsRequestSchema.safeParse({ maxQuestionsPerPlayer: 3 }).success, true);
  assert.equal(HostSettingsRequestSchema.safeParse({ maxQuestionsPerPlayer: -1 }).success, false);
  assert.equal(HostSettingsRequestSchema.safeParse({ maxQuestionsPerPlayer: 2.5 }).success, false);
  assert.equal(HostSettingsRequestSchema.safeParse({ maxQuestionsPerPlayer: 999 }).success, false);
});

test("the response reports what survived, so a host is never quietly robbed", () => {
  const ok = HostSettingsResponseSchema.safeParse({
    ok: true,
    settingsRevision: 4,
    retainedQuestions: { savedBank: 12, selectedForGame: 8, needingAttention: 1 }
  });
  assert.equal(ok.success, true);
  // Saved bank, selected-for-game and needs-attention are three distinct counts.
  assert.equal(HostSettingsResponseSchema.safeParse({ ok: true, settingsRevision: 1 }).success, false);
});

test("Gahook effect policy has exactly the three documented levels", () => {
  assert.deepEqual([...GAHOOK_EFFECT_POLICIES], ["off", "visual", "chaos"]);
});

test("a Classic question is not ready until a human chooses the intended answer", () => {
  const classic: GameSettings = { gameFamily: "quiz", quizScoring: "classic" };
  assert.equal(isClassicReady(keys()), false);
  assert.match(String(questionReadinessProblem(keys(), classic)), /Choose an intended answer/);
  assert.equal(questionReadinessProblem(keys({ intendedAnswerId: "a2" }), classic), null);
});

test("a Majority prediction never makes a question Classic-ready", () => {
  const classic: GameSettings = { gameFamily: "quiz", quizScoring: "classic" };
  // The prediction is the author's guess at the room, not a correct answer.
  const predicted = keys({ authorPredictionId: "a3" });
  assert.equal(isClassicReady(predicted), false);
  assert.match(String(questionReadinessProblem(predicted, classic)), /Choose an intended answer/);
});

test("Majority and Herd do not require an intended answer", () => {
  assert.equal(questionReadinessProblem(keys(), { gameFamily: "quiz", quizScoring: "majority" }), null);
  assert.equal(questionReadinessProblem(keys(), { gameFamily: "herd", quizScoring: "classic" }), null);
});
