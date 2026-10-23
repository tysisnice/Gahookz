import { allRoomQuestions } from "./content-inventory.mjs";

// A room copies a player's uploaded picture and displayed identity into more
// places than any one handler remembered. The retain list inside the pruner and
// the clear list inside each moderation handler were written out separately,
// and they drifted in both directions: a kicked player's picture was kept and
// re-broadcast to the whole room, while the end-of-game summary pointed at
// bytes the pruner was free to collect.
//
// Both walks now start here. A surface added to this enumeration is retained
// and cleared together, so a new place to keep a picture cannot join the room
// while joining only one of the two.
//
// Each site declares who it belongs to and what sort of copy it holds:
//
//   avatar   a copy of the player's profile picture, and the name beside it
//   upload   other media that player put into the room
//   drawing  marks they left on the shared whiteboard; no media, still theirs
//
// Moderation chooses by kind, because the host's controls mean different
// things. "Randomize name & pfp" replaces who someone appears to be and must
// not delete the question they wrote; "Remove player media" takes the lot.
export const AVATAR = "avatar";
export const UPLOAD = "upload";
export const DRAWING = "drawing";

function gahookMedia(gahook) {
  if (!gahook) return [];
  const frames = Array.isArray(gahook.frames) ? gahook.frames : [];
  return [...frames, gahook.customAudioDataUrl];
}

export function playerMediaSites(room) {
  const sites = [];

  for (const player of Object.values(room?.players || {})) {
    sites.push({
      owner: player.id,
      kind: AVATAR,
      where: "player",
      // The hidden copy is the one moderation kept missing. Switching custom
      // profiles off parks the picture here, so a host who then randomised the
      // player cleared an already-empty field and the picture came back the
      // moment the setting went on again.
      read: () => [player.avatarImageDataUrl, player.hiddenAvatarImageDataUrl],
      clear: () => {
        player.avatarImageDataUrl = "";
        player.hiddenAvatarImageDataUrl = "";
      },
      rename: (name, avatarId) => {
        player.name = name;
        player.avatarId = avatarId;
      }
    });
    sites.push({
      owner: player.id,
      kind: UPLOAD,
      where: "player.customGahook",
      read: () => [
        ...gahookMedia(player.customGahook),
        ...(Array.isArray(player.customGahookBySlot) ? player.customGahookBySlot : []).flatMap(gahookMedia)
      ],
      // Both local slots, not just the selected one: pruning the active slot
      // alone deleted the other slot's frames as soon as a player switched.
      clear: () => {
        player.customGahook = null;
        player.customGahookBySlot = [];
      },
      rename: null
    });

    // A Gahook sitting on this player's card was uploaded by whoever sent it,
    // so it answers to that person's moderation, not to this one's. Clearing
    // only the sender's own slots left their picture playing on the card of
    // the player they aimed it at.
    const poke = player.latestPoke;
    if (poke) {
      sites.push({
        owner: poke.senderPlayerId || player.id,
        kind: UPLOAD,
        where: "player.latestPoke",
        read: () => gahookMedia(poke.customGahook),
        clear: () => { player.latestPoke = null; },
        rename: null
      });
      sites.push({
        owner: player.id,
        kind: AVATAR,
        where: "player.latestPoke.target",
        read: () => [],
        clear: null,
        rename: (name) => { poke.targetName = name; }
      });
    }
  }

  for (const banned of Object.values(room?.bannedPlayers || {})) {
    sites.push({
      owner: banned.id,
      kind: AVATAR,
      where: "bannedPlayers",
      read: () => [banned.avatarImageDataUrl],
      clear: () => { banned.avatarImageDataUrl = ""; },
      rename: (name, avatarId) => {
        banned.name = name;
        banned.avatarId = avatarId;
      }
    });
  }

  for (const question of allRoomQuestions(room || {})) {
    sites.push({
      owner: question.authorId,
      kind: AVATAR,
      where: "question.author",
      read: () => [question.authorAvatarImageDataUrl],
      clear: () => { question.authorAvatarImageDataUrl = ""; },
      rename: (name, avatarId) => {
        question.authorName = name;
        question.authorAvatarId = avatarId;
      }
    });
    sites.push({
      owner: question.authorId,
      kind: UPLOAD,
      where: "question.image",
      read: () => [question.imageDataUrl],
      clear: () => { question.imageDataUrl = ""; },
      rename: null
    });
    for (const answer of question.answers || []) {
      if (!answer.authorId) continue;
      sites.push({
        owner: answer.authorId,
        kind: AVATAR,
        where: "answer.author",
        read: () => [answer.authorAvatarImageDataUrl],
        clear: () => { answer.authorAvatarImageDataUrl = ""; },
        rename: (name, avatarId) => {
          answer.authorName = name;
          answer.authorAvatarId = avatarId;
        }
      });
      sites.push({
        owner: answer.authorId,
        kind: UPLOAD,
        where: "answer.image",
        read: () => [answer.imageDataUrl],
        clear: () => { answer.imageDataUrl = ""; },
        rename: null
      });
    }
  }

  for (const [playerId, answer] of Object.entries(room?.game?.answers || {})) {
    sites.push({
      owner: playerId,
      kind: UPLOAD,
      where: "game.answer",
      read: () => [answer?.imageDataUrl],
      clear: () => { if (answer) answer.imageDataUrl = ""; },
      rename: null
    });
  }

  for (const message of room?.chatMessages || []) {
    sites.push({
      owner: message.senderId,
      kind: AVATAR,
      where: "chatMessage",
      read: () => [message.senderAvatarImageDataUrl],
      clear: () => { message.senderAvatarImageDataUrl = ""; },
      rename: (name) => { message.senderName = name; }
    });
  }

  // The room-wide poke and the summary below it were both read by the snapshot
  // and missed by the pruner, so the room could be showing a picture the
  // pruner was free to collect.
  const roomPoke = room?.latestRoomPoke;
  if (roomPoke) {
    sites.push({
      owner: roomPoke.senderPlayerId || "",
      kind: UPLOAD,
      where: "latestRoomPoke.gahook",
      read: () => gahookMedia(roomPoke.customGahook),
      clear: () => { room.latestRoomPoke = null; },
      rename: null
    });
    if (roomPoke.targetId) {
      sites.push({
        owner: roomPoke.targetId,
        kind: AVATAR,
        where: "latestRoomPoke.target",
        read: () => [roomPoke.targetAvatarImageDataUrl],
        clear: () => { roomPoke.targetAvatarImageDataUrl = ""; },
        rename: (name, avatarId) => {
          roomPoke.targetName = name;
          roomPoke.targetAvatarId = avatarId;
        }
      });
    }
  }

  for (const entry of room?.lastGameSummary?.leaderboard || []) {
    sites.push({
      owner: entry.id,
      kind: AVATAR,
      where: "lastGameSummary",
      read: () => [entry.avatarImageDataUrl],
      clear: () => { entry.avatarImageDataUrl = ""; },
      rename: (name, avatarId) => {
        entry.name = name;
        entry.avatarId = avatarId;
      }
    });
  }

  const strokes = room?.whiteboardStrokes;
  if (Array.isArray(strokes)) {
    for (const owner of new Set(strokes.map((stroke) => String(stroke?.senderId || "")))) {
      if (!owner) continue;
      sites.push({
        owner,
        kind: DRAWING,
        where: "whiteboardStrokes",
        read: () => [],
        clear: () => {
          const kept = room.whiteboardStrokes.filter((stroke) => String(stroke?.senderId || "") !== owner);
          if (kept.length === room.whiteboardStrokes.length) return;
          room.whiteboardStrokes = kept;
          room.whiteboardRevision = Number(room.whiteboardRevision || 0) + 1;
        },
        rename: null
      });
    }
  }

  return sites;
}

