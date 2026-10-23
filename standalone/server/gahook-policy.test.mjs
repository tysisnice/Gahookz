import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  DEFAULT_GAHOOK_EFFECTS,
  GAHOOK_EFFECTS_OFF_ERROR,
  GAHOOK_EFFECT_POLICIES,
  GAHOOK_ROUTE_SWITCHES,
  LOBBY_ARENA_OFF_ERROR,
  claimQuestionGahookUse,
  gahookEffectsPolicy,
  gahookRouteRefusal,
  gahookScoringAllowed,
  lobbyArenaEnabled,
  publicOwnGahookUses,
  releaseQuestionGahookUse
} from "./gahook-policy.mjs";

const room = (overrides = {}) => ({ gahookEffects: "chaos", players: {}, game: { currentQuestionIndex: 0, pokeUses: {} }, ...overrides });

// --- the host's four policies ----------------------------------------------

test("a room with no policy set behaves exactly as every room did before the setting existed", () => {
  assert.equal(gahookEffectsPolicy({}), "chaos");
  assert.equal(gahookEffectsPolicy({ gahookEffects: "mayhem" }), DEFAULT_GAHOOK_EFFECTS, "a policy the server does not know is not a policy");
  assert.equal(gahookEffectsPolicy(null), DEFAULT_GAHOOK_EFFECTS);
  assert.equal(gahookScoringAllowed({}), true);
});

test("only Chaos may move a score", () => {
  const scoring = GAHOOK_EFFECT_POLICIES.filter((policy) => gahookScoringAllowed({ gahookEffects: policy }));
  assert.deepEqual(scoring, ["chaos"], "Mini and Visual only are cosmetic; Off sends nothing at all");
});

test("lobby duels are on unless the host says otherwise", () => {
  assert.equal(lobbyArenaEnabled({}), true);
  assert.equal(lobbyArenaEnabled({ lobbyArenaEnabled: false }), false);
  assert.equal(lobbyArenaEnabled({ lobbyArenaEnabled: "no" }), true, "only a real false turns duels off");
});

// --- which switch owns which route -----------------------------------------

test("Off refuses every route that can land a Gahook, whoever sends it", () => {
  const off = room({ gahookEffects: "off" });
  for (const [path, owner] of GAHOOK_ROUTE_SWITCHES) {
    if (owner !== "effects") continue;
    assert.deepEqual(gahookRouteRefusal(off, path), { ok: false, error: GAHOOK_EFFECTS_OFF_ERROR }, path + " must be refused while Gahooks are off");
  }
});

test("the crowd's Arena congratulations and boos are Gahooks like any other", () => {
  // 2026-10-23: they were not. /api/player/duel-react was missing from the
  // hand-written route set, so in a room with effects off a spectator could
  // still land a "congrats"/"ARENA CHAMPION" and a "boo"/"GET GOT" overlay on
  // the two duellists -- the same two kinds /api/player/final-poke refused in
  // the same room, measured over HTTP before this was fixed.
  assert.equal(GAHOOK_ROUTE_SWITCHES.get("/api/player/duel-react"), "effects");
  assert.deepEqual(
    gahookRouteRefusal(room({ gahookEffects: "off" }), "/api/player/duel-react"),
    { ok: false, error: GAHOOK_EFFECTS_OFF_ERROR }
  );
});

test("the Arena's own challenge follows the Arena switch, not the effects policy", () => {
  assert.equal(GAHOOK_ROUTE_SWITCHES.get("/api/player/duel-challenge"), "arena");
  assert.equal(gahookRouteRefusal(room({ gahookEffects: "off" }), "/api/player/duel-challenge"), null, "a challenge is how a duel is announced at all");
  assert.deepEqual(
    gahookRouteRefusal(room({ lobbyArenaEnabled: false }), "/api/player/duel-challenge"),
    { ok: false, error: LOBBY_ARENA_OFF_ERROR }
  );
});

test("the three permissive policies refuse nothing, and other routes are none of this table's business", () => {
  for (const policy of ["chaos", "visual", "mini"]) {
    for (const path of GAHOOK_ROUTE_SWITCHES.keys()) {
      assert.equal(gahookRouteRefusal(room({ gahookEffects: policy }), path), null, path + " under " + policy);
    }
  }
  assert.equal(gahookRouteRefusal(room({ gahookEffects: "off", lobbyArenaEnabled: false }), "/api/player/join"), null);
});

// --- the table cannot quietly miss a route ---------------------------------

/**
 * Every top-level function in server.js, with its body.
 *
 * The parameter list is skipped before the body is found, because a default
 * like `context = {}` otherwise looks like the opening brace of the body.
 */
