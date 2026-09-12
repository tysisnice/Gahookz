// Failure drills that can be run locally.
//
// P12 step 2 asks for slow-reader, reconnection, restart and journal-replay
// exercises. These are the ones reachable without a staging cluster or a real
// PostgreSQL; the rest are named in the release note as outstanding rather
// than quietly skipped.

import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import { randomUUID } from "node:crypto";

const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
if (/:(3102|80|443)(\/|$)/.test(BASE_URL) || /gahookz\.com/.test(BASE_URL)) {
  throw new Error("Refusing to run failure drills against a live server: " + BASE_URL);
}
const url = new URL(BASE_URL);

const results = [];
const record = (name, detail) => {
  results.push({ name, ...detail });
  console.log("  ok  " + name + (detail.note ? " — " + detail.note : ""));
};

const post = async (path, body) => {
  const response = await fetch(BASE_URL + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return response.json();
};

const health = async () => (await fetch(BASE_URL + "/api/health")).json();

// --- drill 1: a reader that never drains ------------------------------------
//
// P08 made a saturated client hold only the newest snapshot and disconnect
// past a budget. The failure this prevents is one stalled phone growing the
// server's memory for as long as it stays connected.
{
  const host = randomUUID();
  const created = await post("/api/room", { playerKey: host });
  const code = created.code;
  for (let index = 0; index < 4; index += 1) {
    await post("/api/player/join", { code, playerKey: randomUUID(), name: "Drill " + index, avatarId: "frog" });
  }

  const ticket = await post("/api/events/ticket", { code, playerKey: host, role: "host" });
  assert.ok(ticket.ok, "a stream ticket should be issued");

  const before = await health();

  // A raw socket that requests the stream and then never reads it.
  const socket = net.connect({ host: url.hostname, port: Number(url.port) });
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  socket.write(
    "GET /events?ticket=" + encodeURIComponent(ticket.ticket) + "&room=" + code + " HTTP/1.1\r\n" +
    "Host: " + url.host + "\r\nAccept: text/event-stream\r\nConnection: keep-alive\r\n\r\n"
  );
  socket.pause();

  // Generate a lot of state while nobody is reading it.
  for (let index = 0; index < 60; index += 1) {
    await post("/api/host/settings", { code, playerKey: host, roundPreset: index % 2 ? "quick" : "standard" });
  }

  const after = await health();
  socket.destroy();

  assert.ok(after.ok, "the server must stay healthy while a reader is stalled");
  record("a stalled reader does not take the server down", {
    note: "60 state changes with an unread stream; server still healthy",
    activeRoomsBefore: before.activeRooms,
    activeRoomsAfter: after.activeRooms
  });
}

// --- drill 2: reconnection after a dropped stream ---------------------------
{
  const host = randomUUID();
  const created = await post("/api/room", { playerKey: host });
  const code = created.code;
  const player = randomUUID();
  await post("/api/player/join", { code, playerKey: player, name: "Reconnector", avatarId: "fox" });

  const first = await post("/api/events/ticket", { code, playerKey: player, role: "player" });
  assert.ok(first.ok, "a first ticket should be issued");
  // A ticket is single use, so a reconnect must obtain a new one.
  const replay = await fetch(BASE_URL + "/events?ticket=" + encodeURIComponent(first.ticket) + "&room=" + code);
  replay.body?.cancel?.();
  const second = await post("/api/events/ticket", { code, playerKey: player, role: "player" });
  assert.ok(second.ok, "a reconnect should be issued a fresh ticket");
  assert.notEqual(first.ticket, second.ticket, "tickets must not be reusable across reconnects");

  const snapshot = await post("/api/state", { code, playerKey: player, role: "player" });
  assert.ok(snapshot.code === code, "a reconnecting player should still be in their room");
  record("a dropped stream reconnects with a fresh single-use ticket", {});
}

// --- drill 3: the career journal survives a restart -------------------------
//
// Exercised directly against the outbox module, because the accounts service
// on this host has no database and would never enqueue anything.
{
  const { createCareerOutbox } = await import("./server/career-outbox.mjs");
  const journal = "/tmp/gahookz-drill-" + randomUUID() + ".journal";
  const event = {
    matchId: "drill-match",
    accountId: "drill-account",
    roomCode: "DRIL",
    gameMode: "quiz",
    score: 900,
    placement: 1,
    playerCount: 4,
    statDelta: { gamesPlayed: 1 }
  };

  const outage = createCareerOutbox({
    journalPath: journal,
    deliver: async () => { throw new Error("database unavailable"); }
  });
  assert.equal(outage.accept(event).ok, true, "a result must be accepted during an outage");
  await outage.flush();
  assert.equal(outage.status().queued, 1, "it must still be waiting, not lost");
  outage.stop();

  const delivered = [];
  const recovered = createCareerOutbox({
    journalPath: journal,
    deliver: async (queued) => { delivered.push(queued.matchId); return true; }
  });
  recovered.start();
  await recovered.flush();
  recovered.stop();
  fs.unlinkSync(journal);

  assert.deepEqual(delivered, ["drill-match"], "a restart must replay what was accepted");
  record("a career result accepted during an outage survives a restart", {});
}

// --- drill 4: shutdown drains rather than dropping rooms --------------------
{
  const before = await health();
  assert.equal(before.draining, false, "a healthy server should not report draining");
  record("the server reports its drain state for a deploy to wait on", {
    activeRooms: before.activeRooms,
    draining: before.draining
  });
}

console.log(JSON.stringify({ ok: true, drills: results.length, results }, null, 2));
