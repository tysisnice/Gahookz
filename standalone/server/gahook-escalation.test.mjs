import assert from "node:assert/strict";
import test from "node:test";
import {
  COUNTER_GAHOOK_OFFER_MS,
  COUNTER_GAHOOK_SPAM_IDLE_MS,
  GAHOOK_STEAL_POINTS,
  GET_GOT_SCORE_PENALTY,
  ULTIMATE_GAHOOK_BASE_THRESHOLD_MS,
  ULTIMATE_GAHOOK_GRACE_MS,
  ULTIMATE_GAHOOK_MAX_STACK,
  ULTIMATE_GAHOOK_SPAM_IDLE_MS,
  applyGetGot,
  clearExpiredUltimateGahook,
  clearUltimateCongratulationsState,
  clearUltimateGahookState,
  counterOfferEarned,
  escalateGahook,
  publicCounterGahookOffer,
  registerCongratulationsSpam,
  registerCounterGahookSpam,
  registerGahookSpam,
  resetUltimateThreshold,
  ultimateThresholdFor
} from "./gahook-escalation.mjs";

// Every rule in this subsystem is a window measured in milliseconds, which is
// why it was only ever exercised by a smoke script with real sleeps: the first
// Ultimate alone costs the suite five seconds of wall clock, and the ramp past
// it costs more every time. With the clock passed in, the whole ladder is
// reachable in microseconds and the cases nobody could afford to run -- what
// the fourth Ultimate in one lobby costs, what one millisecond either side of
// a streak boundary does -- are ordinary tests.

const T = 1_000_000;
let ids = 0;
const newId = () => "id-" + ++ids;

function player(overrides = {}) {
  return {
    id: "target",
    name: "Target",
    score: 0,
    connected: true,
    pokeCount: 0,
    latestPoke: null,
    shamePokes: 0,
    congratulationsCount: 0,
    congratulationsSpamStartedAt: 0,
    congratulationsSpamCount: 0,
    congratulationsSpamSenderIds: [],
    lastCongratulationsAt: 0,
    ultimateCongratulationsUntil: 0,
    ultimateCongratulationsStack: 0,
    ultimateCongratulationsId: "",
    ultimateCongratulationsTimer: null,
    ultimateGahookUntil: 0,
    ultimateGahookStack: 0,
    ultimateGahookId: "",
    ultimateGahookTimer: null,
    ultimateGahookThresholdMs: ULTIMATE_GAHOOK_BASE_THRESHOLD_MS,
    gahookSpamStartedAt: 0,
    gahookSpamCount: 0,
    lastGahookAt: 0,
    counterSpamSenderId: "",
    counterSpamCount: 0,
    counterSpamLastAt: 0,
    counterOffer: null,
    ...overrides
  };
}

const sender = (id = "sender") => player({ id, name: "Sender" });

/** One ordinary Gahook from `from` at `now`. */
const poke = (target, now, options = {}) =>
  escalateGahook(target, { now, senderPlayer: options.senderPlayer ?? sender(), newId, ...options });

/**
 * An unbroken streak: one Gahook every `stepMs` from `startAt` until
 * `durationMs` has passed. The step stays inside the idle window, because a
 * single gap wider than that restarts the clock -- which is the rule that
 * makes "five seconds of spam" mean five seconds of *continuous* spam.
 */
function streak(target, startAt, durationMs, options = {}) {
  const step = options.stepMs || 1000;
  let result = null;
  for (let elapsed = 0; elapsed <= durationMs; elapsed += step) {
    result = poke(target, startAt + elapsed, options);
  }
  return result;
}

// --- one tap ----------------------------------------------------------------

test("a single Gahook is a plain one that costs nothing", () => {
  const target = player();
  const result = poke(target, T);
  assert.equal(result.kind, "normal");
  assert.equal(result.ultimateStack, 0);
  assert.equal(result.ultimateUntil, 0);
  assert.equal(result.scorePenalty, 0);
  assert.equal(result.pointsStolen, 0);
  assert.equal(result.schedule, null);
  assert.equal(target.pokeCount, 1);
});

