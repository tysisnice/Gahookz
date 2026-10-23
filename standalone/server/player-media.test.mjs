import assert from "node:assert/strict";
import test from "node:test";
import { AVATAR, DRAWING, UPLOAD, clearPlayerMedia, playerMediaSites, renamePlayerEverywhere, retainedPlayerMedia } from "./player-media.mjs";
import { pruneRoomMedia, storeRoomImage } from "./media.mjs";

const url = (n) => "/media/TEST/" + String(n).padStart(32, "0");

// One room that puts a picture in every surface the enumeration knows about.
// The media urls are distinct so a missed surface shows up as a missing url
// rather than as a count that happens to match.
function fullRoom() {
  return {
    code: "TEST",
    players: {
      villain: {
        id: "villain",
        name: "Villain",
        avatarId: "fox",
        avatarImageDataUrl: url(1),
        hiddenAvatarImageDataUrl: url(2),
        customGahook: { frames: [url(3)], customAudioDataUrl: url(4) },
        customGahookBySlot: [{ frames: [url(5)], customAudioDataUrl: "" }],
        latestPoke: null
      },
      bystander: {
        id: "bystander",
        name: "Bystander",
        avatarId: "zap",
        avatarImageDataUrl: url(20),
        hiddenAvatarImageDataUrl: "",
        customGahook: null,
        customGahookBySlot: [],
        // A Gahook the villain sent, still playing on this player's card.
        latestPoke: { senderPlayerId: "villain", targetName: "Bystander", customGahook: { frames: [url(6)], customAudioDataUrl: "" } }
      }
    },
    bannedPlayers: { ghost: { id: "ghost", name: "Ghost", avatarId: "owl", avatarImageDataUrl: url(7) } },
    questions: [{
      id: "q1",
      authorId: "villain",
      authorName: "Villain",
      authorAvatarId: "fox",
      authorAvatarImageDataUrl: url(8),
      imageDataUrl: url(9),
      answers: [{ id: "red", authorId: "villain", authorName: "Villain", authorAvatarId: "fox", authorAvatarImageDataUrl: url(10), imageDataUrl: url(11) }]
    }],
    pendingQuestions: [],
    quizQuestions: [],
    savedQuestionBank: { quiz: { questions: [{ id: "parked", authorId: "villain", authorName: "Villain", authorAvatarImageDataUrl: url(12), imageDataUrl: url(13), answers: [] }], pending: [] } },
    game: { answers: { villain: { imageDataUrl: url(14) } } },
    chatMessages: [{ id: "m1", senderId: "villain", senderName: "Villain", senderAvatarImageDataUrl: url(15) }],
    latestRoomPoke: { senderPlayerId: "villain", targetId: "bystander", targetName: "Bystander", targetAvatarId: "zap", targetAvatarImageDataUrl: url(16), customGahook: { frames: [url(17)], customAudioDataUrl: "" } },
    lastGameSummary: { leaderboard: [{ id: "villain", name: "Villain", avatarId: "fox", avatarImageDataUrl: url(18) }] },
    whiteboardStrokes: [{ id: "s1", senderId: "villain" }, { id: "s2", senderId: "bystander" }],
    whiteboardRevision: 4
  };
}

test("every surface that holds a picture is retained", () => {
  const retained = new Set(retainedPlayerMedia(fullRoom()));
  for (let n = 1; n <= 18; n += 1) {
    if (n === 19) continue;
    assert.ok(retained.has(url(n)), "surface " + n + " is displayed but not retained: " + url(n));
  }
  assert.ok(retained.has(url(20)), "a second player's picture is retained");
});

test("the end-of-game summary is not collected while the room is showing it", () => {
  const room = { code: "TEST", players: {}, lastGameSummary: { leaderboard: [] } };
  const stored = storeRoomImage(room, "data:image/png;base64,YQ==", { maxChars: 100, label: "test" });
  room.lastGameSummary.leaderboard.push({ id: "ada", name: "Ada", avatarId: "fox", avatarImageDataUrl: stored });
  pruneRoomMedia(room);
  assert.equal(room.media.size, 1, "the results screen points at this picture, so it must survive the pruner");
});

test("a room-wide Gahook's target picture is not collected while it is on screen", () => {
  const room = { code: "TEST", players: {} };
  const stored = storeRoomImage(room, "data:image/png;base64,Yg==", { maxChars: 100, label: "test" });
  room.latestRoomPoke = { targetId: "ada", targetAvatarImageDataUrl: stored };
  pruneRoomMedia(room);
  assert.equal(room.media.size, 1);
});

