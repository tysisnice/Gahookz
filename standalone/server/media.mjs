import crypto from "node:crypto";
import { MAX_ROOM_ASSET_CHARS } from "./room.mjs";

const DATA_IMAGE = /^data:image\/(png|jpe?g|webp|gif);base64,([a-z0-9+/=]+)$/i;
const DATA_AUDIO = /^data:audio\/(mpeg|mp3|wav|x-wav|wave|ogg|webm|mp4|m4a|x-m4a|aac)(?:;codecs=[a-z0-9._-]+)?;base64,([a-z0-9+/=]+)$/i;
const MIME_BY_KIND = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mpeg: "audio/mpeg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  "x-wav": "audio/wav",
  wave: "audio/wav",
  ogg: "audio/ogg",
  webm: "audio/webm",
  mp4: "audio/mp4",
  m4a: "audio/mp4",
  "x-m4a": "audio/mp4",
  aac: "audio/aac"
};

export function initialiseRoomMedia(room) {
  room.media = room.media instanceof Map ? room.media : new Map();
  room.mediaBytes = Number(room.mediaBytes || 0);
  return room;
}

export function storeRoomImage(room, value, { maxChars, label }) {
  return storeRoomAsset(room, value, { maxChars, label, pattern: DATA_IMAGE, expectedType: "image", formatError: "Use a PNG, JPG, WEBP, or GIF image." });
}

export function storeRoomAudio(room, value, { maxChars, label }) {
  return storeRoomAsset(room, value, { maxChars, label, pattern: DATA_AUDIO, expectedType: "audio", formatError: "Use an MP3, WAV, OGG, WEBM, M4A, or AAC audio file." });
}

export function pruneRoomMedia(room) {
  initialiseRoomMedia(room);
  const retained = new Set();
  const retain = (value) => {
    const match = String(value || "").match(/^\/media\/([a-z]{4})\/([a-f0-9]{32})$/i);
    if (match && match[1].toUpperCase() === room.code) retained.add(match[2].toLowerCase());
  };
  const retainCustomGahook = (value) => {
    (Array.isArray(value?.frames) ? value.frames : []).forEach(retain);
    retain(value?.customAudioDataUrl);
  };
  Object.values(room.players || {}).forEach((player) => {
    retain(player.avatarImageDataUrl);
    retainCustomGahook(player.customGahook);
    retainCustomGahook(player.latestPoke?.customGahook);
  });
  Object.values(room.bannedPlayers || {}).forEach((player) => retain(player.avatarImageDataUrl));
  [...(room.questions || []), ...(room.pendingQuestions || []), ...(room.quizQuestions || [])].forEach((question) => {
    retain(question.imageDataUrl);
    retain(question.authorAvatarImageDataUrl);
    (question.herdResults?.groups || []).forEach((group) => retain(group.imageDataUrl));
  });
  Object.values(room.game?.answers || {}).forEach((answer) => retain(answer.imageDataUrl));
  (room.chatMessages || []).forEach((message) => retain(message.senderAvatarImageDataUrl));
  retainCustomGahook(room.latestRoomPoke?.customGahook);
  for (const [id, asset] of room.media.entries()) {
    if (retained.has(id)) continue;
    room.media.delete(id);
    room.mediaBytes = Math.max(0, room.mediaBytes - Number(asset?.bytes?.length || 0));
  }
}

function storeRoomAsset(room, value, { maxChars, label, pattern, expectedType, formatError }) {
  if (!value) return "";
  if (typeof value !== "string" || value.length > maxChars) {
    throw new Error(label + " is too large.");
  }
  initialiseRoomMedia(room);
  if (value.startsWith("/media/")) {
    const match = value.match(/^\/media\/([a-z]{4})\/([a-f0-9]{32})$/i);
    const asset = match && match[1].toUpperCase() === room.code ? room.media.get(match[2].toLowerCase()) : null;
    if (!asset || !asset.contentType.startsWith(expectedType + "/")) throw new Error(formatError);
    return value;
  }
  const match = value.match(pattern);
  if (!match) throw new Error(formatError);

  const bytes = Buffer.from(match[2], "base64");
  const id = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  if (!room.media.has(id)) {
    if (room.mediaBytes + bytes.length > Math.floor(MAX_ROOM_ASSET_CHARS * 0.75)) {
      throw new Error("This room has reached its image storage limit.");
    }
    room.media.set(id, { bytes, contentType: MIME_BY_KIND[match[1].toLowerCase()] });
    room.mediaBytes += bytes.length;
  }
  return "/media/" + room.code + "/" + id;
}

export function serveRoomMedia(url, res, rooms) {
  const match = url.pathname.match(/^\/media\/([a-z]{4})\/([a-f0-9]{32})$/i);
  if (!match) return false;
  const room = rooms.get(match[1].toUpperCase());
  const asset = room?.media?.get(match[2].toLowerCase());
  if (!asset) {
    res.writeHead(404);
    res.end("Not found");
    return true;
  }
  res.writeHead(200, {
    "Content-Type": asset.contentType,
    "Content-Length": asset.bytes.length,
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(asset.bytes);
  return true;
}