test("a live Chaos Gahook moves exactly fifty points, both ways", () => {
  const target = player({ score: 120 });
  const villain = sender();
  const result = poke(target, T, { senderPlayer: villain, liveRound: true, scoringAllowed: true });
  assert.equal(result.pointsStolen, GAHOOK_STEAL_POINTS);
  assert.equal(target.score, 120 - GAHOOK_STEAL_POINTS);
  assert.equal(villain.score, GAHOOK_STEAL_POINTS);
});

test("the same Gahook moves nothing under Visual only, Mini or Off", () => {
  for (const scoringAllowed of [false]) {
    const target = player({ score: 120 });
    const villain = sender();
    const result = poke(target, T, { senderPlayer: villain, liveRound: true, scoringAllowed });
    assert.equal(result.pointsStolen, 0);
    assert.equal(target.score, 120);
    assert.equal(villain.score, 0);
  }
});

test("a lobby Gahook moves nothing even under Chaos", () => {
  const target = player({ score: 120 });
  const result = poke(target, T, { liveRound: false, scoringAllowed: true });
  assert.equal(result.pointsStolen, 0);
  assert.equal(target.score, 120);
});

test("nobody can steal from themselves", () => {
  const self = player({ id: "same", score: 100 });
  const result = escalateGahook(self, { now: T, senderPlayer: self, liveRound: true, scoringAllowed: true, newId });
  assert.equal(result.pointsStolen, 0);
  assert.equal(self.score, 100);
});

// --- the streak -------------------------------------------------------------

test("the windows a player feels are the ones the wiki publishes", () => {
  // Written as literals on purpose. A test that measures a window with the
  // constant that defines it proves the relationship and not the number, and
  // moves silently when somebody changes it: that is how the mutation "a
  // streak never breaks" survived the first run of this file.
  assert.equal(ULTIMATE_GAHOOK_SPAM_IDLE_MS, 1200, "1.2 s between Gahooks to hold a streak");
  assert.equal(ULTIMATE_GAHOOK_BASE_THRESHOLD_MS, 5000, "5 s of streak for an Ultimate");
  assert.equal(ULTIMATE_GAHOOK_GRACE_MS, 1000, "1 s of Ultimate after the last Gahook");
  assert.equal(ULTIMATE_GAHOOK_MAX_STACK, 50, "50 on the stack is a GET GOT");
  assert.equal(COUNTER_GAHOOK_SPAM_IDLE_MS, 2200, "2.2 s between Gahooks to hold a counter streak");
  assert.equal(COUNTER_GAHOOK_OFFER_MS, 6500, "6.5 s to use a counter");
  assert.equal(GAHOOK_STEAL_POINTS, 50);
  assert.equal(GET_GOT_SCORE_PENALTY, 1000);
});

test("a gap longer than the idle window starts the streak again", () => {
  const target = player();
  registerGahookSpam(target, T);
  const held = registerGahookSpam(target, T + 1200);
  assert.equal(held.count, 2, "1.2 s exactly is still one streak");
  const broken = registerGahookSpam(target, T + 1200 + 1201);
  assert.equal(broken.count, 1, "1.201 s is a new streak");
  assert.equal(broken.elapsedMs, 0);
});

// --- Ultimate ---------------------------------------------------------------

test("five unbroken seconds of Gahooks become an Ultimate", () => {
  const target = player();
  const short = streak(target, T, ULTIMATE_GAHOOK_BASE_THRESHOLD_MS - 1000);
  assert.equal(short.kind, "normal", "four seconds is still a plain Gahook");
  const oneShort = poke(target, T + ULTIMATE_GAHOOK_BASE_THRESHOLD_MS - 1);
  assert.equal(oneShort.kind, "normal", "one millisecond short of the threshold is still a plain Gahook");
  const result = poke(target, T + ULTIMATE_GAHOOK_BASE_THRESHOLD_MS);
  assert.equal(result.kind, "ultimate");
  assert.equal(result.ultimateUntil, T + ULTIMATE_GAHOOK_BASE_THRESHOLD_MS + ULTIMATE_GAHOOK_GRACE_MS, "an Ultimate lasts a second past the last Gahook");
  assert.equal(result.schedule, "ultimate", "the caller is told to start the reset timer");
});

test("one wide enough gap and the five seconds start again", () => {
  const target = player();
  streak(target, T, 4000);
  // A pause of 1.3 s, then four more seconds. Literal, so the pause stays a
  // pause even if somebody widens the idle window.
  const resumed = streak(target, T + 4000 + 1300, 4000);
  assert.equal(resumed.kind, "normal", "eight seconds of Gahooks with one pause in them is not an Ultimate");
  assert.equal(target.gahookSpamStartedAt, T + 4000 + 1300);
});

