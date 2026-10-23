import { randomUUID } from "node:crypto";

// The Gahook escalation ladder: what a Gahook turns into when they keep coming.
//
// One tap is a jump scare. Held down it becomes an Ultimate, and a long enough
// Ultimate becomes a GET GOT. A pile-on of congratulations from enough
// different people becomes an Ultimate celebration, and ten Gahooks in a row
// from one person earns the victim a Counter Gahook to fire back. All four
// rules are decided from a handful of timestamps on the player, which is what
// made them nearly untestable while they lived inside a 157-line pokePlayer in
// server.js next to the broadcast, the career counters and the payload.
//
// This module owns the decision and the counters it is made from. It owns no
// timers and sends nothing: escalateGahook reports which timer the caller must
// schedule, and server.js schedules it, because a timer has to close over the
// room table to broadcast when it fires.
//
// Every window is measured from a `now` the caller passes in, so one logical
// Gahook has one timestamp however many rules read it.

export const ULTIMATE_GAHOOK_GRACE_MS = 1000;
export const ULTIMATE_GAHOOK_BASE_THRESHOLD_MS = 5000;
export const ULTIMATE_GAHOOK_THRESHOLD_STEP_MS = 1000;
export const ULTIMATE_GAHOOK_SPAM_IDLE_MS = 1200;
export const ULTIMATE_GAHOOK_MAX_STACK = 50;
export const COUNTER_GAHOOK_TRIGGER_COUNT = 10;
export const COUNTER_GAHOOK_REPEAT_EVERY = 2;
export const COUNTER_GAHOOK_SPAM_IDLE_MS = 2200;
export const COUNTER_GAHOOK_OFFER_MS = 6500;
export const ULTIMATE_CONGRATS_GRACE_MS = 1000;
export const ULTIMATE_CONGRATS_TRIGGER_COUNT = 8;
export const ULTIMATE_CONGRATS_MIN_SENDERS = 3;
export const ULTIMATE_CONGRATS_THRESHOLD_MS = 5000;
export const ULTIMATE_CONGRATS_SPAM_IDLE_MS = 1200;
export const ULTIMATE_CONGRATS_MAX_STACK = 50;
export const GET_GOT_SCORE_PENALTY = 1000;
export const GAHOOK_STEAL_POINTS = 50;

/** The two Gahook kinds that end a game rather than interrupting one. */
const FINAL_KINDS = new Set(["congrats", "boo"]);
/** Kinds the receiver is meant to answer, so no ladder runs on them. */
const INTERACTIVE_KINDS = new Set(["counter", "duel-challenge"]);

/**
 * How long this player must now spam without a break to earn an Ultimate.
 *
 * Starts at five seconds and rises a second with every Ultimate they trigger,
 * so the second one in a game is harder than the first. Reset at the start and
 * the end of a game, never mid-game, and never capped: see
 * docs/verification/2026-10-23-gahook-extraction/README.md for what that
 * measures out to in a long lobby.
 */
export function ultimateThresholdFor(player) {
  const threshold = Number(player.ultimateGahookThresholdMs || 0);
  return threshold >= ULTIMATE_GAHOOK_BASE_THRESHOLD_MS ? threshold : ULTIMATE_GAHOOK_BASE_THRESHOLD_MS;
}

export function resetUltimateThreshold(player) {
  player.ultimateGahookThresholdMs = ULTIMATE_GAHOOK_BASE_THRESHOLD_MS;
}

/**
 * Counts this Gahook into the player's current streak.
 *
 * A gap longer than the idle window starts a new streak, so "elapsedMs" is
 * always the length of an unbroken one.
 */
export function registerGahookSpam(player, now) {
  const lastAt = player.lastGahookAt || 0;
  if (!lastAt || now - lastAt > ULTIMATE_GAHOOK_SPAM_IDLE_MS) {
    player.gahookSpamStartedAt = now;
    player.gahookSpamCount = 1;
  } else {
    player.gahookSpamStartedAt = player.gahookSpamStartedAt || lastAt || now;
    player.gahookSpamCount = (player.gahookSpamCount || 0) + 1;
  }
  player.lastGahookAt = now;
  return {
    count: player.gahookSpamCount || 1,
    elapsedMs: now - (player.gahookSpamStartedAt || now),
    thresholdMs: ultimateThresholdFor(player)
  };
}