// Every media reference the room still means to show. Anything outside this set
// is unreachable and safe for the pruner to delete.
export function retainedPlayerMedia(room) {
  const retained = [];
  for (const site of playerMediaSites(room)) {
    for (const value of site.read()) {
      if (value) retained.push(value);
    }
  }
  return retained;
}

// Clear one player's copies. `kinds` chooses how much a given host control
// means: the default is everything that is theirs.
export function clearPlayerMedia(room, playerId, { kinds = [AVATAR, UPLOAD, DRAWING] } = {}) {
  const owner = String(playerId || "");
  if (!owner) return 0;
  const wanted = new Set(kinds);
  let cleared = 0;
  for (const site of playerMediaSites(room)) {
    if (site.owner !== owner || !wanted.has(site.kind) || !site.clear) continue;
    site.clear();
    cleared += 1;
  }
  return cleared;
}

// Rewrite the identity shown beside everything a player left behind, so a host
// who replaces an unacceptable name does not leave it printed in the chat, on
// the results screen or on a prompt somebody is about to read aloud.
export function renamePlayerEverywhere(room, playerId, name, avatarId) {
  const owner = String(playerId || "");
  if (!owner) return 0;
  let renamed = 0;
  for (const site of playerMediaSites(room)) {
    if (site.owner !== owner || !site.rename) continue;
    site.rename(name, avatarId);
    renamed += 1;
  }
  return renamed;
}