test("clearing a player's media leaves nothing of theirs retained", () => {
  const room = fullRoom();
  clearPlayerMedia(room, "villain");
  const retained = new Set(retainedPlayerMedia(room));
  for (const n of [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18]) {
    assert.ok(!retained.has(url(n)), "the villain's picture at surface " + n + " survived moderation");
  }
  assert.ok(retained.has(url(20)), "another player's picture must be left alone");
  assert.ok(retained.has(url(7)), "an unrelated banned player's record must be left alone");
  // The room-wide banner was the villain's Gahook, so the whole banner goes
  // and takes its copy of the target's avatar reference with it. The target's
  // own picture, url(20) above, is untouched.
  assert.equal(room.latestRoomPoke, null);
});

// The structural rule. A surface added to the enumeration is retained and
// cleared by the same walk, so one cannot be added without the other.
test("clearing every player in the room leaves no retained media at all", () => {
  const room = fullRoom();
  for (const id of ["villain", "bystander", "ghost"]) clearPlayerMedia(room, id);
  assert.deepEqual(retainedPlayerMedia(room), [], "a surface is retained by the pruner that no moderation walk can reach");
});

test("the hidden copy of a picture goes too", () => {
  const room = fullRoom();
  clearPlayerMedia(room, "villain", { kinds: [AVATAR] });
  assert.equal(room.players.villain.hiddenAvatarImageDataUrl, "",
    "a picture parked by switching custom profiles off came back when the setting went on again");
});

test('"name & pfp" replaces the picture and leaves their content alone', () => {
  const room = fullRoom();
  clearPlayerMedia(room, "villain", { kinds: [AVATAR] });
  assert.equal(room.players.villain.avatarImageDataUrl, "");
  assert.equal(room.questions[0].authorAvatarImageDataUrl, "");
  assert.equal(room.chatMessages[0].senderAvatarImageDataUrl, "");
  assert.equal(room.lastGameSummary.leaderboard[0].avatarImageDataUrl, "");
  // Their question, their answer and their Gahook are content, not identity.
  assert.equal(room.questions[0].imageDataUrl, url(9));
  assert.equal(room.questions[0].answers[0].imageDataUrl, url(11));
  assert.deepEqual(room.players.villain.customGahook.frames, [url(3)]);
  assert.equal(room.whiteboardStrokes.length, 2);
});

test("removing a player's media reaches a Gahook of theirs on somebody else's card", () => {
  const room = fullRoom();
  clearPlayerMedia(room, "villain", { kinds: [UPLOAD] });
  assert.equal(room.players.bystander.latestPoke, null,
    "their Gahook kept playing on the card of the player they aimed it at");
  assert.equal(room.latestRoomPoke, null);
});

test("removing a player's media clears their whiteboard marks and bumps the revision", () => {
  const room = fullRoom();
  clearPlayerMedia(room, "villain", { kinds: [DRAWING] });
  assert.deepEqual(room.whiteboardStrokes.map((stroke) => stroke.id), ["s2"]);
  assert.equal(room.whiteboardRevision, 5, "a client that caches by revision would keep drawing the removed strokes");
});

test("renaming reaches every place the old name was printed", () => {
  const room = fullRoom();
  renamePlayerEverywhere(room, "villain", "Jolly Keyboard", "star");
  assert.equal(room.players.villain.name, "Jolly Keyboard");
  assert.equal(room.questions[0].authorName, "Jolly Keyboard");
  assert.equal(room.questions[0].answers[0].authorName, "Jolly Keyboard");
  assert.equal(room.savedQuestionBank.quiz.questions[0].authorName, "Jolly Keyboard");
  assert.equal(room.chatMessages[0].senderName, "Jolly Keyboard");
  assert.equal(room.lastGameSummary.leaderboard[0].name, "Jolly Keyboard");
  assert.equal(room.questions[0].authorAvatarId, "star");
  assert.equal(room.players.bystander.name, "Bystander", "nobody else is renamed");
});

test("an empty player id changes nothing", () => {
  const room = fullRoom();
  const before = retainedPlayerMedia(room).length;
  assert.equal(clearPlayerMedia(room, ""), 0);
  assert.equal(renamePlayerEverywhere(room, "", "X", "fox"), 0);
  assert.equal(retainedPlayerMedia(room).length, before);
});

test("every site declares an owner and a kind", () => {
  for (const site of playerMediaSites(fullRoom())) {
    assert.equal(typeof site.owner, "string", site.where + " has no owner");
    assert.ok([AVATAR, UPLOAD, DRAWING].includes(site.kind), site.where + " has an unknown kind: " + site.kind);
    assert.equal(typeof site.read, "function", site.where + " cannot be read");
  }
});