export function resetGahookSpam(player) {
  player.gahookSpamStartedAt = 0;
  player.gahookSpamCount = 0;
  player.lastGahookAt = 0;
}

export function clearUltimateGahookState(player, resetCounter = false) {
  if (player.ultimateGahookTimer) {
    clearTimeout(player.ultimateGahookTimer);
  }
  player.ultimateGahookTimer = null;
  player.ultimateGahookUntil = 0;
  player.ultimateGahookStack = 0;
  player.ultimateGahookId = "";
  resetGahookSpam(player);
  if (resetCounter) {
    player.pokeCount = 0;
    player.latestPoke = null;
  }
}

/** Clears an Ultimate whose reset timer has not run yet. */
export function clearExpiredUltimateGahook(player, now = Date.now()) {
  if ((player.ultimateGahookUntil || 0) > 0 && player.ultimateGahookUntil <= now) {
    clearUltimateGahookState(player, true);
  }
}

/**
 * GET GOT: the end of an Ultimate that went too far.
 *
 * The penalty applies only during a live round under Chaos, so a lobby GET GOT
 * is pure theatre and moves nobody's score. Live-round GET GOT was dropped as
 * a target by the owner on 2026-10-18; the rule is kept honest here rather
 * than exercised against a live phase.
 */
export function applyGetGot(player, { liveRound = false, scoringAllowed = false } = {}) {
  let scorePenalty = 0;
  if (liveRound && scoringAllowed) {
    player.score -= GET_GOT_SCORE_PENALTY;
    scorePenalty = GET_GOT_SCORE_PENALTY;
  }
  if (player.ultimateGahookTimer) {
    clearTimeout(player.ultimateGahookTimer);
  }
  player.ultimateGahookTimer = null;
  player.ultimateGahookUntil = 0;
  player.ultimateGahookStack = 0;
  player.ultimateGahookId = "";
  player.pokeCount = 0;
  resetGahookSpam(player);
  return scorePenalty;
}

/**
 * Counts consecutive Gahooks from one sender, which is what earns a counter.
 *
 * A Gahook with no sender -- the host's, before the host has joined as a
 * player -- clears the streak, because there is nobody for the victim to fire
 * back at. Measured on 2026-10-23: that means a host joining a pile-on costs
 * the victim their earned counter; recorded as behaviour, not changed here.
 */
export function registerCounterGahookSpam(player, senderPlayerId, now) {
  if (!senderPlayerId) {
    player.counterSpamSenderId = "";
    player.counterSpamCount = 0;
    player.counterSpamLastAt = 0;
    return { count: 0 };
  }
  const sameSender = player.counterSpamSenderId === senderPlayerId;
  const withinStreak = now - (player.counterSpamLastAt || 0) <= COUNTER_GAHOOK_SPAM_IDLE_MS;
  if (!sameSender || !withinStreak) {
    player.counterSpamSenderId = senderPlayerId;
    player.counterSpamCount = 1;
  } else {
    player.counterSpamCount = (player.counterSpamCount || 0) + 1;
  }
  player.counterSpamLastAt = now;
  return { count: player.counterSpamCount };
}

export function resetCounterGahookSpam(player) {
  player.counterSpamSenderId = "";
  player.counterSpamCount = 0;
  player.counterSpamLastAt = 0;
  player.counterOffer = null;
}

/** Whether this streak length earns a counter: the tenth, then every second. */
export function counterOfferEarned(streakCount) {
  return streakCount >= COUNTER_GAHOOK_TRIGGER_COUNT &&
    (streakCount - COUNTER_GAHOOK_TRIGGER_COUNT) % COUNTER_GAHOOK_REPEAT_EVERY === 0;
}

/**
 * Counts a congratulation into the player's celebration, with its senders.
 *
 * The sender list is what separates a crowd from one person pressing fast, and
 * it is the reason an Ultimate celebration needs three different people.
 */