test("a new Ultimate opens with the whole streak already on the counter", () => {
  const target = player();
  for (let i = 0; i < 40; i += 1) poke(target, T + i * 125);
  const result = poke(target, T + 5000);
  assert.equal(result.kind, "ultimate");
  assert.equal(result.ultimateStack, 41, "41 Gahooks in the streak, 41 on the stack");
});

test("every Gahook during an Ultimate stacks and pushes the end back", () => {
  const target = player();
  const triggered = streak(target, T, ULTIMATE_GAHOOK_BASE_THRESHOLD_MS);
  assert.equal(triggered.kind, "ultimate");
  const extended = poke(target, T + ULTIMATE_GAHOOK_BASE_THRESHOLD_MS + 500);
  assert.equal(extended.kind, "ultimate");
  assert.equal(extended.ultimateStack, triggered.ultimateStack + 1);
  assert.equal(extended.ultimateUntil, T + ULTIMATE_GAHOOK_BASE_THRESHOLD_MS + 500 + ULTIMATE_GAHOOK_GRACE_MS);
  assert.equal(extended.schedule, "ultimate", "the reset timer has to be pushed back with it, or the overlay ends early");
});

test("each Ultimate makes the next one a second harder, without a ceiling", () => {
  const target = player();
  const thresholds = [];
  let now = T;
  for (let round = 0; round < 4; round += 1) {
    const needed = ultimateThresholdFor(target);
    thresholds.push(needed);
    const triggered = streak(target, now, needed);
    assert.equal(triggered.kind, "ultimate", "round " + round + " should reach an Ultimate");
    // The Ultimate lapses, which is what resets the streak clock in a real
    // room: finishUltimateGahook clears the state when its timer fires.
    clearUltimateGahookState(target, true);
    now += needed + ULTIMATE_GAHOOK_GRACE_MS + 1;
  }
  assert.deepEqual(thresholds, [5000, 6000, 7000, 8000]);
  assert.equal(ultimateThresholdFor(target), 9000, "the fifth needs nine unbroken seconds");
  resetUltimateThreshold(target);
  assert.equal(ultimateThresholdFor(target), ULTIMATE_GAHOOK_BASE_THRESHOLD_MS, "a new game starts everybody level again");
});

test("an Ultimate whose timer has not run yet is treated as over", () => {
  const target = player({ ultimateGahookUntil: T - 1, ultimateGahookStack: 9, ultimateGahookId: "stale", latestPoke: { kind: "ultimate" } });
  clearExpiredUltimateGahook(target, T);
  assert.equal(target.ultimateGahookUntil, 0);
  assert.equal(target.ultimateGahookStack, 0);
  assert.equal(target.latestPoke, null);
});

// --- GET GOT ----------------------------------------------------------------

test("the Ultimate stack caps out as a GET GOT and clears everything", () => {
  const target = player({ score: 300 });
  let now = T + ULTIMATE_GAHOOK_BASE_THRESHOLD_MS;
  let result = streak(target, T, ULTIMATE_GAHOOK_BASE_THRESHOLD_MS);
  assert.equal(result.kind, "ultimate");
  while (result.kind === "ultimate") {
    now += 100;
    result = poke(target, now);
  }
  assert.equal(result.kind, "get-got");
  assert.equal(result.ultimateStack, ULTIMATE_GAHOOK_MAX_STACK);
  assert.equal(result.schedule, null, "a GET GOT has no reset timer to start: it is already over");
  assert.equal(target.ultimateGahookUntil, 0);
  assert.equal(target.ultimateGahookStack, 0);
  assert.equal(target.pokeCount, 0);
  assert.equal(target.gahookSpamCount, 0, "the streak clock restarts, so the next Ultimate is a fresh climb");
});

test("a lobby GET GOT is theatre and moves nobody's score", () => {
  const target = player({ score: 300 });
  const penalty = applyGetGot(target, { liveRound: false, scoringAllowed: true });
  assert.equal(penalty, 0);
  assert.equal(target.score, 300);
});

