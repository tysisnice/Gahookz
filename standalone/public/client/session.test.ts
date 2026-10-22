import assert from "node:assert/strict";
import test from "node:test";

import {
  CLIENT_KEY,
  JOIN_KEY,
  type StorageLike,
  normaliseRoomCode,
  readClientKey,
  readRoomPassword,
  readSavedJoin,
  readUrlPassword,
  roomPasswordKey,
  sanitiseJoin,
  urlPasswordFor,
  writeRoomPassword,
  writeSavedJoin
} from "./session.ts";

/** A storage double. `mode` is how the browser is behaving today. */
function fakeStorage(mode: "working" | "readonly" | "blocked" = "working", seed: Record<string, string> = {}) {
  const entries = new Map(Object.entries(seed));
  const storage: StorageLike = {
    getItem(key) {
      if (mode === "blocked") throw new Error("site data is blocked");
      return entries.get(key) ?? null;
    },
    setItem(key, value) {
      if (mode !== "working") throw new Error("storage is full or blocked");
      entries.set(key, value);
    },
    removeItem(key) {
      if (mode !== "working") throw new Error("storage is full or blocked");
      entries.delete(key);
    }
  };
  return { provider: () => storage, entries };
}

// ---------------------------------------------------------------------------
// The saved join. Another release wrote some of this, possibly months ago,
// and the person can edit all of it.

test("a saved join keeps only the five fields the app can use", () => {
  const join = sanitiseJoin({
    code: "abcd",
    name: "Ann",
    avatarId: "fox",
    avatarImageDataUrl: "data:image/png;base64,YQ==",
    gahookForm: "monkey",
    password: "hunter2",
    isHost: true,
    extra: { nested: "junk" }
  });

  assert.deepEqual(join, {
    code: "ABCD",
    name: "Ann",
    avatarId: "fox",
    avatarImageDataUrl: "data:image/png;base64,YQ==",
    gahookForm: "monkey"
  });
});

test("a name that is not a name is dropped rather than handed to the screen", () => {
  // Measured before this module existed: a stored name of 12345 threw
  // "w.trim is not a function" and rendered a blank page with no way back.
  for (const name of [12345, { toString: "no" }, ["Ann"], null, true]) {
    assert.equal(sanitiseJoin({ name }).name, undefined, "rejected: " + JSON.stringify(name));
  }
  assert.equal(sanitiseJoin({ name: "Ann" }).name, "Ann");
});

test("a picture that is not a picture is dropped", () => {
  for (const picture of [
    "http://example.invalid/tracker.gif",
    "javascript:alert(1)",
    "data:text/html,<script>",
    "/media/ABCD/deadbeef"
  ]) {
    assert.equal(sanitiseJoin({ avatarImageDataUrl: picture }).avatarImageDataUrl, undefined, picture);
  }
  assert.equal(
    sanitiseJoin({ avatarImageDataUrl: "data:image/webp;base64,YQ==" }).avatarImageDataUrl,
    "data:image/webp;base64,YQ=="
  );
});

test("a stored name cannot exceed what the server accepts", () => {
  assert.equal(sanitiseJoin({ name: "N".repeat(100) }).name?.length, 24);
});

test("a password an older version stored durably is wiped from the device, not just ignored", () => {
  const local = fakeStorage("working", {
    [JOIN_KEY]: JSON.stringify({ name: "Ann", password: "hunter2" })
  });

  const join = readSavedJoin(local.provider);

  assert.deepEqual(join, { name: "Ann" });
  assert.ok(!String(local.entries.get(JOIN_KEY)).includes("hunter2"), "the credential must be gone from storage");
});

test("a saved join is written field by field, so a password cannot ride along", () => {
  const local = fakeStorage();

  writeSavedJoin(local.provider, { code: "WXYZ", name: "Ann", password: "hunter2", note: "junk" });

  assert.deepEqual(JSON.parse(String(local.entries.get(JOIN_KEY))), { code: "WXYZ", name: "Ann" });
});

test("unreadable storage is an empty join, never an exception", () => {
  assert.deepEqual(readSavedJoin(fakeStorage("blocked").provider), {});
  assert.deepEqual(readSavedJoin(fakeStorage("working", { [JOIN_KEY]: "{not json" }).provider), {});
  assert.deepEqual(readSavedJoin(fakeStorage("working", { [JOIN_KEY]: "[1,2,3]" }).provider), {});
  assert.deepEqual(readSavedJoin(() => null), {});
});

// ---------------------------------------------------------------------------
// The credential. A different answer is a different player.

