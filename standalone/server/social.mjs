import crypto from "node:crypto";

export const MAX_CHAT_MESSAGES = 60;
export const MAX_CHAT_MESSAGE_CHARS = 240;
export const MAX_WHITEBOARD_STROKES = 160;
export const MAX_WHITEBOARD_POINTS_PER_STROKE = 128;
export const MAX_REPORTS = 40;
const REPORT_RATE_WINDOW_MS = 60_000;
const REPORT_RATE_MAX = 5;
const REPORT_REASONS = new Set(["offensive", "harassment", "spam", "other"]);

const CHAT_RATE_WINDOW_MS = 10_000;
const CHAT_RATE_MAX = 6;
const STROKE_RATE_WINDOW_MS = 10_000;
const STROKE_RATE_MAX = 60;
const CLEAR_RATE_WINDOW_MS = 2_000;
const CLEAR_RATE_MAX = 1;
const WAITING_PHASES = new Set(["lobby", "building"]);
const WHITEBOARD_SIZES = new Map([
  ["small", 3],
  ["medium", 7],
  ["large", 14],
  [3, 3],
  [7, 7],
  [14, 14]
]);

export function initialiseRoomSocial(room) {
  room.chatMessages = Array.isArray(room.chatMessages) ? room.chatMessages.slice(-MAX_CHAT_MESSAGES) : [];
  room.whiteboardStrokes = Array.isArray(room.whiteboardStrokes) ? room.whiteboardStrokes.slice(-MAX_WHITEBOARD_STROKES) : [];
  room.whiteboardRevision = Math.max(0, Math.floor(Number(room.whiteboardRevision) || 0));
  room.socialRateLimits = room.socialRateLimits instanceof Map ? room.socialRateLimits : new Map();
  room.reports = Array.isArray(room.reports) ? room.reports.slice(-MAX_REPORTS) : [];
  return room;
}

