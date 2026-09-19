import { randomUUID } from "node:crypto";

export const ARENA_LEAD_TO_WIN = 5;
export const ARENA_DURATION_MS = 45_000;
export const ARENA_TARGET_BUFFER = 12;

// Closing out a win costs more than opening one.
//
// Every tap used to be worth exactly one point, which made a match effectively
// decided the moment someone got three ahead. The rubber band keeps it tense:
// the last two points are the expensive ones, so a trailing player always has
// a window to pull it back.
//
// The lead passed in is the player's lead *before* the press being counted.
export function pressesRequiredAtLead(lead) {
  if (lead >= ARENA_LEAD_TO_WIN - 1) return 3; // one tug from winning
  if (lead >= ARENA_LEAD_TO_WIN - 2) return 2; // two tugs from winning
  return 1;
}

// Coordinates describe the safe centre area inside the lower-half playfield.
// Keep successive targets apart, with bounded sampling even for a fixed RNG.
export function nextArenaTarget(previous, sequence, random = Math.random, id = randomUUID) {
  let x = random();
  let y = random();
  for (let attempt = 0; previous && Math.hypot(x - previous.x, y - previous.y) < 0.38 && attempt < 12; attempt++) {
    x = random();
    y = random();
  }
  if (previous && Math.hypot(x - previous.x, y - previous.y) < 0.38) {
    x = previous.x < 0.5 ? 0.95 : 0.05;
    y = previous.y < 0.5 ? 0.95 : 0.05;
  }
  return { id: id(), sequence, x, y };
}

export function initialiseArena(duel, random = Math.random, id = randomUUID) {
  duel.revision = 1;
  duel.endsAt = duel.gameplayStartsAt + ARENA_DURATION_MS;
  duel.hits = {};
  duel.presses = {};
  duel.charge = {};
  duel.chargeLead = {};
  duel.targets = {};
  duel.acceptedTargets = {};
  for (const playerId of [duel.challengerId, duel.challengedId]) {
    duel.hits[playerId] = 0;
    duel.presses[playerId] = 0;
    duel.charge[playerId] = 0;
    duel.chargeLead[playerId] = 0;
    duel.targets[playerId] = [];
    duel.acceptedTargets[playerId] = [];
    refillTargets(duel, playerId, random, id);
  }
}

// Target sequence numbers count *presses*, not points. They used to count
// points, which was the same thing while every press scored; now that a press
// near the win may not score, numbering by points would hand out duplicate
// sequence numbers and the client would never find its next target.
function refillTargets(duel, playerId, random, id) {
  const targets = duel.targets[playerId];
  while (targets.length < ARENA_TARGET_BUFFER) {
    targets.push(nextArenaTarget(targets.at(-1), duel.presses[playerId] + targets.length + 1, random, id));
  }
}

// Mutations run synchronously in the owning room process. Acknowledgement loss
// can safely retry a token; neither replay nor another player's token scores.
export function tapArena(duel, playerId, targetId, now, random = Math.random, id = randomUUID) {
  if (![duel.challengerId, duel.challengedId].includes(playerId)) {
    return { ok: false, error: "Only the two competitors can tap in this arena." };
  }
  if (typeof targetId !== "string" || !targetId || targetId.length > 80) {
    return { ok: false, error: "Tap a valid Gahook target." };
  }
  if (duel.acceptedTargets?.[playerId]?.includes(targetId)) return { ok: true, duplicate: true };
  if (duel.status !== "active" || now >= duel.endsAt) return { ok: false, error: "That Gahook Arena match is over." };
  if (now < duel.gameplayStartsAt) return { ok: false, error: "Wait for GO before tapping." };
  if (duel.targets[playerId][0]?.id !== targetId) return { ok: false, error: "That target is out of date. Try the current Gahook." };

  const opponentId = duel.challengerId === playerId ? duel.challengedId : duel.challengerId;
  const leadBefore = duel.hits[playerId] - duel.hits[opponentId];
  const required = pressesRequiredAtLead(leadBefore);

  duel.targets[playerId].shift();
  duel.acceptedTargets[playerId].push(targetId);
  duel.acceptedTargets[playerId] = duel.acceptedTargets[playerId].slice(-ARENA_TARGET_BUFFER * 2);
  duel.presses[playerId]++;

  // Partial presses belong to the lead they were earned at.
  //
  // If the opponent scores mid-sequence the price of the next point changes
  // underneath the player, so the part-charged point is dropped rather than
  // carried over. Carrying it would let someone deliberately bank two presses
  // while three-ahead and then cash them for a point that only cost one --
  // buying a cheaper point than they actually played for. Resetting is the
  // rule that cannot be gamed in either direction, and it costs a trailing
  // player nothing, because presses only ever accumulate while ahead.
  if (duel.chargeLead[playerId] !== leadBefore) {
    duel.charge[playerId] = 0;
    duel.chargeLead[playerId] = leadBefore;
  }
  duel.charge[playerId]++;

  const scored = duel.charge[playerId] >= required;
  if (scored) {
    duel.hits[playerId]++;
    duel.charge[playerId] = 0;
    duel.chargeLead[playerId] = duel.hits[playerId] - duel.hits[opponentId];
    // Scoring moves the opponent's lead too, so their part-charged point is
    // dropped here rather than waiting for their next press to notice. The
    // stamp above would catch it either way; clearing it now keeps `charge`
    // meaning "progress toward the point currently being paid for" at every
    // instant, instead of holding a value that is only correct once re-read.
    duel.charge[opponentId] = 0;
    duel.chargeLead[opponentId] = duel.hits[opponentId] - duel.hits[playerId];
  }

  duel.revision++;
  duel.lastHit = { id: targetId, playerId, at: now, scored };
  refillTargets(duel, playerId, random, id);
  return {
    ok: true,
    scored,
    pressesRequired: required,
    pressesDone: scored ? 0 : duel.charge[playerId],
    winnerId: duel.hits[playerId] - duel.hits[opponentId] >= ARENA_LEAD_TO_WIN ? playerId : "",
    opponentId
  };
}

export function arenaProgress(duel, viewerPlayerId) {
  const isParticipant = [duel.challengerId, duel.challengedId].includes(viewerPlayerId);
  const opponentId = isParticipant
    ? (duel.challengerId === viewerPlayerId ? duel.challengedId : duel.challengerId)
    : "";
  // A part-charged point has to be visible, or a tap that does not move the
  // rope reads as a dropped input rather than as the mechanic doing its job.
  const ownLead = isParticipant ? (duel.hits[viewerPlayerId] || 0) - (duel.hits[opponentId] || 0) : 0;
  const ownCharge = isParticipant && duel.chargeLead?.[viewerPlayerId] === ownLead ? (duel.charge[viewerPlayerId] || 0) : 0;
  return {
    revision: duel.revision,
    endsAt: duel.endsAt,
    leadToWin: ARENA_LEAD_TO_WIN,
    hits: { ...duel.hits },
    ownTargets: isParticipant && duel.status === "active" ? duel.targets[viewerPlayerId].map(target => ({ ...target })) : [],
    ownPresses: isParticipant ? (duel.presses?.[viewerPlayerId] || 0) : 0,
    pressesRequired: isParticipant ? pressesRequiredAtLead(ownLead) : 1,
    pressesDone: ownCharge,
    isParticipant,
    viewerRole: isParticipant ? "participant" : "spectator"
  };
}