export function registerCongratulationsSpam(player, now, senderId = "") {
  const lastAt = player.lastCongratulationsAt || 0;
  if (!lastAt || now - lastAt > ULTIMATE_CONGRATS_SPAM_IDLE_MS) {
    player.congratulationsSpamStartedAt = now;
    player.congratulationsSpamCount = 1;
    player.congratulationsSpamSenderIds = [];
  } else {
    player.congratulationsSpamStartedAt = player.congratulationsSpamStartedAt || lastAt || now;
    player.congratulationsSpamCount = (player.congratulationsSpamCount || 0) + 1;
  }
  if (senderId && !player.congratulationsSpamSenderIds.includes(senderId)) player.congratulationsSpamSenderIds.push(senderId);
  player.lastCongratulationsAt = now;
  return {
    count: player.congratulationsSpamCount,
    senderCount: player.congratulationsSpamSenderIds.length,
    elapsedMs: now - player.congratulationsSpamStartedAt
  };
}

export function clearUltimateCongratulationsState(player, clearLatest = false) {
  if (player.ultimateCongratulationsTimer) clearTimeout(player.ultimateCongratulationsTimer);
  player.ultimateCongratulationsTimer = null;
  player.ultimateCongratulationsUntil = 0;
  player.ultimateCongratulationsStack = 0;
  player.ultimateCongratulationsId = "";
  player.congratulationsSpamStartedAt = 0;
  player.congratulationsSpamCount = 0;
  player.congratulationsSpamSenderIds = [];
  player.lastCongratulationsAt = 0;
  if (clearLatest && player.latestPoke?.kind === "ultimate-congrats") player.latestPoke = null;
}

/** What one player may know about their own Counter Gahook chance. */
export function publicCounterGahookOffer(room, player, now = Date.now()) {
  const offer = player.counterOffer;
  if (!offer || offer.expiresAt <= now) {
    player.counterOffer = null;
    return null;
  }
  const sender = room.players[offer.senderPlayerId];
  if (!sender?.connected) {
    player.counterOffer = null;
    return null;
  }
  return {
    id: offer.id,
    senderPlayerId: sender.id,
    senderName: sender.name,
    spamCount: offer.spamCount,
    expiresAt: offer.expiresAt
  };
}

/**
 * What this Gahook becomes, and what it costs.
 *
 * Decides the kind, moves the two scores a live Chaos Gahook moves, writes the
 * player's streak counters and mints a Counter Gahook offer when one is
 * earned. Returns `schedule` -- "ultimate", "congrats" or null -- naming the
 * reset timer the caller must start; nothing here touches a timer that has to
 * broadcast.
 *
 * `senderPlayer` is the sender's own record, used for the score it gains and
 * for the counter streak. `senderId` is the separate identifier the finale and
 * Arena routes pass for the celebration crowd count, which is the only rule
 * that counts a host who never joined as a player.
 */