// Reporting exists so a player can tell the host something is wrong without
// having to shout over a party. It notifies the host only; it does not remove
// anything by itself, and it never reveals the reporter to other players.
export function addReport(room, reporter, input, rateKey, now = Date.now()) {
  initialiseRoomSocial(room);
  if (!consumeRate(room, rateKey, "report", REPORT_RATE_WINDOW_MS, REPORT_RATE_MAX, now)) {
    return { ok: false, error: "You have reported a few things already. Wait a moment." };
  }
  const reason = REPORT_REASONS.has(String(input?.reason || "")) ? String(input.reason) : "other";
  const note = String(input?.note ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const subjectKind = ["player", "chat", "answer", "drawing"].includes(String(input?.subjectKind || "")) ?
    String(input.subjectKind) : "player";
  const report = {
    id: crypto.randomUUID(),
    reporterId: String(reporter?.id || "").slice(0, 80),
    reporterName: cleanActorName(reporter?.name),
    subjectKind,
    subjectId: String(input?.subjectId ?? "").slice(0, 80),
    subjectName: cleanActorName(input?.subjectName),
    reason,
    note,
    createdAt: now,
    resolved: false
  };
  room.reports.push(report);
  if (room.reports.length > MAX_REPORTS) room.reports.splice(0, room.reports.length - MAX_REPORTS);
  return { ok: true, report };
}

export function resolveReport(room, reportId) {
  initialiseRoomSocial(room);
  const report = room.reports.find((item) => item.id === reportId && !item.resolved);
  if (!report) return { ok: false, error: "That report is already handled." };
  report.resolved = true;
  return { ok: true, reportId };
}

// Only the host sees reports, and only the host sees who raised one.
export function publicReports(room) {
  initialiseRoomSocial(room);
  return room.reports.filter((report) => !report.resolved).map((report) => ({
    id: report.id,
    reporterName: report.reporterName,
    subjectKind: report.subjectKind,
    subjectId: report.subjectId,
    subjectName: report.subjectName,
    reason: report.reason,
    note: report.note,
    createdAt: report.createdAt
  }));
}

export function addChatMessage(room, actor, value, rateKey, now = Date.now()) {
  initialiseRoomSocial(room);
  const phaseError = waitingPhaseError(room, "Chat");
  if (phaseError) return phaseError;
  let text;
  try {
    text = cleanChatText(value);
  } catch (error) {
    return { ok: false, error: error.message };
  }
  if (!text) return { ok: false, error: "Write a message first." };
  if (!consumeRate(room, rateKey, "chat", CHAT_RATE_WINDOW_MS, CHAT_RATE_MAX, now)) {
    return { ok: false, error: "Chat is moving quickly. Wait a moment before sending more." };
  }

  const message = {
    id: crypto.randomUUID(),
    senderId: String(actor?.id || "host").slice(0, 80),
    senderName: cleanActorName(actor?.name),
    senderAvatarId: String(actor?.avatarId || "crown").slice(0, 20),
    senderAvatarImageDataUrl: safeRoomMediaUrl(actor?.avatarImageDataUrl),
    text,
    createdAt: now
  };
  room.chatMessages.push(message);
  if (room.chatMessages.length > MAX_CHAT_MESSAGES) {
    room.chatMessages.splice(0, room.chatMessages.length - MAX_CHAT_MESSAGES);
  }
  return { ok: true, message };
}

export function addWhiteboardStroke(room, actor, input, rateKey, now = Date.now()) {
  initialiseRoomSocial(room);
  const phaseError = waitingPhaseError(room, "The whiteboard");
  if (phaseError) return phaseError;
  let stroke;
  try {
    stroke = normaliseWhiteboardStroke(input);
  } catch (error) {
    return { ok: false, error: error.message };
  }
  if (!consumeRate(room, rateKey, "stroke", STROKE_RATE_WINDOW_MS, STROKE_RATE_MAX, now)) {
    return { ok: false, error: "The whiteboard is receiving too many strokes. Wait a moment." };
  }

  const publicStroke = {
    id: crypto.randomUUID(),
    senderId: String(actor?.id || "host").slice(0, 80),
    createdAt: now,
    ...stroke
  };
  room.whiteboardStrokes.push(publicStroke);
  if (room.whiteboardStrokes.length > MAX_WHITEBOARD_STROKES) {
    room.whiteboardStrokes.splice(0, room.whiteboardStrokes.length - MAX_WHITEBOARD_STROKES);
  }
  return { ok: true, stroke: publicStroke };
}

export function clearWhiteboard(room, actor, rateKey, now = Date.now()) {
  initialiseRoomSocial(room);
  const phaseError = waitingPhaseError(room, "The whiteboard");
  if (phaseError) return phaseError;
  if (!consumeRate(room, rateKey, "clear", CLEAR_RATE_WINDOW_MS, CLEAR_RATE_MAX, now)) {
    return { ok: false, error: "Wait a moment before clearing the whiteboard again." };
  }
  const senderId = String(actor?.id || "host").slice(0, 80);
  const previousLength = room.whiteboardStrokes.length;
  room.whiteboardStrokes = room.whiteboardStrokes.filter(stroke => String(stroke?.senderId || "") !== senderId);
  const removedCount = previousLength - room.whiteboardStrokes.length;
  if (removedCount > 0) room.whiteboardRevision += 1;
  return { ok: true, whiteboardRevision: room.whiteboardRevision, removedCount };
}

export function clearWhiteboardForPlayer(room, playerId) {
  initialiseRoomSocial(room);
  const senderId = String(playerId || "");
  if (!senderId) return false;
  const previousLength = room.whiteboardStrokes.length;
  room.whiteboardStrokes = room.whiteboardStrokes.filter(stroke => String(stroke?.senderId || "") !== senderId);
  if (room.whiteboardStrokes.length === previousLength) return false;
  room.whiteboardRevision += 1;
  return true;
}

// Host moderation. Removing a message keeps a tombstone so the conversation
// does not silently reshuffle under everyone mid-read, and so players can see
// that a host acted rather than wondering whether they imagined it.
export function removeChatMessage(room, messageId) {
  initialiseRoomSocial(room);
  const message = room.chatMessages.find((item) => item.id === messageId && !item.removed);
  if (!message) return { ok: false, error: "That message is no longer here." };
  message.removed = true;
  message.text = "";
  message.senderAvatarImageDataUrl = "";
  return { ok: true, messageId };
}

export function removeChatMessagesForPlayer(room, playerId) {
  initialiseRoomSocial(room);
  let removed = 0;
  for (const message of room.chatMessages) {
    if (message.senderId === playerId && !message.removed) {
      message.removed = true;
      message.text = "";
      message.senderAvatarImageDataUrl = "";
      removed += 1;
    }
  }
  return removed;
}

export function publicChatMessages(room) {
  initialiseRoomSocial(room);
  return room.chatMessages.slice(-MAX_CHAT_MESSAGES).map((message) => message.removed ? {
    id: message.id,
    senderId: message.senderId,
    senderName: message.senderName,
    senderAvatarId: message.senderAvatarId,
    senderAvatarImageDataUrl: "",
    text: "",
    removed: true,
    createdAt: message.createdAt
  } : message);
}

export function publicWhiteboardStrokes(room) {
  initialiseRoomSocial(room);
  return room.whiteboardStrokes.slice(-MAX_WHITEBOARD_STROKES);
}

function waitingPhaseError(room, label) {
  return WAITING_PHASES.has(room?.phase) ? null : { ok: false, error: label + " is available while the room is waiting." };
}

function cleanChatText(value) {
  const raw = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (raw.length > MAX_CHAT_MESSAGE_CHARS) {
    throw new Error("Messages can be up to " + MAX_CHAT_MESSAGE_CHARS + " characters.");
  }
  return raw;
}

function cleanActorName(value) {
  return String(value || "Host").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 24) || "Host";
}