test("a browser that keeps nothing still gets one player key for the page", () => {
  // Measured on the real client with site data blocked: 1,001 distinct player
  // keys from a single tab, and a screen stuck on "Joining" for ever.
  const blocked = fakeStorage("readonly");
  const memory = {};
  let minted = 0;
  const createId = () => "player-" + ++minted;

  const keys = new Set([0, 1, 2, 3, 4].map(() => readClientKey(blocked.provider, createId, memory)));

  assert.equal(keys.size, 1, "guest play must survive a browser that refuses to store anything");
  assert.equal(minted, 1);
});

test("a key the browser did keep is the one that is used", () => {
  const local = fakeStorage("working", { [CLIENT_KEY]: "stored-key" });
  let minted = 0;

  const key = readClientKey(local.provider, () => "player-" + ++minted, {});

  assert.equal(key, "stored-key");
  assert.equal(minted, 0, "a device with a key must not mint another");
});

test("a new key is stored so that it survives a refresh", () => {
  const local = fakeStorage();
  const key = readClientKey(local.provider, () => "player-1", {});
  assert.equal(local.entries.get(CLIENT_KEY), key);
  assert.equal(readClientKey(local.provider, () => "player-2", {}), key);
});

// ---------------------------------------------------------------------------
// Room passwords: this tab, this room.

test("a room password is kept per room and only for this tab", () => {
  const session = fakeStorage();

  writeRoomPassword(session.provider, "abcd", "hunter2");

  assert.equal(roomPasswordKey("abcd"), "gahookz-room-password-ABCD");
  assert.equal(readRoomPassword(session.provider, "ABCD"), "hunter2");
  assert.equal(readRoomPassword(session.provider, "WXYZ"), "", "another room must not get this password");
});

test("clearing a room password removes it instead of storing an empty one", () => {
  const session = fakeStorage("working", { [roomPasswordKey("ABCD")]: "hunter2" });
  writeRoomPassword(session.provider, "ABCD", "");
  assert.equal(session.entries.has(roomPasswordKey("ABCD")), false);
});

test("no room means nothing is stored", () => {
  const session = fakeStorage();
  writeRoomPassword(session.provider, "", "hunter2");
  assert.equal(session.entries.size, 0);
  assert.equal(readRoomPassword(session.provider, ""), "");
});

// ---------------------------------------------------------------------------
// Legacy links. Old releases wrote /?room=CODE&pwd=SECRET and those links are
// still in people's messages.

test("a password in a link is taken out of the address", () => {
  const read = readUrlPassword("https://gahookz.com/?room=ABCD&pwd=hunter2&locked=1");

  assert.equal(read.password, "hunter2");
  assert.equal(read.code, "ABCD");
  assert.equal(read.href, "/?room=ABCD&locked=1");
  assert.ok(!read.href.includes("hunter2"), "a credential must not stay in the address bar");
});

test("both spellings of the parameter are taken, and both are removed", () => {
  assert.equal(readUrlPassword("https://gahookz.com/ABCD?pw=hunter2").password, "hunter2");
  assert.equal(readUrlPassword("https://gahookz.com/ABCD?pw=hunter2").href, "/ABCD");
  assert.equal(readUrlPassword("https://gahookz.com/ABCD?pwd=a&pw=b").password, "a");
});

test("a link's password is offered to its own room and to no other", () => {
  const captured = readUrlPassword("https://gahookz.com/?room=ABCD&pwd=hunter2");

  assert.equal(urlPasswordFor(captured, "ABCD"), "hunter2");
  assert.equal(urlPasswordFor(captured, "abcd"), "hunter2");
  assert.equal(urlPasswordFor(captured, "WXYZ"), "", "a password typed for one room must not be sent to another");
});

test("a link that names no room keeps the old behaviour", () => {
  // Nothing to disagree with, and refusing it would lock someone out of a
  // room they have a working link for.
  const captured = readUrlPassword("https://gahookz.com/?pwd=hunter2");
  assert.equal(captured.code, "");
  assert.equal(urlPasswordFor(captured, "ABCD"), "hunter2");
  assert.equal(urlPasswordFor(null, "ABCD"), "");
});

test("an address the browser cannot parse is not a crash", () => {
  const read = readUrlPassword("not a url");
  assert.deepEqual(read, { password: "", code: "", href: "not a url" });
});

test("room codes are four letters, upper case", () => {
  assert.equal(normaliseRoomCode(" ab3cd!e "), "ABCD");
  assert.equal(normaliseRoomCode(null), "");
  assert.equal(normaliseRoomCode(1234), "");
});
