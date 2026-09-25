import crypto from "node:crypto";

// Host presence: what happens to a room when its people drop off.
//
// Rooms live only inside this process, so "lost" used to mean "deleted": the
// moment the last live connection closed after the host had ever connected,
// the room was gone. A host who refreshed slowly, switched apps or walked into
// a lift ended the party for everyone. Two rules replace that:
//
//   1. A room whose last live connection closes is kept for a grace period
//      (default one minute) before it is reaped. Anybody reconnecting inside
//      it cancels the reaping and the room carries on where it was.
//   2. When the host's own live connection closes, a host-away clock of the
//      same length starts. If it runs out while a player is connected, the
//      host role passes to the earliest-joined connected player, exactly as a
//      manual "Make host" would. A host who returns first cancels it.
//
// Timers are owned by server.js because they close over the room table; this
// module holds the decisions so they can be unit tested without a server.

export const DEFAULT_ROOM_ABANDON_GRACE_MS = 60_000;
// The floor matches the room-expiry floor so the regression test can observe a
// full cycle quickly; the ceiling stops a typo from pinning dead rooms, which
// each hold one of the process's room slots, for an hour.
export const MIN_ROOM_ABANDON_GRACE_MS = 250;
export const MAX_ROOM_ABANDON_GRACE_MS = 10 * 60_000;
// How long every client is told "<name> is now the host" after a change.
export const HOST_CHANGE_NOTICE_MS = 10_000;

/** Parses GAHOOKZ_ROOM_ABANDON_GRACE_MS. Missing, zero or garbage means the default. */
export function resolveRoomAbandonGraceMs(value) {
  const requested = Number(value) || DEFAULT_ROOM_ABANDON_GRACE_MS;
  return Math.round(Math.min(MAX_ROOM_ABANDON_GRACE_MS, Math.max(MIN_ROOM_ABANDON_GRACE_MS, requested)));
}

/** Constant-time comparison for two credentials; empty never matches. */
export function sameCredential(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** The state recorded when the host's last live connection closes. */
export function hostAwayState({ now, graceMs, hostName = "" }) {
  return {
    since: now,
    promoteAt: now + graceMs,
    hostName: String(hostName || "").slice(0, 24)
  };
}

export function isPromotionDue(hostAway, now) {
  return Boolean(hostAway) && now >= hostAway.promoteAt;
}

/**
 * Who inherits the room when the host does not come back.
 *
 * The earliest-joined player who is connected right now and passes
 * `isEligible` (server.js requires a live stream, a credential that is not the
 * current host's and not banned). Join order rather than "longest connected"
 * because it is stable: a refresh does not move somebody to the back of the
 * queue, and everybody can see the order in the player list.
 */
export function chooseHostSuccessor(players, { isEligible = () => true } = {}) {
  return (players || [])
    .filter((player) => player && player.connected && isEligible(player))
    .sort((left, right) => (Number(left.joinedAt) || 0) - (Number(right.joinedAt) || 0) || String(left.id).localeCompare(String(right.id)))[0] || null;
}

/** What every client may see about an absent host. No credentials. */
export function publicHostPresence(hostAway) {
  if (!hostAway) return null;
  return {
    away: true,
    hostName: hostAway.hostName || "",
    since: hostAway.since,
    promoteAt: hostAway.promoteAt
  };
}

/** The "<name> is now the host" notice, published only while it is recent. */
export function publicHostChange(change, now, noticeMs = HOST_CHANGE_NOTICE_MS) {
  if (!change || now - change.at >= noticeMs) return null;
  return {
    id: change.id,
    playerId: change.playerId,
    name: change.name,
    at: change.at,
    reason: change.reason
  };
}

/**
 * Tells the host who was replaced for being away why they are not the host
 * any more. Per viewer, and deliberately not time-limited: they may come back
 * long after everybody else's notice has faded.
 */
export function publicOwnHostReplaced(change, credential, viewerIsHost) {
  if (!change || change.reason !== "host-away" || viewerIsHost) return null;
  if (!sameCredential(credential, change.previousHostKey)) return null;
  return { id: change.id, name: change.name, at: change.at };
}
