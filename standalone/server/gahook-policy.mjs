// What a room allows a Gahook to do, and who has already used theirs.
//
// Both rules used to be enforced from the middle of server.js: the host's
// effects policy as a hand-written set of URL paths, and the one-Gahook-per-
// question claim as a bare object on room.game. They are the two rules a
// client cannot be trusted with -- a browser that keeps sending the request
// must get nothing -- so they belong somewhere a test can reach them without
// a running server.

// How far Gahook interruptions may go.
//
// Enforced here rather than by hiding a button. "chaos" is the behaviour every
// room had before the setting existed and stays the default, so no room
// changes silently. "mini" and "visual" differ only in how the browser draws
// the interruption; the server treats them the same, which is why neither may
// move a score.
export const GAHOOK_EFFECT_POLICIES = ["off", "mini", "visual", "chaos"];
export const DEFAULT_GAHOOK_EFFECTS = "chaos";

export const GAHOOK_EFFECTS_OFF_ERROR = "The host has turned Gahook effects off for this game.";
export const LOBBY_ARENA_OFF_ERROR = "The host has turned off lobby duels.";

export function gahookEffectsPolicy(room) {
  return GAHOOK_EFFECT_POLICIES.includes(room?.gahookEffects) ? room.gahookEffects : DEFAULT_GAHOOK_EFFECTS;
}

/** Only "chaos" may move anybody's score. */
export function gahookScoringAllowed(room) {
  return gahookEffectsPolicy(room) === "chaos";
}

/** "off" suppresses the interruption itself, in every phase. */
export function gahookEffectsAllowed(room) {
  return gahookEffectsPolicy(room) !== "off";
}

export function lobbyArenaEnabled(room) {
  return room?.lobbyArenaEnabled !== false;
}

// Every route that can land a Gahook on somebody's screen, and which switch
// governs it.
//
// 2026-10-23: this was a set of seven paths called EFFECT_GATED_GAHOOK_ROUTES,
// written by hand next to a comment promising that "Off means no gahooking:
// every Gahook is refused in every phase ... congratulations and boos
// included, whoever sends it". Two routes that send Gahooks were missing from
// it, and measurement over HTTP in a room with effects off found what that
// cost: a spectator could still land a "congrats"/"ARENA CHAMPION" and a
// "boo"/"GET GOT" overlay on the two Arena duellists through
// /api/player/duel-react -- the same two kinds the finale route refuses in the
// same room. The list had drifted from the thing it was protecting, exactly as
// the player-media retain and clear lists had the day before.
//
// So the table is now the enumeration, every entry says which switch owns it,
// and gahook-policy.test.mjs walks server.js's own call graph to prove no
// route that reaches pokePlayer is missing from it. "arena" is the one
// deliberate exception: the Arena's challenge handshake is the only way a
// challenge is announced at all, so it follows the host's separate Arena
// switch rather than the effects policy -- which is what the old comment's
// last line, "The 1v1 Arena has its own switch", always meant to say.
export const GAHOOK_ROUTE_SWITCHES = new Map([
  ["/api/player/poke", "effects"],
  ["/api/player/round-poke", "effects"],
  ["/api/player/counter-poke", "effects"],
  ["/api/player/shame-poke", "effects"],
  ["/api/player/final-poke", "effects"],
  ["/api/player/duel-react", "effects"],
  ["/api/host/poke", "effects"],
  ["/api/host/final-poke", "effects"],
  ["/api/player/duel-challenge", "arena"]
]);

/**
 * The refusal a route owes a client before the handler runs, or null.
 *
 * Refusing here rather than inside pokePlayer keeps a refused request free of
 * side effects: counterPokeFromPlayer spends the player's one counter offer
 * before it pokes, and challengeGahookDuel creates the duel before it pokes.
 */
export function gahookRouteRefusal(room, pathname) {
  const owner = GAHOOK_ROUTE_SWITCHES.get(pathname);
  if (owner === "effects" && !gahookEffectsAllowed(room)) {
    return { ok: false, error: GAHOOK_EFFECTS_OFF_ERROR };
  }
  if (owner === "arena" && !lobbyArenaEnabled(room)) {
    return { ok: false, error: LOBBY_ARENA_OFF_ERROR };
  }
  return null;
}

// One Gahook per sender per question.
//
// The claim is taken before the Gahook is sent and released if sending fails,
// so a refused Gahook does not spend the sender's turn. Keyed by question
// index rather than by phase: the same single use covers reading, answering
// and reveal, which is why publicOwnGahookUses reports one target under three
// names during the client migration.
export function claimQuestionGahookUse(room, senderId, targetId) {
  if (!senderId || !targetId) {
    return { ok: false, error: "Choose someone to Gahook." };
  }
  room.game.pokeUses = room.game.pokeUses || {};
  const index = room.game.currentQuestionIndex;
  const key = "question:" + index + ":" + senderId;
  const existingTargetId = room.game.pokeUses[key];
  if (existingTargetId) {
    return {
      ok: false,
      error: "You already used your Gahook for this question.",
      usedTargetId: existingTargetId
    };
  }
  room.game.pokeUses[key] = targetId;
  return { ok: true, key, targetId };
}

/** Gives a claim back after the Gahook it was taken for was refused. */
export function releaseQuestionGahookUse(room, key) {
  if (!key || !room.game?.pokeUses) return false;
  return delete room.game.pokeUses[key];
}

/** What one player may know about their own claim. Never another player's. */
export function publicOwnGahookUses(room, playerId) {
  const index = room.game.currentQuestionIndex;
  const targetId = room.game.pokeUses?.["question:" + index + ":" + playerId] || "";
  const usedTargets = targetId && room.players[targetId] ? [targetId] : [];

  return {
    question: usedTargets,
    questionTargetId: usedTargets[0] || "",
    // Keep the old phase-specific arrays during the client migration. They now
    // describe the same single use shared by the whole question.
    round: usedTargets,
    reveal: usedTargets
  };
}
