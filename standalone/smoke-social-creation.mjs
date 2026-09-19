import fs from "node:fs";
import {
  MAX_CHAT_MESSAGES,
  MAX_CHAT_MESSAGE_CHARS,
  MAX_WHITEBOARD_POINTS_PER_STROKE,
  MAX_WHITEBOARD_STROKES,
  addChatMessage,
  addWhiteboardStroke,
  clearWhiteboard,
  initialiseRoomSocial
} from "./server/social.mjs";
import { customGahookOptions } from "./server/custom-gahook.mjs";

const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const TINY_PNG_ONE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const TINY_PNG_TWO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl3j4AAAAASUVORK5CYII=";

const appSource = readSource("./public/app.jsx");
const drawingSource = readSource("./public/client/drawing.jsx");
const socialSource = readSource("./public/client/social.jsx");
const customCreatorSource = readSource("./public/client/custom-gahook.jsx");
const presentationSource = readSource("./public/client/presentation.jsx");
const audioSource = readSource("./public/client/audio.js");
const serverSource = readSource("./server.js");
const stylesSource = readSource("./public/styles.css");
const buildSource = readSource("./build-client.mjs");
const devSource = readSource("./dev.mjs");
const serviceWorkerSource = readSource("./public/service-worker.js");

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

function roomCode() {
  return Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
}