export function escalateGahook(player, options = {}) {
  const now = Number(options.now) || Date.now();
  const specialKind = String(options.specialKind || "");
  const senderPlayer = options.senderPlayer || null;
  const liveRound = Boolean(options.liveRound);
  const scoringAllowed = Boolean(options.scoringAllowed);
  const newId = options.newId || randomUUID;
  const debug = options.debug || (() => {});
  const isFinalSpecial = FINAL_KINDS.has(specialKind);
  const isInteractiveSpecial = INTERACTIVE_KINDS.has(specialKind);
  const ordinary = !isFinalSpecial && !isInteractiveSpecial;

  const result = {
    kind: ordinary ? "normal" : specialKind,
    ultimateStack: 0,
    ultimateUntil: 0,
    scorePenalty: 0,
    pointsStolen: 0,
    schedule: null
  };

  // Theft is immediate and symmetric so the leaderboard moves on the same tick
  // the overlay lands. Chaos only, and never against yourself.
  if (ordinary && liveRound && senderPlayer?.id && senderPlayer.id !== player.id && scoringAllowed) {
    result.pointsStolen = GAHOOK_STEAL_POINTS;
    player.score = Number(player.score || 0) - result.pointsStolen;
    senderPlayer.score = Number(senderPlayer.score || 0) + result.pointsStolen;
  }

  if (specialKind === "congrats") {
    player.congratulationsCount = (player.congratulationsCount || 0) + 1;
    const celebration = registerCongratulationsSpam(player, now, options.senderId);
    const activeUltimateCongrats = (player.ultimateCongratulationsUntil || 0) > now;
    const crowdTriggered = celebration.count >= ULTIMATE_CONGRATS_TRIGGER_COUNT && celebration.senderCount >= ULTIMATE_CONGRATS_MIN_SENDERS;
    const sustainedTriggered = celebration.elapsedMs >= ULTIMATE_CONGRATS_THRESHOLD_MS && celebration.count >= 4;
    if (activeUltimateCongrats || crowdTriggered || sustainedTriggered) {
      result.kind = "ultimate-congrats";
      if (!activeUltimateCongrats) {
        player.ultimateCongratulationsId = newId();
        player.ultimateCongratulationsStack = Math.min(ULTIMATE_CONGRATS_MAX_STACK, Math.max(1, celebration.count));
      } else {
        player.ultimateCongratulationsStack = Math.min(ULTIMATE_CONGRATS_MAX_STACK, (player.ultimateCongratulationsStack || 0) + 1);
      }
      player.ultimateCongratulationsUntil = now + ULTIMATE_CONGRATS_GRACE_MS;
      result.ultimateStack = player.ultimateCongratulationsStack;
      result.ultimateUntil = player.ultimateCongratulationsUntil;
      result.schedule = "congrats";
    }
    return result;
  }

  if (!ordinary) return result;

  clearExpiredUltimateGahook(player, now);
  const spam = registerGahookSpam(player, now);
  player.pokeCount = spam.count;
  const counterSpam = registerCounterGahookSpam(player, senderPlayer?.id || "", now);
  if (senderPlayer?.id && senderPlayer.id !== player.id && counterOfferEarned(counterSpam.count)) {
    player.counterOffer = {
      id: newId(),
      senderPlayerId: senderPlayer.id,
      spamCount: counterSpam.count,
      createdAt: now,
      expiresAt: now + COUNTER_GAHOOK_OFFER_MS
    };
  }
  debug("SPAMDBG", { t: now, count: spam.count, elapsed: spam.elapsedMs, threshold: spam.thresholdMs, startedAt: player.gahookSpamStartedAt, lastAt: player.lastGahookAt });
  const activeUltimate = (player.ultimateGahookUntil || 0) > now;
  if (activeUltimate) {
    // Already Ultimate: each further Gahook stacks and pushes the end back,
    // until the stack caps out and the whole thing collapses into a GET GOT.
    result.kind = "ultimate";
    player.ultimateGahookStack = Math.min(ULTIMATE_GAHOOK_MAX_STACK, (player.ultimateGahookStack || 0) + 1);
    result.ultimateStack = player.ultimateGahookStack;
    if (result.ultimateStack >= ULTIMATE_GAHOOK_MAX_STACK) {
      result.kind = "get-got";
      result.scorePenalty = applyGetGot(player, { liveRound, scoringAllowed });
    } else {
      player.ultimateGahookUntil = now + ULTIMATE_GAHOOK_GRACE_MS;
      result.ultimateUntil = player.ultimateGahookUntil;
      result.schedule = "ultimate";
    }
  } else if (spam.elapsedMs >= spam.thresholdMs) {
    // A new Ultimate opens with the whole streak already on the counter, which
    // is why a long first streak can reach the cap within a second or two.
    result.kind = "ultimate";
    player.ultimateGahookId = newId();
    player.ultimateGahookUntil = now + ULTIMATE_GAHOOK_GRACE_MS;
    player.ultimateGahookStack = Math.min(ULTIMATE_GAHOOK_MAX_STACK, Math.max(1, spam.count));
    player.ultimateGahookThresholdMs = spam.thresholdMs + ULTIMATE_GAHOOK_THRESHOLD_STEP_MS;
    result.ultimateStack = player.ultimateGahookStack;
    if (result.ultimateStack >= ULTIMATE_GAHOOK_MAX_STACK) {
      result.kind = "get-got";
      result.scorePenalty = applyGetGot(player, { liveRound, scoringAllowed });
      result.ultimateUntil = 0;
    } else {
      result.ultimateUntil = player.ultimateGahookUntil;
      result.schedule = "ultimate";
    }
  }
  return result;
}