test("a live Chaos GET GOT is the thousand-point one", () => {
  // Live-round GET GOT is not a target any more (owner decision, 2026-10-18);
  // the rule is pinned here so dropping its live coverage did not leave it
  // undefined.
  const target = player({ score: 300 });
  const penalty = applyGetGot(target, { liveRound: true, scoringAllowed: true });
  assert.equal(penalty, GET_GOT_SCORE_PENALTY);
  assert.equal(target.score, 300 - GET_GOT_SCORE_PENALTY);
});

test("a live GET GOT under Visual only costs nothing", () => {
  const target = player({ score: 300 });
  assert.equal(applyGetGot(target, { liveRound: true, scoringAllowed: false }), 0);
  assert.equal(target.score, 300);
});

// --- Counter Gahooks --------------------------------------------------------

test("a counter is earned on the tenth, then on every second one", () => {
  const earned = [];
  for (let streak = 1; streak <= 16; streak += 1) if (counterOfferEarned(streak)) earned.push(streak);
  assert.deepEqual(earned, [10, 12, 14, 16]);
});

test("ten in a row from one person earns the victim a counter", () => {
  const target = player();
  const villain = sender();
  let result = null;
  for (let i = 1; i <= 10; i += 1) result = poke(target, T + i * 200, { senderPlayer: villain });
  assert.ok(target.counterOffer, "the tenth should mint an offer");
  assert.equal(target.counterOffer.senderPlayerId, villain.id);
  assert.equal(target.counterOffer.spamCount, 10);
  assert.equal(target.counterOffer.expiresAt, T + 10 * 200 + COUNTER_GAHOOK_OFFER_MS);
  assert.equal(result.kind, "normal", "earning a counter is not itself an escalation");
});

test("a different sender in the middle restarts the counter streak", () => {
  const target = player();
  const villain = sender("villain");
  for (let i = 1; i <= 9; i += 1) poke(target, T + i * 200, { senderPlayer: villain });
  poke(target, T + 10 * 200, { senderPlayer: sender("somebody-else") });
  poke(target, T + 11 * 200, { senderPlayer: villain });
  assert.equal(target.counterOffer, null, "the ninth plus one from somebody else is not ten from one person");
  assert.equal(target.counterSpamCount, 1);
});

test("a Gahook with no sender clears the streak outright", () => {
  // This is the host's Gahook before the host has joined as a player: there
  // is nobody for the victim to fire back at. Measured over HTTP on
  // 2026-10-23: nine from one player, one from an unjoined host, and the
  // tenth, eleventh and twelfth earn nothing. Recorded, not changed.
  const target = player();
  const villain = sender("villain");
  for (let i = 1; i <= 9; i += 1) poke(target, T + i * 200, { senderPlayer: villain });
  assert.equal(target.counterSpamCount, 9);
  const cleared = registerCounterGahookSpam(target, "", T + 10 * 200);
  assert.equal(cleared.count, 0);
  assert.equal(target.counterSpamSenderId, "");
  for (let i = 11; i <= 13; i += 1) poke(target, T + i * 200, { senderPlayer: villain });
  assert.equal(target.counterOffer, null);
});

test("a long enough pause between Gahooks is not a streak", () => {
  const target = player();
  const villain = sender();
  for (let i = 1; i <= 9; i += 1) poke(target, T + i * 200, { senderPlayer: villain });
  poke(target, T + 9 * 200 + 2300, { senderPlayer: villain });
  assert.equal(target.counterOffer, null, "2.3 s of quiet and the tenth is a first, not a tenth");
  assert.equal(target.counterSpamCount, 1);
});

test("a counter offer is withdrawn once it expires or its sender leaves", () => {
  const villain = sender("villain");
  const target = player({ counterOffer: { id: "offer", senderPlayerId: "villain", spamCount: 10, createdAt: T, expiresAt: T + 100 } });
  const room = { players: { villain, target } };
  assert.equal(publicCounterGahookOffer(room, target, T)?.senderName, "Sender");
  assert.equal(publicCounterGahookOffer(room, target, T + 100), null, "an expired offer is gone");
  assert.equal(target.counterOffer, null, "and is cleared off the player, not left to reappear");

  const live = player({ counterOffer: { id: "offer", senderPlayerId: "villain", spamCount: 10, createdAt: T, expiresAt: T + 100 } });
  villain.connected = false;
  assert.equal(publicCounterGahookOffer({ players: { villain, live } }, live, T), null, "there is nobody left to counter");
});