function credential(label) {
  return `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function functionSection(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert(start >= 0, `Missing ${functionName}`);
  const end = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, end < 0 ? source.length : end);
}

function count(source, needle) {
  return source.split(needle).length - 1;
}

async function rawPost(path, body) {
  const response = await fetch(BASE_URL + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  let data;
  try {
    data = await response.json();
  } catch (_error) {
    throw new Error(`${path} returned ${response.status} without JSON`);
  }
  return { response, data };
}

async function post(path, body) {
  const { response, data } = await rawPost(path, body);
  if (!response.ok || !data.ok) {
    throw new Error(`${path}: ${data.error || `HTTP ${response.status}`}`);
  }
  return data;
}

async function expectError(path, body, expectedPattern) {
  const { response, data } = await rawPost(path, body);
  assert(!response.ok && !data.ok, `${path} should have failed`);
  if (expectedPattern) {
    assert(expectedPattern.test(String(data.error || "")), `${path} failed with an unexpected error: ${data.error}`);
  }
  return data;
}

async function state(code, role = "player", playerKey = "") {
  const { response, data } = await rawPost("/api/state", { code, role, playerKey });
  assert(response.ok, `State request failed: ${data.error || response.status}`);
  return data;
}

async function assertServerAvailable() {
  let response;
  try {
    response = await fetch(BASE_URL + "/api/health");
  } catch (error) {
    throw new Error(`Start Gahookz before this smoke test (${BASE_URL}): ${error.message}`);
  }
  const data = await response.json();
  assert(response.ok && data.ok, `Gahookz health check failed at ${BASE_URL}`);
}

function tinyWavDataUrl() {
  const samples = Buffer.from([128, 150, 176, 150, 128, 106, 80, 106]);
  const wav = Buffer.alloc(44 + samples.length);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + samples.length, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(8000, 28);
  wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(samples.length, 40);
  samples.copy(wav, 44);
  return `data:audio/wav;base64,${wav.toString("base64")}`;
}

function validStroke(overrides = {}) {
  return {
    tool: "brush",
    color: "#246bfe",
    size: "medium",
    points: [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.8 }],
    ...overrides
  };
}

function runStaticUiSmoke() {
  assert(drawingSource.includes("export function SimplePaintEditor"), "The reusable paint editor should be exported");
  assert(drawingSource.includes('type="color"'), "The paint editor needs a native custom-colour input");
  assert(drawingSource.includes('"#8a4f21"'), "The shared drawing palette should include a visible brown swatch");
  for (const size of ["small", "medium", "large"]) {
    assert(drawingSource.includes(`id: "${size}"`), `The paint editor is missing its ${size} brush`);
  }
  for (const tool of ["Brush", "Eraser", "Undo", "Clear canvas", "Upload image"]) {
    assert(drawingSource.includes(tool), `The paint editor is missing ${tool}`);
  }
  assert(drawingSource.includes("setPointerCapture") && drawingSource.includes("getCoalescedEvents"), "Drawing should use captured, smooth pointer/touch input");
  assert(drawingSource.includes("ABSOLUTE_MAX_CANVAS_DIMENSION") && drawingSource.includes("maxUploadBytes"), "Drawing exports and uploads should be bounded");
  assert(drawingSource.includes("baseCanvasRef") && drawingSource.includes("outputContext.drawImage(baseCanvas") && drawingSource.includes("paintLine(context, stroke.point, nextPoint, activeBrushSize.size, color, erasing, true)"), "The eraser should affect only the transparent drawing layer above an uploaded image");

  assert(socialSource.includes("export function WaitingRoomSocial"), "The waiting-room social component should be exported");
  // Desktop stage E moved painting off the chat and onto the lobby player
  // wall, so the drawing surface is asserted where it actually lives now. The
  // chat keeps messages only, and must not quietly grow a canvas back.
  assert(socialSource.includes("Room chat") && socialSource.includes("Room messages"), "The social UI should retain lobby chat");
  assert(!socialSource.includes("social-chat__drawing"), "Chat should no longer carry a drawing surface");
  assert(socialSource.includes("export function LobbyPaintLayer") && socialSource.includes("lobby-paint__canvas"), "The lobby player wall should expose the paint surface");
  assert(socialSource.includes('>Erase mine</button>') && socialSource.includes("hasOwnStrokes"), "Painting should offer an owner-only clear action");
  assert(socialSource.includes("export function profilePaintColor"), "The brush colour should be derived from the player's profile picture");
  assert(socialSource.includes("SOCIAL_CHAT_LIMIT = 60") && socialSource.includes("SOCIAL_CHAT_CHARACTER_LIMIT = 240"), "Client chat caps should match the server contract");
  assert(socialSource.includes("onSendMessage") && socialSource.includes("onDrawStroke") && socialSource.includes("onClearDrawings"), "Lobby social controls should expose chat and bounded drawing actions");
  assert(socialSource.includes('data:image/') && socialSource.includes('/media/'), "Chat avatars should render the server's safe room-media URLs as well as local data URLs");
  assert(socialSource.includes("social-chat-minimize") && socialSource.includes("social-chat-fab"), "Room chat should minimize into a floating action button");
  assert(socialSource.includes("const [minimized, setMinimized] = useState(true)"), "Room chat should start minimized by default");
  assert(socialSource.includes("social-chat-notifications") && socialSource.includes("unreadCount"), "Minimized chat should show incoming message previews and an unread badge");
  assert(socialSource.includes("knownMessageKeysRef") && socialSource.includes("senderId") && socialSource.includes("ownPlayerId"), "Unread notifications should detect new messages without notifying for the current player's own messages");
  assert(socialSource.includes("chatProfileStyle") && socialSource.includes("--chat-profile-background"), "Chat bubbles and notifications should derive a stable colour from each player's profile");
  assert((socialSource.match(/className="social-chat-minimize/g) || []).length >= 2 && socialSource.includes("social-chat-minimize--footer"), "Expanded chat should provide minimize controls at both the top and bottom-right");
  assert((socialSource.match(/aria-hidden="true">×<\/span>/g) || []).length === 2 && socialSource.includes('placeholder="Send message"'), "Both minimize controls should use an X and chat should use the concise message placeholder");
  assert(socialSource.includes("chatInputRef.current?.focus") && socialSource.includes("requestAnimationFrame"), "Chat should return focus to the message input after a send finishes");
  assert(socialSource.includes("drawingStrokeSegments") && !socialSource.includes("stroke.points.splice"), "Long chat drawings should be preserved and split into server-safe segments instead of erasing their oldest points");
  assert(socialSource.includes('document.addEventListener("pointerdown", handlePagePointerDown)') && socialSource.includes("!root.contains(event.target)"), "Clicking away from the expanded room chat should minimize it");
  assert(socialSource.includes("drawingEnabled && !canvasRef.current?.contains(event.target)") && socialSource.includes("onClick={stopDrawing}"), "Clicking outside the drawing surface should use the Done drawing action");

  assert(customCreatorSource.includes("export function CustomGahookCreator"), "The custom Gahook creator should be exported");
  assert(customCreatorSource.includes("<SimplePaintEditor"), "Custom Gahook frames should use the shared paint editor");
  assert(customCreatorSource.includes("MAX_CUSTOM_GAHOOK_FRAMES = 3") && customCreatorSource.includes("Add pose") && customCreatorSource.includes("Remove pose {activeFrame + 1}"), "Custom Gahooks need up to three editable poses");
  assert(customCreatorSource.includes("Choose background color") && customCreatorSource.includes('type="color"') && customCreatorSource.includes("CUSTOM_GAHOOK_EFFECTS") && customCreatorSource.includes("CUSTOM_GAHOOK_SOUNDS"), "Custom Gahooks need a visible color picker plus motion and sound choices");
  assert(customCreatorSource.includes("MediaRecorder") && customCreatorSource.includes("Record sound") && customCreatorSource.includes("Upload audio"), "Custom Gahooks should support short recordings and audio uploads");
  assert(presentationSource.includes("CustomGahookVisual") && presentationSource.includes("slice(0, 3)") && presentationSource.includes("custom-gahook-frame"), "Incoming custom Gahooks should render and animate up to three poses");
  assert(audioSource.includes("playCustomGahookSound") && audioSource.includes("maxDurationMs") && audioSource.includes("stopCustomGahookAudio"), "Incoming recorded sounds should stop with the Gahook overlay");
  assert(appSource.includes("customGahook: poke.customGahook || null"), "Optimistic self-Gahooks must preserve the selected custom animation and sound payload");
  assert(appSource.includes('createPortal(<div className="creation-modal-backdrop"') && appSource.includes('document.body.style.position = "fixed"'), "The custom editor should be isolated from menu styling and lock background scrolling");

  const avatarPicker = functionSection(appSource, "AvatarPicker");
  const joinScreen = functionSection(appSource, "JoinScreen");
  assert(/onDraw|draw-avatar/i.test(avatarPicker) && joinScreen.includes("SimplePaintEditor"), "The player profile picker should offer drawing and presets");
  assert(!avatarPicker.includes('type="file"') && !avatarPicker.includes("UploadAvatarIcon"), "The Join picker should not duplicate the drawing editor's upload control");
  assert(joinScreen.includes("upload an image here"), "The custom profile drawing editor should explain where image upload now lives");
  const socialHub = functionSection(appSource, "RoomSocialHub");
  assert(socialHub.includes("WaitingRoomSocial"), "The app should connect its waiting rooms to WaitingRoomSocial");
  assert(socialHub.includes("/api/room/chat") && socialHub.includes("/api/room/whiteboard/stroke") && socialHub.includes("/api/room/whiteboard/clear"), "RoomSocialHub should wire chat and its shared drawing layer");
  assert(socialHub.includes("<AvatarBadge"), "Room chat should render the same avatar badges used by player banners");
  for (const lobbyFunction of ["HostLobby", "HostBuildingLobby", "ReadonlyPartyView", "PlayerWaitingLobby", "PlayerLobby"]) {
    assert(functionSection(appSource, lobbyFunction).includes("RoomSocialHub"), `${lobbyFunction} should show room chat while waiting`);
  }
  assert(!appSource.includes("RoomGahookDash"), "Room Gahook Dash should be removed from lobby and question-making source");
  const picker = functionSection(appSource, "GahookFormPicker");
  assert(picker.includes("CustomGahookCreator") && picker.includes("/api/player/custom-gahook"), "The Gahook picker should expose and save the player's custom option");

  assert(stylesSource.includes(".simple-paint-editor") && stylesSource.includes(".waiting-room-social") && stylesSource.includes(".custom-gahook-creator"), "Paint, social, and custom-Gahook interfaces need integrated styling");
  assert(stylesSource.includes(".social-chat__message.is-own") && stylesSource.includes(".social-chat__drawing"), "Chat should use player-banner-like lobby styling with a translucent drawing layer");
  assert(stylesSource.includes("position: fixed") && stylesSource.includes(".social-chat-notification") && stylesSource.includes(".social-chat-fab"), "Floating chat, notification bubbles, and its action button need integrated styling");
  for (const moduleName of ["drawing", "social", "custom-gahook"]) {
    assert(buildSource.includes(`client/${moduleName}.jsx`) && buildSource.includes(`client/${moduleName}.js`), `${moduleName} should be included in the browser build`);
    assert(devSource.includes(`client/${moduleName}.jsx`), `${moduleName} should trigger development rebuilds`);
    assert(serviceWorkerSource.includes(`/client/${moduleName}.js`), `${moduleName} should be cached for reliable loading`);
  }

  return {
    paintTools: 5,
    brushSizes: 3,
    lobbySocialPlacements: 5,
    floatingChat: true,
    customFrameMaximum: 3
  };
}

function runBoundedSocialModuleSmoke() {
  assert(MAX_CHAT_MESSAGES === 60, "Chat history should be capped at 60 messages");
  assert(MAX_CHAT_MESSAGE_CHARS === 240, "Chat messages should be capped at 240 characters");
  assert(MAX_WHITEBOARD_STROKES === 160, "The whiteboard should retain at most 160 strokes");
  assert(MAX_WHITEBOARD_POINTS_PER_STROKE === 128, "Whiteboard strokes should be capped at 128 points");

  const chatRoom = initialiseRoomSocial({ phase: "lobby" });
  for (let index = 0; index < MAX_CHAT_MESSAGES + 7; index += 1) {
    const result = addChatMessage(chatRoom, { id: `actor-${index}`, name: `Actor ${index}` }, `message ${index}`, `chat-key-${index}`, 1000);
    assert(result.ok, `Independent chat actor ${index} should be accepted`);
  }
  assert(chatRoom.chatMessages.length === MAX_CHAT_MESSAGES, "Chat should discard its oldest messages at the cap");
  assert(chatRoom.chatMessages.at(-1).text === `message ${MAX_CHAT_MESSAGES + 6}`, "Chat should retain the newest message");

  const chatRateRoom = initialiseRoomSocial({ phase: "lobby" });
  const chatBurst = Array.from({ length: 7 }, (_, index) => addChatMessage(
    chatRateRoom,
    { id: "burst", name: "Burst Tester" },
    `burst ${index}`,
    "one-chat-key",
    2000
  ));
  assert(chatBurst.slice(0, 6).every(result => result.ok) && !chatBurst[6].ok, "A seventh chat message in ten seconds should be rate limited");

  const boardRoom = initialiseRoomSocial({ phase: "lobby" });
  for (let index = 0; index < MAX_WHITEBOARD_STROKES + 5; index += 1) {
    const result = addWhiteboardStroke(boardRoom, { id: `artist-${index}` }, validStroke(), `stroke-key-${index}`, 3000);
    assert(result.ok, `Independent whiteboard stroke ${index} should be accepted`);
  }
  assert(boardRoom.whiteboardStrokes.length === MAX_WHITEBOARD_STROKES, "The whiteboard should discard its oldest strokes at the cap");

  const maximumPointsRoom = initialiseRoomSocial({ phase: "lobby" });
  const maximumPoints = Array.from({ length: MAX_WHITEBOARD_POINTS_PER_STROKE }, (_, index) => ({
    x: index / (MAX_WHITEBOARD_POINTS_PER_STROKE - 1),
    y: 0.5
  }));
  assert(addWhiteboardStroke(maximumPointsRoom, { id: "artist" }, validStroke({ points: maximumPoints }), "max-points", 4000).ok, "A 128-point stroke should be accepted");
  assert(!addWhiteboardStroke(maximumPointsRoom, { id: "artist" }, validStroke({ points: [...maximumPoints, { x: 1, y: 1 }] }), "too-many-points", 4000).ok, "A 129-point stroke should be rejected");

  const strokeRateRoom = initialiseRoomSocial({ phase: "lobby" });
  const strokeBurst = Array.from({ length: 61 }, () => addWhiteboardStroke(strokeRateRoom, { id: "fast-artist" }, validStroke(), "one-stroke-key", 5000));
  assert(strokeBurst.slice(0, 60).every(result => result.ok) && !strokeBurst[60].ok, "A 61st whiteboard stroke in ten seconds should be rate limited");

  const clearRoom = initialiseRoomSocial({ phase: "lobby", whiteboardStrokes: [{ senderId: "artist-a" }, { senderId: "artist-b" }] });
  assert(clearWhiteboard(clearRoom, { id: "artist-a" }, "clear-key", 6000).ok, "An authenticated clear should work");
  assert(clearRoom.whiteboardStrokes.length === 1 && clearRoom.whiteboardStrokes[0].senderId === "artist-b", "A clear should preserve every other player's drawings");
  assert(!clearWhiteboard(clearRoom, { id: "artist-a" }, "clear-key", 6000).ok, "Repeated board clears should be rate limited");

  const options = customGahookOptions();
  assert(options.limits.maxFrames === 3, "Custom Gahooks should allow at most three frames");
  assert(options.backgroundIds.includes("monkey") && options.backgroundColors.length >= 8 && options.effectIds.length >= 3, "Custom Gahooks should use the monkey stage with several safe color presets");
  assert(options.soundIds.includes("custom") && options.soundIds.includes("none"), "Custom Gahooks should support uploaded audio and a silent option");
  assert(options.limits.maxFrameChars > 0 && options.limits.maxAudioChars > 0, "Custom Gahook media limits should be published to the client");

  return {
    chatHistory: MAX_CHAT_MESSAGES,
    chatCharacters: MAX_CHAT_MESSAGE_CHARS,
    chatBurst: 6,
    whiteboardStrokes: MAX_WHITEBOARD_STROKES,
    pointsPerStroke: MAX_WHITEBOARD_POINTS_PER_STROKE,
    strokeBurst: 60,
    customOptions: options
  };
}

async function runEndpointSmoke() {
  await assertServerAvailable();
  const code = roomCode();
  const hostKey = credential("social-host");
  const firstKey = credential("artist-one");
  const secondKey = credential("artist-two");
  const outsiderKey = credential("outsider");
  const customAudio = tinyWavDataUrl();

  await post("/api/room", { code, playerKey: hostKey, intent: "host" });
  await post("/api/host/settings", { code, playerKey: hostKey, roundPreset: "custom", maxQuestionsPerPlayer: 1 });
  await post("/api/player/join", {
    code,
    playerKey: firstKey,
    name: "Doodle Dingo",
    avatarId: "zap",
    avatarImageDataUrl: TINY_PNG_ONE,
    gahookForm: "monkey"
  });
  await post("/api/player/join", {
    code,
    playerKey: secondKey,
    name: "Painted Penguin",
    avatarId: "pop",
    gahookForm: "monkey"
  });

  let firstState = await state(code, "player", firstKey);
  let secondState = await state(code, "player", secondKey);
  const firstId = firstState.ownPlayer.id;
  const secondId = secondState.ownPlayer.id;
  assert(firstId !== firstKey && secondId !== secondKey, "Public ids must not expose player credentials");
  assert(/^\/media\/[A-Z]{4}\/[a-f0-9]{32}$/i.test(firstState.ownPlayer.avatarImageDataUrl), "A drawn/uploaded profile image should be stored as bounded room media");

  const outsiderState = await state(code, "player", outsiderKey);
  assert(outsiderState.chatMessages.length === 0 && outsiderState.whiteboardStrokes.length === 0, "Unauthenticated observers must not receive social history");
  assert(outsiderState.customGahookOptions === null && outsiderState.ownCustomGahook === null, "Unauthenticated observers must not receive customization state");

  for (const badKey of [outsiderKey, firstId]) {
    await expectError("/api/room/chat", { code, playerKey: badKey, text: "impersonation" }, /Join the room/i);
    await expectError("/api/room/whiteboard/stroke", { code, playerKey: badKey, stroke: validStroke() }, /Join the room/i);
    await expectError("/api/room/whiteboard/clear", { code, playerKey: badKey }, /Join the room/i);
  }
  await expectError("/api/player/custom-gahook", {
    code,
    playerKey: firstId,
    customGahook: { frames: [TINY_PNG_ONE], backgroundId: "burst", effectId: "shake", soundId: "bonk" }
  }, /Join the game/i);

  const hostMessage = await post("/api/room/chat", { code, playerKey: hostKey, text: "Host is ready" });
  assert(hostMessage.message.senderId === "host" && hostMessage.message.senderName === "Host", "The authenticated host should be able to chat without joining as a player");
  const cleanedMessage = await post("/api/room/chat", { code, playerKey: firstKey, text: "  Hello\u0000   doodlers!  " });
  assert(cleanedMessage.message.text === "Hello doodlers!", "Chat should normalize controls and whitespace");
  assert(cleanedMessage.message.senderAvatarImageDataUrl === firstState.ownPlayer.avatarImageDataUrl, "Chat should carry the sender's safe room-media avatar");
  await expectError("/api/room/chat", { code, playerKey: firstKey, text: "x".repeat(MAX_CHAT_MESSAGE_CHARS + 1) }, /up to 240 characters/i);
  for (let index = 0; index < 6; index += 1) {
    await post("/api/room/chat", { code, playerKey: secondKey, text: `Burst message ${index + 1}` });
  }
  await expectError("/api/room/chat", { code, playerKey: secondKey, text: "One too many" }, /moving quickly/i);
  secondState = await state(code, "player", secondKey);
  assert(secondState.chatMessages.length === 8, "Authenticated room state should include the accepted host and player messages");

  const dotResult = await post("/api/room/whiteboard/stroke", { code, playerKey: firstKey, stroke: validStroke({ points: [{ x: 0.5, y: 0.5 }] }) });
  assert(dotResult.stroke.points.length === 1, "A tap should create a visible whiteboard dot");
  await expectError("/api/room/whiteboard/stroke", { code, playerKey: firstKey, stroke: validStroke({ points: [{ x: -0.1, y: 0 }, { x: 1, y: 1 }] }) }, /inside the board/i);
  await expectError("/api/room/whiteboard/stroke", { code, playerKey: firstKey, stroke: validStroke({ color: "red" }) }, /valid brush colour/i);
  const strokeResult = await post("/api/room/whiteboard/stroke", { code, playerKey: firstKey, stroke: validStroke() });
  assert(strokeResult.stroke.size === 7 && strokeResult.stroke.points.length === 2, "The board should normalize and return a bounded stroke");
  const secondPlayerStroke = await post("/api/room/whiteboard/stroke", { code, playerKey: secondKey, stroke: validStroke({ size: 3 }) });
  secondState = await state(code, "player", secondKey);
  assert(secondState.whiteboardStrokes.some(stroke => stroke.id === strokeResult.stroke.id), "A shared stroke should appear for another authenticated player");
  const cleared = await post("/api/room/whiteboard/clear", { code, playerKey: firstKey });
  assert(cleared.whiteboardRevision === 1, "Clearing should advance the board revision");
  await expectError("/api/room/whiteboard/clear", { code, playerKey: firstKey }, /Wait a moment/i);
  secondState = await state(code, "player", secondKey);
  assert(secondState.whiteboardStrokes.length === 1 && secondState.whiteboardStrokes[0].id === secondPlayerStroke.stroke.id && secondState.whiteboardRevision === 1, "A player's clear should leave every other player's drawings visible");
  const secondCleared = await post("/api/room/whiteboard/clear", { code, playerKey: secondKey });
  secondState = await state(code, "player", secondKey);
  assert(secondCleared.whiteboardRevision === 2 && secondState.whiteboardStrokes.length === 0, "Each player should be able to clear only their remaining drawings");

  assert(firstState.customGahookOptions?.limits?.maxFrames === 3, "Authenticated player state should publish custom Gahook limits");
  await expectError("/api/player/custom-gahook", {
    code,
    playerKey: firstKey,
    customGahook: { frames: [TINY_PNG_ONE, TINY_PNG_TWO, TINY_PNG_ONE, TINY_PNG_TWO], backgroundId: "monkey", effectId: "shake", soundId: "bonk" }
  }, /up to three/i);
  await expectError("/api/player/custom-gahook", {
    code,
    playerKey: firstKey,
    customGahook: { backgroundId: "seizure", effectId: "shake", soundId: "bonk" }
  }, /valid custom Gahook background/i);
  await expectError("/api/player/custom-gahook", {
    code,
    playerKey: firstKey,
    customGahook: { backgroundId: "burst", effectId: "shake", soundId: "custom", customAudioDataUrl: "" }
  }, /Record or upload a sound/i);

  const saved = await post("/api/player/custom-gahook", {
    code,
    playerKey: firstKey,
    customGahook: {
      frames: [TINY_PNG_ONE, TINY_PNG_TWO, TINY_PNG_ONE],
      backgroundId: "monkey",
      backgroundColor: "#246bfe",
      effectId: "spin",
      soundId: "custom",
      customAudioDataUrl: customAudio
    }
  });
  assert(saved.customGahook.frames.length === 3, "All three custom Gahook poses should be saved");
  assert(saved.customGahook.frames.every(value => /^\/media\/[A-Z]{4}\/[a-f0-9]{32}$/i.test(value)), "Custom poses should become opaque room-media paths");
  assert(/^\/media\/[A-Z]{4}\/[a-f0-9]{32}$/i.test(saved.customGahook.customAudioDataUrl), "Custom audio should become an opaque room-media path");
  assert(saved.customGahook.backgroundId === "monkey" && saved.customGahook.backgroundColor === "#246bfe" && saved.customGahook.effectId === "spin" && saved.customGahook.soundId === "custom", "The monkey background, chosen color, motion, and audio should persist");

  for (const frameUrl of saved.customGahook.frames) {
    const response = await fetch(BASE_URL + frameUrl);
    assert(response.ok && response.headers.get("content-type") === "image/png", "Saved custom pose media should be retrievable as PNG");
    assert((await response.arrayBuffer()).byteLength > 0, "Saved custom pose media should not be empty");
  }
  const audioResponse = await fetch(BASE_URL + saved.customGahook.customAudioDataUrl);
  assert(audioResponse.ok && audioResponse.headers.get("content-type") === "audio/wav", "Saved custom sound should be retrievable as WAV");
  assert((await audioResponse.arrayBuffer()).byteLength > 44, "Saved custom sound should contain a WAV payload");

  firstState = await state(code, "player", firstKey);
  secondState = await state(code, "player", secondKey);
  assert(JSON.stringify(firstState.ownCustomGahook) === JSON.stringify(saved.customGahook), "The owner should receive their complete custom Gahook configuration");
  assert(secondState.ownCustomGahook.frames.length === 0, "Another player should not receive the owner's custom configuration as their own");
  assert(secondState.players.every(player => !("customGahook" in player)), "Custom Gahook media should not be exposed on the public player list");

  const secondSaved = await post("/api/player/custom-gahook", {
    code,
    playerKey: secondKey,
    playerId: firstId,
    customGahook: {
      frames: [TINY_PNG_TWO],
      backgroundId: "monkey",
      backgroundColor: "#20b26b",
      effectId: "bounce",
      soundId: "none"
    }
  });
  assert(secondSaved.customGahook.backgroundId === "monkey" && secondSaved.customGahook.backgroundColor === "#20b26b", "A player should be able to save their own custom Gahook color");
  firstState = await state(code, "player", firstKey);
  secondState = await state(code, "player", secondKey);
  assert(firstState.ownCustomGahook.backgroundColor === "#246bfe", "Supplying another player's public id must not overwrite their custom Gahook");
  assert(secondState.ownCustomGahook.backgroundColor === "#20b26b", "Custom updates should be bound to the authenticated credential");

  await post("/api/player/gahook-form", { code, playerKey: firstKey, gahookForm: "custom" });
  secondState = await state(code, "player", secondKey);
  assert(secondState.players.find(player => player.id === firstId)?.gahookForm === "custom", "Other players may see that the sender selected the custom form, without seeing its private media config");
  const poke = await post("/api/player/poke", { code, playerKey: firstKey, playerId: secondId });
  assert(poke.kind === "normal", "A custom lobby Gahook should use the normal delivery path");
  secondState = await state(code, "player", secondKey);
  assert(secondState.ownPoke?.gahookForm === "custom", "The receiver should be told to render the custom Gahook form");
  assert(JSON.stringify(secondState.ownPoke?.customGahook) === JSON.stringify(saved.customGahook), "The incoming poke should carry exactly the sender-owned frames, effect, background, and sound");

  await post("/api/host/lock-setup", { code, playerKey: hostKey, hostWillPlay: false });
  await post("/api/question", {
    code,
    playerKey: firstKey,
    text: "Which doodle belongs on the fridge?",
    answers: [{ text: "The wobbly frog", correct: true }, { text: "The square banana", correct: false }]
  });
  await post("/api/question", {
    code,
    playerKey: secondKey,
    text: "Which sound makes the best Gahook?",
    answers: [{ text: "Bonk", correct: true }, { text: "Polite cough", correct: false }]
  });
  await post("/api/player/ready", { code, playerKey: firstKey, ready: true });
  await post("/api/player/ready", { code, playerKey: secondKey, ready: true });
  await post("/api/host/start", { code, playerKey: hostKey });
  const liveState = await state(code, "player", firstKey);
  assert(liveState.phase === "reading", "The room should enter a live phase for phase-guard checks");
  await expectError("/api/room/chat", { code, playerKey: firstKey, text: "not during the question" }, /while the room is waiting/i);
  await expectError("/api/room/whiteboard/stroke", { code, playerKey: firstKey, stroke: validStroke() }, /while the room is waiting/i);
  await expectError("/api/room/whiteboard/clear", { code, playerKey: hostKey }, /while the room is waiting/i);
  await expectError("/api/player/custom-gahook", {
    code,
    playerKey: firstKey,
    customGahook: { backgroundId: "confetti", effectId: "zoom", soundId: "honk" }
  }, /while the room is waiting/i);

  return {
    code,
    authenticatedSocialState: true,
    publicIdImpersonationBlocked: true,
    chatMessagesAccepted: 8,
    whiteboardRevision: secondCleared.whiteboardRevision,
    customFrames: saved.customGahook.frames.length,
    customAudio: true,
    ownerOnlyConfiguration: true,
    customPokeDelivery: true,
    livePhaseGuards: true
  };
}

assert(serverSource.includes('pathname === "/api/room/chat"') && serverSource.includes('pathname === "/api/room/whiteboard/stroke"'), "Server routes should expose authenticated social actions");
assert(serverSource.includes('pathname === "/api/player/custom-gahook"'), "Server routes should expose player-owned custom Gahook saves");

const ui = runStaticUiSmoke();
const limits = runBoundedSocialModuleSmoke();
const endpoints = await runEndpointSmoke();

console.log(JSON.stringify({
  ok: true,
  baseUrl: BASE_URL,
  ui,
  limits,
  endpoints
}, null, 2));
