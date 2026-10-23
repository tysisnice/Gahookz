// Host moderation of player media, over HTTP, against a real room.
//
// Every assertion here was a measured defect first: a kicked player's picture
// was broadcast to the whole room and printed in a panel on the shared screen,
// a picture parked by switching custom profiles off came back when the setting
// went on again, and a picture a player replaced stayed stored and served.
const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function assert(value, message) {
  if (!value) throw new Error(message);
}

function roomCode() {
  return "W" + Array.from({ length: 3 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
}

const picture = (tag) => "data:image/png;base64," + Buffer.from("smoke-player-media-" + tag).toString("base64");

async function request(path, body) {
  const response = await fetch(BASE_URL + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { response, data: await response.json() };
}

async function post(path, body) {
  const { data } = await request(path, body);
  if (!data.ok) throw new Error(path + ": " + data.error);
  return data;
}

async function state(code, playerKey = "", role = "player") {
  const { response, data } = await request("/api/state", { code, role, playerKey });
  assert(response.ok, "State request failed: " + data.error);
  return data;
}

async function statusOf(url) {
  return (await fetch(BASE_URL + url)).status;
}

// Every /media/ reference anywhere in a payload, with the path that holds it.
function mediaRefs(value, path = "", out = []) {
  if (typeof value === "string") {
    if (value.startsWith("/media/")) out.push(path + " = " + value);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => mediaRefs(item, path + "[" + index + "]", out));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) mediaRefs(item, path ? path + "." + key : key, out);
  }
  return out;
}

const key = (role) => "pm-" + role + "-" + Date.now() + Math.random().toString(36).slice(2);
const idOf = (snapshot, name) => snapshot.players.find((player) => player.name === name)?.id;

// --------------------------------------------------------------- randomize
{
  const code = roomCode();
  const host = key("host");
  const villain = key("villain");
  await post("/api/room", { code, playerKey: host, intent: "host" });
  await post("/api/host/settings", { code, playerKey: host, gameMode: "herd", roundPreset: "custom", maxQuestionsPerPlayer: 2 });
  await post("/api/player/join", { code, playerKey: villain, name: "Villain", avatarId: "fox", avatarImageDataUrl: picture("randomize") });
  await post("/api/room/chat", { code, playerKey: villain, text: "a message with my picture beside it" });
  await post("/api/room/whiteboard/stroke", { code, playerKey: villain, stroke: { tool: "brush", size: "medium", color: "#ff0000", points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] } });
  await post("/api/host/lock-setup", { code, playerKey: host });
  await post("/api/question", { code, playerKey: villain, text: "A prompt that somebody will read out loud", answers: [] });

  const before = await state(code, host, "host");
  const villainId = idOf(before, "Villain");
  const uploaded = before.players.find((player) => player.id === villainId).avatarImageDataUrl;
  assert(uploaded.startsWith("/media/"), "The uploaded picture should be stored as a room asset");
  assert(await statusOf(uploaded) === 200, "The picture should be served before the host acts");
  assert(mediaRefs(before).length > 1, "The picture should be copied to more than one surface, or this test proves nothing");

  const result = await post("/api/host/randomize-player", { code, playerKey: host, playerId: villainId });
  const after = await state(code, host, "host");

  assert(mediaRefs(after).length === 0, 'Randomizing a player left their picture behind at: ' + mediaRefs(after).join(", "));
  assert(await statusOf(uploaded) === 404, "The replaced picture is still stored and served at its own URL");

  const chat = after.chatMessages.filter((message) => message.senderId === villainId);
  assert(chat.length === 1 && !chat[0].removed, "Randomizing a name should not delete what the player said");
  assert(chat[0].senderName === result.name, "The old name was still printed beside their chat message");
  assert(chat[0].senderAvatarImageDataUrl === "", "The old picture was still printed beside their chat message");

  const prompt = after.ownQuestions?.[0] || null;
  assert(after.whiteboardStrokes.filter((stroke) => stroke.senderId === villainId).length === 1,
    '"Randomize name & pfp" should change who someone appears to be, not delete what they drew');
  assert(prompt === null || prompt.text, "Their question should survive a name change");
}

// ----------------------------------- the hidden copy, parked by a setting
{
  const code = roomCode();
  const host = key("host");
  const villain = key("villain");
  await post("/api/room", { code, playerKey: host, intent: "host" });
  await post("/api/player/join", { code, playerKey: villain, name: "Villain", avatarId: "fox", avatarImageDataUrl: picture("hidden") });
  const villainId = idOf(await state(code, host, "host"), "Villain");

  await post("/api/host/settings", { code, playerKey: host, allowCustomProfiles: false });
  await post("/api/host/randomize-player", { code, playerKey: host, playerId: villainId });
  await post("/api/host/settings", { code, playerKey: host, allowCustomProfiles: true });

  const restored = (await state(code, host, "host")).players.find((player) => player.id === villainId);
  assert(restored.avatarImageDataUrl === "",
    "A picture parked by switching custom profiles off came back when the setting was switched on again, undoing the host's moderation");
}