function serverFunctionBodies(source) {
  const bodies = new Map();
  for (const declaration of source.matchAll(/^(?:async )?function ([A-Za-z_$][\w$]*)\s*\(/gm)) {
    let index = source.indexOf("(", declaration.index);
    let depth = 0;
    for (; index < source.length; index += 1) {
      if (source[index] === "(") depth += 1;
      else if (source[index] === ")") { depth -= 1; if (depth === 0) break; }
    }
    const open = source.indexOf("{", index);
    depth = 0;
    let end = open;
    for (; end < source.length; end += 1) {
      if (source[end] === "{") depth += 1;
      else if (source[end] === "}") { depth -= 1; if (depth === 0) break; }
    }
    bodies.set(declaration[1], source.slice(open, end + 1));
  }
  return bodies;
}

const calledIn = (text) => new Set([...text.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map((call) => call[1]));

test("every route that can send a Gahook is in the table, with a switch named", () => {
  // The rule this protects is the one that broke: a hand-written list of URL
  // paths has to be kept in step with the set of handlers that actually reach
  // pokePlayer, and nothing checked that it was. So rather than restate the
  // list, this walks server.js's own call graph -- which functions reach
  // pokePlayer, and which route dispatches to one of them -- and compares the
  // answer with the table. Adding a Gahook-sending route without a switch
  // fails here.
  const source = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
  const bodies = serverFunctionBodies(source);
  assert.ok(bodies.has("pokePlayer"), "pokePlayer should still be a top-level function in server.js");

  const reaching = new Set(["pokePlayer"]);
  for (let changed = true; changed;) {
    changed = false;
    for (const [name, body] of bodies) {
      if (reaching.has(name)) continue;
      if ([...calledIn(body)].some((called) => reaching.has(called))) {
        reaching.add(name);
        changed = true;
      }
    }
  }
  // The dispatchers reach every handler by definition, which says nothing
  // about any one route.
  const dispatchers = ["handleAction", "handleRoomAction"];
  for (const dispatcher of dispatchers) {
    assert.ok(reaching.delete(dispatcher), dispatcher + " should dispatch to a Gahook route");
  }
  assert.ok(reaching.size >= 8 && reaching.size <= 16, "the call graph should be a handful of handlers, not the whole file: " + reaching.size);

  const sending = new Set();
  let inspected = 0;
  for (const dispatcher of dispatchers) {
    const body = bodies.get(dispatcher);
    const routes = [...body.matchAll(/pathname === "([^"]+)"/g)];
    inspected += routes.length;
    for (const [index, route] of routes.entries()) {
      const stop = index + 1 < routes.length ? routes[index + 1].index : body.length;
      if ([...calledIn(body.slice(route.index, stop))].some((called) => reaching.has(called))) sending.add(route[1]);
    }
  }
  assert.ok(inspected > 40, "the walk should have found the whole route table, not a fragment: " + inspected);

  assert.deepEqual(
    [...sending].sort(),
    [...GAHOOK_ROUTE_SWITCHES.keys()].sort(),
    "a route that reaches pokePlayer and is not in GAHOOK_ROUTE_SWITCHES answers to no switch at all"
  );

  // Being in the table is not enough: a route dispatched before the gate runs
  // would bypass it just as quietly as one that was never listed.
  const dispatcher = bodies.get("handleRoomAction");
  const gate = dispatcher.indexOf("gahookRouteRefusal(room, pathname)");
  assert.ok(gate > 0, "handleRoomAction should call the one Gahook policy gate");
  for (const path of GAHOOK_ROUTE_SWITCHES.keys()) {
    const dispatched = dispatcher.indexOf('pathname === "' + path + '"');
    assert.ok(dispatched > 0, path + " should be dispatched by handleRoomAction");
    assert.ok(dispatched > gate, path + " is dispatched before the policy gate runs, so the gate cannot refuse it");
  }
});

// --- one Gahook per question ------------------------------------------------

test("a sender gets one Gahook per question, whoever they aim it at", () => {
  const live = room({ players: { victim: { id: "victim" }, other: { id: "other" } } });
  const first = claimQuestionGahookUse(live, "sender", "victim");
  assert.deepEqual(first, { ok: true, key: "question:0:sender", targetId: "victim" });
  const second = claimQuestionGahookUse(live, "sender", "other");
  assert.equal(second.ok, false);
  assert.match(second.error, /already used your Gahook/);
  assert.equal(second.usedTargetId, "victim", "the client is told who they spent it on");
});

test("the next question is a new Gahook for everybody", () => {
  const live = room({ players: { victim: { id: "victim" } } });
  claimQuestionGahookUse(live, "sender", "victim");
  live.game.currentQuestionIndex = 1;
  assert.equal(claimQuestionGahookUse(live, "sender", "victim").ok, true);
});

test("one sender's claim is not another's", () => {
  const live = room({ players: { victim: { id: "victim" } } });
  claimQuestionGahookUse(live, "sender", "victim");
  assert.equal(claimQuestionGahookUse(live, "someone-else", "victim").ok, true);
});

test("a Gahook that was refused gives the claim back", () => {
  const live = room({ players: { victim: { id: "victim" } } });
  const claim = claimQuestionGahookUse(live, "sender", "victim");
  releaseQuestionGahookUse(live, claim.key);
  assert.equal(claimQuestionGahookUse(live, "sender", "victim").ok, true, "a refused Gahook must not spend the sender's turn");
});

test("releasing nothing is harmless", () => {
  const live = room();
  assert.equal(releaseQuestionGahookUse(live, ""), false);
  assert.equal(releaseQuestionGahookUse({ game: {} }, "question:0:sender"), false);
});

test("nobody claims a Gahook without a target", () => {
  const live = room();
  assert.equal(claimQuestionGahookUse(live, "sender", "").ok, false);
  assert.equal(claimQuestionGahookUse(live, "", "victim").ok, false);
  assert.deepEqual(live.game.pokeUses, {}, "a refused claim must not be recorded");
});

test("a player sees their own claim and its one target under all three names", () => {
  const live = room({ players: { victim: { id: "victim" } } });
  claimQuestionGahookUse(live, "sender", "victim");
  assert.deepEqual(publicOwnGahookUses(live, "sender"), {
    question: ["victim"],
    questionTargetId: "victim",
    round: ["victim"],
    reveal: ["victim"]
  });
  assert.deepEqual(publicOwnGahookUses(live, "someone-else"), { question: [], questionTargetId: "", round: [], reveal: [] });
});

test("a claim spent on somebody who has since left reads as unspent", () => {
  const live = room({ players: {} });
  claimQuestionGahookUse(live, "sender", "ghost");
  assert.deepEqual(publicOwnGahookUses(live, "sender").question, [], "the client cannot show a card that is not there");
});
