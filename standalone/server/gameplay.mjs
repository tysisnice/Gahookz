import { activePlayers } from "./room.mjs";

export function phaseProgressKey(room, phase = room.phase, index = room.game.currentQuestionIndex) {
  return phase + ":" + index;
}

export function allActivePlayersAnswered(room) {
  const players = activePlayers(room);
  return players.length > 0 && players.every((player) => room.game.answers[player.id]);
}

export function allActivePlayersProgressReady(room) {
  const players = activePlayers(room);
  const key = phaseProgressKey(room);
  return players.length === 0 || players.every((player) => room.game.progressReady?.[player.id] === key);
}
