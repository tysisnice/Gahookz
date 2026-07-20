export const MAX_PLAYERS_PER_ROOM = 20;
export const MAX_ACTIVE_ROOMS = 32;
export const MAX_ROOM_ASSET_CHARS = 12_000_000;

export function roomAssetChars(room) {
  let total = 0;
  Object.values(room.players || {}).forEach((player) => {
    total += String(player.avatarImageDataUrl || "").length;
  });
  [...(room.questions || []), ...(room.pendingQuestions || []), ...(room.quizQuestions || [])].forEach((question) => {
    total += String(question.imageDataUrl || "").length;
    (question.herdResults?.groups || []).forEach((group) => {
      total += String(group.imageDataUrl || "").length;
    });
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
