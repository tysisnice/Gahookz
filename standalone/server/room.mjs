export const MAX_PLAYERS_PER_ROOM = 20;
// How many rooms one process will hold at once.
//
// Configurable so a small public instance can be deliberately small -- the beta
// site runs with two -- while the default stays exactly what production has
// always used. Bounded at both ends: a zero would make the server useless and
// an unbounded value would let one process be filled until it falls over.
export const MAX_ACTIVE_ROOMS = (() => {
  const requested = Number(process.env.GAHOOKZ_MAX_ACTIVE_ROOMS);
  if (!Number.isFinite(requested)) return 32;
  return Math.max(1, Math.min(64, Math.trunc(requested)));
})();
export const MAX_ROOM_ASSET_CHARS = 12_000_000;

export function activePlayers(room) {
  return Object.values(room.players || {}).filter((player) => player.connected);
}
