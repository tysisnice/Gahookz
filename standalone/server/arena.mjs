import { randomUUID } from "node:crypto";

export const ARENA_LEAD_TO_WIN = 5;
export const ARENA_DURATION_MS = 45_000;
export const ARENA_TARGET_BUFFER = 12;

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
  duel.targets = {};
  duel.acceptedTargets = {};
  for (const playerId of [duel.challengerId, duel.challengedId]) {
    duel.hits[playerId] = 0;
    duel.targets[playerId] = [];
    duel.acceptedTargets[playerId] = [];
    refillTargets(duel, playerId, random, id);
  }
}

function refillTargets(duel, playerId, random, id) {
  const targets = duel.targets[playerId];
  while (targets.length < ARENA_TARGET_BUFFER) {
    targets.push(nextArenaTarget(targets.at(-1), duel.hits[playerId] + targets.length + 1, random, id));
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

  duel.targets[playerId].shift();
  duel.acceptedTargets[playerId].push(targetId);
  duel.acceptedTargets[playerId] = duel.acceptedTargets[playerId].slice(-ARENA_TARGET_BUFFER * 2);
  duel.hits[playerId]++;
  duel.revision++;
  duel.lastHit = { id: targetId, playerId, at: now };
  refillTargets(duel, playerId, random, id);
  const opponentId = duel.challengerId === playerId ? duel.challengedId : duel.challengerId;
  return { ok: true, winnerId: duel.hits[playerId] - duel.hits[opponentId] >= ARENA_LEAD_TO_WIN ? playerId : "", opponentId };
}

export function arenaProgress(duel, viewerPlayerId) {
  const isParticipant = [duel.challengerId, duel.challengedId].includes(viewerPlayerId);
  return {
    revision: duel.revision,
    endsAt: duel.endsAt,
    leadToWin: ARENA_LEAD_TO_WIN,
    hits: { ...duel.hits },
    ownTargets: isParticipant && duel.status === "active" ? duel.targets[viewerPlayerId].map(target => ({ ...target })) : [],
    isParticipant,
    viewerRole: isParticipant ? "participant" : "spectator"
  };
}