// -------------------------------------------------------------------- kick
{
  const code = roomCode();
  const host = key("host");
  const villain = key("villain");
  const bystander = key("bystander");
  await post("/api/room", { code, playerKey: host, intent: "host" });
  await post("/api/player/join", { code, playerKey: villain, name: "Villain", avatarId: "fox", avatarImageDataUrl: picture("kick") });
  await post("/api/player/join", { code, playerKey: bystander, name: "Bystander", avatarId: "zap" });
  await post("/api/room/whiteboard/stroke", { code, playerKey: villain, stroke: { tool: "brush", size: "large", color: "#00ff00", points: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }] } });

  const before = await state(code, host, "host");
  const villainId = idOf(before, "Villain");
  const uploaded = before.players.find((player) => player.id === villainId).avatarImageDataUrl;
  assert(await statusOf(uploaded) === 200, "The picture should be served before the kick");

  await post("/api/host/kick", { code, playerKey: host, playerId: villainId });

  // The banned list is in every snapshot, not only the host's, and the host
  // screen is the one the whole room is watching.
  for (const [who, snapshot] of [
    ["the host screen", await state(code, host, "host")],
    ["another player", await state(code, bystander)],
    ["an unauthenticated guest", await state(code, "", "guest")]
  ]) {
    const banned = snapshot.bannedPlayers.find((player) => player.id === villainId);
    assert(banned, "The kicked player should still be listed as banned for " + who);
    assert(banned.name === "Villain" && banned.avatarId, "The host needs to recognise who to unban: " + who);
    assert(banned.avatarImageDataUrl === "",
      "Kicking somebody over their picture sent that picture to " + who + " and printed it in a panel");
    assert(mediaRefs(snapshot.bannedPlayers).length === 0, "A banned entry carried media for " + who);
  }

  assert(await statusOf(uploaded) === 404, "The kicked player's picture is still stored and served at its own URL");
  const after = await state(code, host, "host");
  assert(after.whiteboardStrokes.filter((stroke) => stroke.senderId === villainId).length === 0,
    "What the kicked player drew on the shared whiteboard stayed on it");

  // Unbanning them must not bring anything back.
  await post("/api/host/unban", { code, playerKey: host, playerId: villainId });
  assert(await statusOf(uploaded) === 404, "Unbanning restored the picture the host removed");
}

// ------------------------------------------- a replaced picture is not kept
{
  const code = roomCode();
  const host = key("host");
  const player = key("player");
  await post("/api/room", { code, playerKey: host, intent: "host" });
  await post("/api/player/join", { code, playerKey: player, name: "Ada", avatarId: "fox", avatarImageDataUrl: picture("churn-0") });

  const uploads = [];
  for (let index = 1; index <= 4; index += 1) {
    await post("/api/player/profile", { code, playerKey: player, name: "Ada", avatarId: "fox", avatarImageDataUrl: picture("churn-" + index) });
    uploads.push((await state(code, host, "host")).players.find((entry) => entry.name === "Ada").avatarImageDataUrl);
  }
  const current = uploads[uploads.length - 1];
  const discarded = [...new Set(uploads.slice(0, -1))].filter((url) => url !== current);
  assert(discarded.length === 3, "This check needs distinct replaced pictures to be worth running");
  for (const url of discarded) {
    assert(await statusOf(url) === 404,
      "A picture the player replaced is still stored and served, so asking somebody to change an unacceptable one does not remove it: " + url);
  }
  assert(await statusOf(current) === 200, "The picture they are actually wearing must still be served");
}

// ---------------------------------------------- the dedicated media control
{
  const code = roomCode();
  const host = key("host");
  const villain = key("villain");
  await post("/api/room", { code, playerKey: host, intent: "host" });
  await post("/api/player/join", { code, playerKey: villain, name: "Villain", avatarId: "fox", avatarImageDataUrl: picture("remove") });
  await post("/api/room/chat", { code, playerKey: villain, text: "something the host will remove" });
  await post("/api/room/whiteboard/stroke", { code, playerKey: villain, stroke: { tool: "brush", size: "small", color: "#0000ff", points: [{ x: 0.3, y: 0.3 }] } });

  const before = await state(code, host, "host");
  const villainId = idOf(before, "Villain");
  const uploaded = before.players.find((player) => player.id === villainId).avatarImageDataUrl;

  await post("/api/host/remove-content", { code, playerKey: host, kind: "player-media", targetId: villainId });

  const after = await state(code, host, "host");
  assert(mediaRefs(after).length === 0, "Removing a player's media left some behind at: " + mediaRefs(after).join(", "));
  assert(await statusOf(uploaded) === 404, "Removing a player's media left the bytes served");
  assert(after.whiteboardStrokes.filter((stroke) => stroke.senderId === villainId).length === 0, "Their whiteboard marks stayed");
  assert(after.chatMessages.filter((message) => message.senderId === villainId).every((message) => message.removed),
    "Their chat messages should be removed, not merely stripped of a picture");
}

console.log("Player media moderation smoke passed");
