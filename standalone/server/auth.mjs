import crypto from "node:crypto";

export function initialiseRoomAuth(room) {
  room.authToPlayerId = room.authToPlayerId instanceof Map ? room.authToPlayerId : new Map();
  room.playerIdToAuth = room.playerIdToAuth instanceof Map ? room.playerIdToAuth : new Map();
  room.bannedCredentials = room.bannedCredentials instanceof Set ? room.bannedCredentials : new Set();
  return room;
}

export function createPublicPlayerId() {
  return crypto.randomUUID();
}

export function registerPlayerCredential(room, credential, playerId) {
  initialiseRoomAuth(room);
  room.authToPlayerId.set(credential, playerId);
  room.playerIdToAuth.set(playerId, credential);
}

export function unregisterPlayerCredential(room, playerId, { ban = false } = {}) {
  initialiseRoomAuth(room);
  const credential = room.playerIdToAuth.get(playerId) || "";
  if (credential) {
    room.authToPlayerId.delete(credential);
    if (ban) room.bannedCredentials.add(credential);
  }
  room.playerIdToAuth.delete(playerId);
  return credential;
}

export function unbanPlayerCredential(room, credential) {
  initialiseRoomAuth(room);
  if (credential) room.bannedCredentials.delete(credential);
}

export function isCredentialBanned(room, credential) {
  initialiseRoomAuth(room);
  return Boolean(credential && room.bannedCredentials.has(credential));
}

export function getPlayerByCredential(room, credential) {
  initialiseRoomAuth(room);
  const playerId = credential ? room.authToPlayerId.get(credential) : "";
  return playerId ? room.players[playerId] || null : null;
}

export function getCredentialForPlayer(room, playerId) {
  initialiseRoomAuth(room);
  return room.playerIdToAuth.get(playerId) || "";
}

export function resolvePlayer(room, reference) {
  if (!reference) return null;
  return room.players[reference] || getPlayerByCredential(room, reference);
}

export function isHostCredential(room, credential) {
  if (!credential || !room.hostKey) return false;
  const left = Buffer.from(String(credential));
  const right = Buffer.from(String(room.hostKey));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