// --- Ultimate congratulations ----------------------------------------------

test("eight congratulations from three different people are an Ultimate celebration", () => {
  const winner = player();
  let result = null;
  for (let i = 1; i <= 8; i += 1) {
    result = escalateGahook(winner, { now: T + i * 100, specialKind: "congrats", senderId: "fan-" + (i % 3), newId });
  }
  assert.equal(result.kind, "ultimate-congrats");
  assert.equal(result.schedule, "congrats");
  assert.equal(winner.congratulationsCount, 8);
});

test("eight congratulations from two people are not a crowd", () => {
  const winner = player();
  let result = null;
  for (let i = 1; i <= 8; i += 1) {
    result = escalateGahook(winner, { now: T + i * 100, specialKind: "congrats", senderId: "fan-" + (i % 2), newId });
  }
  assert.equal(result.kind, "congrats", "two people pressing fast is not three people");
});

test("one person celebrating for five seconds gets there the slow way", () => {
  const winner = player();
  let result = null;
  for (let i = 0; i <= 5; i += 1) {
    result = escalateGahook(winner, { now: T + i * 1000, specialKind: "congrats", senderId: "loyal-fan", newId });
  }
  assert.equal(result.kind, "ultimate-congrats", "five sustained seconds is the second way in");
});

test("a congratulation never steals points, even live under Chaos", () => {
  const winner = player({ score: 500 });
  const fan = sender();
  const result = escalateGahook(winner, { now: T, specialKind: "congrats", senderId: fan.id, senderPlayer: fan, liveRound: true, scoringAllowed: true, newId });
  assert.equal(result.pointsStolen, 0);
  assert.equal(winner.score, 500);
});

test("a celebration pile-on does not count as a Gahook streak", () => {
  const winner = player();
  for (let i = 1; i <= 20; i += 1) escalateGahook(winner, { now: T + i * 100, specialKind: "congrats", senderId: "fan-" + (i % 3), newId });
  assert.equal(winner.pokeCount, 0, "congratulations must never push somebody towards a GET GOT");
  assert.equal(winner.gahookSpamCount, 0);
});

test("clearing a celebration takes the overlay with it, but only that kind", () => {
  const winner = player({ latestPoke: { kind: "ultimate-congrats" }, ultimateCongratulationsStack: 4 });
  clearUltimateCongratulationsState(winner, true);
  assert.equal(winner.latestPoke, null);
  assert.equal(winner.ultimateCongratulationsStack, 0);
  const booed = player({ latestPoke: { kind: "boo" } });
  clearUltimateCongratulationsState(booed, true);
  assert.deepEqual(booed.latestPoke, { kind: "boo" }, "a boo is not a celebration to clear");
});

test("the sender list is what the crowd count is made of", () => {
  const winner = player();
  registerCongratulationsSpam(winner, T, "fan-a");
  registerCongratulationsSpam(winner, T + 50, "fan-a");
  const second = registerCongratulationsSpam(winner, T + 100, "fan-b");
  assert.equal(second.count, 3);
  assert.equal(second.senderCount, 2, "the same person twice is one person");
});

// --- the interactive kinds pass straight through ---------------------------

test("a counter and an Arena challenge escalate into nothing", () => {
  for (const specialKind of ["counter", "duel-challenge"]) {
    const target = player();
    const result = escalateGahook(target, { now: T, specialKind, senderPlayer: sender(), liveRound: true, scoringAllowed: true, newId });
    assert.equal(result.kind, specialKind);
    assert.equal(result.pointsStolen, 0, specialKind + " must not move a score");
    assert.equal(target.pokeCount, 0, specialKind + " must not count towards an Ultimate");
    assert.equal(target.counterSpamCount, 0, specialKind + " must not count towards a counter");
  }
});

test("a boo is counted nowhere", () => {
  const target = player({ score: 10 });
  const result = escalateGahook(target, { now: T, specialKind: "boo", senderId: "fan", senderPlayer: sender(), liveRound: true, scoringAllowed: true, newId });
  assert.equal(result.kind, "boo");
  assert.equal(target.score, 10);
  assert.equal(target.pokeCount, 0);
  assert.equal(target.congratulationsCount, 0);
});