function safeRoomMediaUrl(value) {
  const candidate = String(value || "");
  return /^\/media\/[a-z]{4}\/[a-f0-9]{32}$/i.test(candidate) ? candidate : "";
}

function normaliseWhiteboardStroke(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Draw a stroke first.");
  }
  const tool = String(input.tool || "brush").toLowerCase();
  if (tool !== "brush" && tool !== "eraser") {
    throw new Error("Choose the brush or eraser tool.");
  }
  const rawSize = typeof input.size === "string" ? input.size.toLowerCase() : Number(input.size);
  const size = WHITEBOARD_SIZES.get(rawSize);
  if (!size) throw new Error("Choose a valid brush size.");
  const color = String(input.color || "#111111").toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) throw new Error("Choose a valid brush colour.");
  if (!Array.isArray(input.points) || input.points.length < 1) {
    throw new Error("A stroke needs at least one point.");
  }
  if (input.points.length > MAX_WHITEBOARD_POINTS_PER_STROKE) {
    throw new Error("That stroke has too many points.");
  }
  const points = input.points.map((point) => {
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
      throw new Error("Whiteboard points must stay inside the board.");
    }
    return { x: Math.round(x * 10_000) / 10_000, y: Math.round(y * 10_000) / 10_000 };
  });
  return { tool, color, size, points };
}

function consumeRate(room, rateKey, action, windowMs, maximum, now) {
  const key = String(rateKey || "").slice(0, 100) + ":" + action;
  const previous = room.socialRateLimits.get(key) || [];
  const recent = previous.filter((timestamp) => now - timestamp < windowMs).slice(-(maximum - 1));
  if (previous.filter((timestamp) => now - timestamp < windowMs).length >= maximum) return false;
  recent.push(now);
  room.socialRateLimits.set(key, recent);
  return true;
}
