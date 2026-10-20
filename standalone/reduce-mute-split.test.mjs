import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Regression guard for the backlog item ""Reduce Gahook effects" also mutes
// sound in the Lobby rules and join menu": the join-screen and Lobby rules
// switches go through useReducedEffects in app.jsx, and its setter used to
// call setEffectsMuted alongside setEffectsReducedPreference. The switch must
// set only the reduced-effects preference — sound belongs to the Mute and
// Music switches alone — so the function section is sliced and searched.
const appPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "public", "app.jsx");
const app = readFileSync(appPath, "utf8");

function useReducedEffectsSection() {
  const start = app.indexOf("function useReducedEffects(");
  assert.notEqual(start, -1, "useReducedEffects must stay a top-level function in app.jsx");
  const next = app.indexOf("\nfunction ", start + 1);
  return app.slice(start, next === -1 ? app.length : next);
}

test("useReducedEffects sets only the reduced-effects preference, never mute", () => {
  const section = useReducedEffectsSection();
  assert.ok(section.includes("setEffectsReducedPreference"), "the guard must actually see the setter's reduced-effects call");
  assert.ok(!section.includes("setEffectsMuted"), "useReducedEffects must not call setEffectsMuted; the Mute and Music switches own sound");
});
