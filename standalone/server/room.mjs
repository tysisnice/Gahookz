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

export function roomAssetChars(room) {
  let total = 0;
  Object.values(room.players || {}).forEach((player) => {
    total += String(player.avatarImageDataUrl || "").length;
  });
  [...(room.questions || []), ...(room.pendingQuestions || []), ...(room.quizQuestions || [])].forEach((question) => {
    total += String(question.imageDataUrl || "").length;
  });
  Object.values(room.game?.answers || {}).forEach((answer) => {
    total += String(answer.imageDataUrl || "").length;
  });
  return total;
}

export function assertRoomAssetCapacity(room, previousValue, nextValue) {
  const projected = roomAssetChars(room) - String(previousValue || "").length + String(nextValue || "").length;
  if (projected > MAX_ROOM_ASSET_CHARS) {
    throw new Error("This room has reached its image storage limit.");
  }
}

export function activePlayers(room) {
  return Object.values(room.players || {}).filter((player) => player.connected);
}
