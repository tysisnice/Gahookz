const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3102";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function assert(value, message) {
  if (!value) throw new Error(message);
}

function roomCode() {
  return "X" + Array.from({ length: 3 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
}

async function request(path, body) {
  const response = await fetch(BASE_URL + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { response, data: await response.json() };
}

async function post(path, body) {
  const result = await request(path, body);
  if (!result.data.ok) throw new Error(path + ": " + result.data.error);
  return result.data;
}

async function expectError(path, body, includes) {
  const result = await request(path, body);
  assert(!result.data.ok, path + " should reject invalid input");
  assert(String(result.data.error || "").toLowerCase().includes(includes.toLowerCase()), path + " returned an unexpected error: " + result.data.error);
  return result.data;
}

async function state(code, playerKey = "", role = "player") {
  const { response, data } = await request("/api/state", { code, role, playerKey });
  assert(response.ok, "State request failed: " + data.error);
  return data;
}

const code = roomCode();
const hostKey = "social-host-" + Date.now();
await post("/api/room", { code, playerKey: hostKey, intent: "host" });

const guestState = await state(code, "", "guest");
assert(guestState.chatMessages.length === 0 && guestState.whiteboardStrokes.length === 0, "Unauthenticated snapshots must not expose room social state");
assert(guestState.customGahookOptions === null, "Unauthenticated snapshots must not expose private custom-Gahook state");

const hostMessage = await post("/api/room/chat", { code, playerKey: hostKey, text: "Host is ready!" });
assert(hostMessage.message.senderId === "host" && hostMessage.message.senderName === "Host", "A host credential should authorize chat without joining as a player");

const players = [];
for (let index = 0; index < 10; index += 1) {
  const playerKey = "social-player-" + index + "-" + Date.now();
  await post("/api/player/join", { code, playerKey, name: "Social Player " + index, avatarId: "zap" });
  const snapshot = await state(code, playerKey);
  players.push({ playerKey, id: snapshot.ownPlayer.id });
}

await expectError("/api/room/chat", { code, playerKey: "not-a-member", text: "Intrusion" }, "join the room");
await expectError("/api/room/chat", { code, playerKey: players[0].id, text: "Public id impersonation" }, "join the room");
await expectError("/api/room/chat", { code, playerKey: players[0].playerKey, text: "x".repeat(241) }, "240");

for (let playerIndex = 0; playerIndex < players.length; playerIndex += 1) {
  for (let messageIndex = 0; messageIndex < 6; messageIndex += 1) {
    await post("/api/room/chat", {
      code,
      playerKey: players[playerIndex].playerKey,
      text: "Message " + playerIndex + "-" + messageIndex
    });
  }
}
await expectError("/api/room/chat", { code, playerKey: players[0].playerKey, text: "Seventh burst message" }, "quickly");
const chatSnapshot = await state(code, players[0].playerKey);
assert(chatSnapshot.chatMessages.length === 60, "Chat history must retain at most 60 messages");
assert(!chatSnapshot.chatMessages.some((message) => message.id === hostMessage.message.id), "Chat should discard the oldest message at its cap");
assert(chatSnapshot.chatMessages.every((message) => !Object.values(message).includes(players[0].playerKey)), "Chat snapshots must not leak player credentials");

const basicStroke = {
  tool: "brush",
  color: "#e6383a",
  size: 7,
  points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }]
};
const firstStroke = await post("/api/room/whiteboard/stroke", { code, playerKey: players[0].playerKey, stroke: basicStroke });
assert(firstStroke.stroke.senderId === players[0].id, "Whiteboard strokes should use the public player id");
await expectError("/api/room/whiteboard/stroke", {
  code,
  playerKey: players[0].playerKey,
  stroke: { ...basicStroke, points: Array.from({ length: 129 }, (_, index) => ({ x: index / 128, y: 0.5 })) }
}, "too many points");
await expectError("/api/room/whiteboard/stroke", {
  code,
  playerKey: players[0].playerKey,
  stroke: { ...basicStroke, points: [{ x: -1, y: 0 }, { x: 1, y: 1 }] }
}, "inside the board");

for (let index = 1; index < 60; index += 1) {
  await post("/api/room/whiteboard/stroke", { code, playerKey: players[0].playerKey, stroke: { ...basicStroke, color: "#246bfe" } });
}
for (let index = 0; index < 60; index += 1) {
  await post("/api/room/whiteboard/stroke", { code, playerKey: players[1].playerKey, stroke: { ...basicStroke, size: "small" } });
}
for (let index = 0; index < 50; index += 1) {
  await post("/api/room/whiteboard/stroke", { code, playerKey: players[2].playerKey, stroke: { ...basicStroke, tool: "eraser", size: 14 } });
}
await expectError("/api/room/whiteboard/stroke", { code, playerKey: players[0].playerKey, stroke: basicStroke }, "too many strokes");
const whiteboardSnapshot = await state(code, players[2].playerKey);
assert(whiteboardSnapshot.whiteboardStrokes.length === 160, "Whiteboard must retain at most 160 strokes");
assert(whiteboardSnapshot.whiteboardStrokes.every((stroke) => stroke.points.length <= 128), "Snapshot strokes must remain point-bounded");
const firstClear = await post("/api/room/whiteboard/clear", { code, playerKey: players[0].playerKey });
const secondClear = await post("/api/room/whiteboard/clear", { code, playerKey: players[1].playerKey });
const thirdClear = await post("/api/room/whiteboard/clear", { code, playerKey: players[2].playerKey });
assert(firstClear.whiteboardRevision === 1 && secondClear.whiteboardRevision === 2 && thirdClear.whiteboardRevision === 3, "Each artist clear should advance the board revision");
await expectError("/api/room/whiteboard/clear", { code, playerKey: players[2].playerKey }, "wait a moment");
const clearedState = await state(code, players[0].playerKey);
assert(clearedState.whiteboardStrokes.length === 0 && clearedState.whiteboardRevision === 3, "Each clear should remove only that participant's strokes");

await post("/api/room/whiteboard/stroke", { code, playerKey: players[3].playerKey, stroke: basicStroke });
await post("/api/room/whiteboard/stroke", { code, playerKey: players[4].playerKey, stroke: basicStroke });
await post("/api/host/poke", { code, playerKey: hostKey, playerId: players[3].id });
const gahookedDrawingState = await state(code, players[4].playerKey);
assert(!gahookedDrawingState.whiteboardStrokes.some(stroke => stroke.senderId === players[3].id), "Gahooking a player should remove all of that player's chat drawings");
assert(gahookedDrawingState.whiteboardStrokes.some(stroke => stroke.senderId === players[4].id), "Gahooking one player should preserve everyone else's drawings");

const pngA = "data:image/png;base64," + Buffer.from("small-png-a").toString("base64");
const pngB = "data:image/webp;base64," + Buffer.from("small-webp-b").toString("base64");
const recordedAudio = "data:audio/webm;codecs=opus;base64," + Buffer.from("small-recorded-audio").toString("base64");
await expectError("/api/player/custom-gahook", {
  code,
  playerKey: players[0].playerKey,
  customGahook: { frames: [pngA, pngB, pngA, pngB] }
}, "up to three");
await expectError("/api/player/custom-gahook", {
  code,
  playerKey: players[0].playerKey,
  customGahook: { soundId: "custom" }
}, "record or upload");
await expectError("/api/player/custom-gahook", {
  code,
  playerKey: players[0].playerKey,
  customGahook: { frames: ["data:image/png;base64," + "A".repeat(180_001)] }
}, "too large");

const savedCustom = await post("/api/player/custom-gahook", {
  code,
  playerKey: players[0].playerKey,
  customGahook: {
    name: "The Checker Bonker",
    frames: [pngA, pngB, pngA],
    backgroundId: "monkey",
    backgroundColor: "#7c3aed",
    effectId: "bounce",
    soundId: "custom",
    customAudioDataUrl: recordedAudio,
    customAudioName: "My tiny recording.webm"
  }
});
assert(savedCustom.customGahook.frames.length === 3, "Three custom frames should persist");
assert(savedCustom.customGahook.name === "The Checker Bonker" && savedCustom.customGahook.customAudioName === "My tiny recording.webm", "Bounded custom labels should persist");
assert(savedCustom.customGahook.frames.every((url) => /^\/media\/[A-Z]{4}\/[a-f0-9]{32}$/.test(url)), "Custom frames should become compact room media URLs");
assert(/^\/media\/[A-Z]{4}\/[a-f0-9]{32}$/.test(savedCustom.customGahook.customAudioDataUrl), "Custom audio should become a compact room media URL");
await post("/api/player/gahook-form", { code, playerKey: players[0].playerKey, gahookForm: "custom" });

const ownerState = await state(code, players[0].playerKey);
const otherStateBeforePoke = await state(code, players[1].playerKey);
assert(ownerState.ownCustomGahook.frames.length === 3, "The owner should receive their full custom Gahook config");
assert(otherStateBeforePoke.ownCustomGahook.frames.length === 0, "Another player must not receive the owner's private custom config");
assert(!JSON.stringify(otherStateBeforePoke).includes(savedCustom.customGahook.frames[0]), "Custom media must stay private until it is used in a Gahook event");

await post("/api/player/poke", { code, playerKey: players[0].playerKey, playerId: players[1].id });
const recipientState = await state(code, players[1].playerKey);
assert(recipientState.ownPoke.gahookForm === "custom", "Recipient should see that the event uses the custom form");
assert(recipientState.ownPoke.customGahook.frames.length === 3, "Recipient should receive all bounded animation frames on the Gahook event");
assert(recipientState.ownPoke.customGahook.backgroundId === "monkey" && recipientState.ownPoke.customGahook.backgroundColor === "#7c3aed" && recipientState.ownPoke.customGahook.effectId === "bounce", "Event should carry the monkey stage, selected color, and motion");
assert(recipientState.ownPoke.customGahook.soundId === "custom" && recipientState.ownPoke.customGahook.customAudioDataUrl, "Event should carry the selected bounded audio URL");

await expectError("/api/player/custom-gahook", {
  code,
  playerKey: players[0].id,
  customGahook: { frames: [pngA] }
}, "join the game");

const policyCode = roomCode();
const policyHostKey = "policy-host-" + Date.now();
const policyPlayerKey = "policy-player-" + Date.now();
await post("/api/room", { code: policyCode, playerKey: policyHostKey, intent: "host" });
await post("/api/player/join", { code: policyCode, playerKey: policyPlayerKey, name: "Policy Player", avatarId: "frog" });
await post("/api/host/settings", { code: policyCode, playerKey: policyHostKey, allowCustomProfiles: false, allowCustomGahooks: false, promptStyle: "education" });
const policyState = await state(policyCode, policyPlayerKey);
assert(policyState.allowCustomProfiles === false && policyState.allowCustomGahooks === false && policyState.promptStyle === "education", "Host content and prompt policies should appear in authoritative room state");
await expectError("/api/player/profile", { code: policyCode, playerKey: policyPlayerKey, name: "Policy Player", avatarId: "frog", avatarImageDataUrl: pngA }, "custom profile pictures are disabled");
await expectError("/api/player/custom-gahook", { code: policyCode, playerKey: policyPlayerKey, customGahook: { frames: [pngA] } }, "custom gahooks are disabled");
await expectError("/api/player/gahook-form", { code: policyCode, playerKey: policyPlayerKey, gahookForm: "custom" }, "custom gahooks are disabled");

console.log(JSON.stringify({
  ok: true,
  chatMessages: chatSnapshot.chatMessages.length,
  whiteboardStrokeCap: whiteboardSnapshot.whiteboardStrokes.length,
  customFrames: recipientState.ownPoke.customGahook.frames.length,
  credentialsHidden: true
}, null, 2));
