// Captures synthetic, credential-free snapshots for every role and phase.
//
// P01 step 1. These exist so that contract and client work has something real
// to validate against: the health schema was strict and narrower than the
// server's actual response, and nobody noticed because no fixture of a real
// response was ever compared to it.
//
// Everything here is synthetic. The room is created by this script, the
// players are invented, and the answers are placeholder text, so no fixture
// can contain a real player's name, question or message. Credentials are
// scrubbed on the way out rather than trusted not to appear.
//
// Run against a disposable server only:
//   HOST=127.0.0.1 PORT=3199 npm start
//   GAHOOKZ_BASE_URL=http://127.0.0.1:3199 node standalone/capture-fixtures.mjs

import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

const base = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
if (/:(3102|80|443)(\/|$)/.test(base) || /gahookz\.com/.test(base)) {
  throw new Error("Refusing to capture fixtures from a live server: " + base);
}

const outDir = new URL("../packages/contracts/test/fixtures/", import.meta.url);

/** Keys whose values must never reach a fixture file. */
const SECRET_KEYS = new Set(["playerKey", "password", "ticket", "credential", "hostKey", "token"]);

function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value === null || typeof value !== "object") return value;
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SECRET_KEYS.has(key)) continue;
    out[key] = scrub(entry);
  }
  return out;
}

/** Fields that change every run and would make a fixture diff meaningless. */
function stabilise(value) {
  if (Array.isArray(value)) return value.map(stabilise);
  if (value === null || typeof value !== "object") return value;
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "serverTime" || key === "phaseEndsAt" || key === "startedAt" || key === "lockedAt") {
      out[key] = typeof entry === "number" ? 1_788_000_000_000 : entry;
    } else {
      out[key] = stabilise(entry);
    }
  }
  return out;
}

const fixtures = {};
const record = (name, payload) => {
  fixtures[name] = stabilise(scrub(payload));
};

async function main() {
  const host = randomUUID();
  let code = "";

  const call = async (path, body = {}) => {
    const response = await fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...(code ? { code } : {}), playerKey: host, ...body })
    });
    return { status: response.status, data: await response.json() };
  };
  const post = async (path, body) => {
    const { data } = await call(path, body);
    if (data.ok === false) throw new Error(path + ": " + data.error);
    return data;
  };
  const stateAs = (key, role) => post("/api/state", { playerKey: key, role });

  record("health", await (await fetch(base + "/api/health")).json());

  const created = await post("/api/room");
  code = created.code;

  const players = Array.from({ length: 4 }, () => randomUUID());
  for (const [index, key] of players.entries()) {
    await post("/api/player/join", { playerKey: key, name: "Player " + (index + 1), avatarId: "frog" });
  }

  record("lobby.host", await stateAs(host, "host"));
  record("lobby.player", await stateAs(players[0], "player"));
  // The shared-display view; the role name is confirmed rather than assumed.
  for (const role of ["spectator", "display", "party"]) {
    const { data } = await call("/api/state", { playerKey: host, role });
    if (data.ok !== false) {
      record("lobby." + role, data);
      break;
    }
  }

  // --- Quiz, through every phase -------------------------------------------
  await post("/api/host/settings", { gameMode: "quiz", roundPreset: "quick" });
  record("building.host", await stateAs(host, "host"));
  record("building.player", await stateAs(players[0], "player"));

  await post("/api/host/lock-setup");
  await post("/api/host/force-start");

  let snapshot = await stateAs(host, "host");
  const seen = new Set();
  for (let guard = 0; snapshot.phase !== "finished" && guard < 120; guard += 1) {
    if (!seen.has(snapshot.phase)) {
      seen.add(snapshot.phase);
      record(snapshot.phase + ".host", snapshot);
      record(snapshot.phase + ".player", await stateAs(players[0], "player"));
    }
    if (snapshot.phase === "reading") {
      await post("/api/host/skip");
    } else if (snapshot.phase === "answering") {
      for (const [index, key] of players.entries()) {
        const own = await stateAs(key, "player");
        if (own.phase !== "answering" || own.ownAnswer) continue;
        const choices = (own.currentQuestion?.answers || []).filter((answer) => !answer.ownAnswer);
        if (choices.length) await post("/api/answer", { playerKey: key, answerId: choices[index % choices.length].id });
      }
      if ((await stateAs(host, "host")).phase === "answering") await post("/api/host/skip");
    } else if (snapshot.phase === "reveal") {
      await post("/api/host/skip");
    } else {
      break;
    }
    snapshot = await stateAs(host, "host");
  }
  record("finished.host", snapshot);
  record("finished.player", await stateAs(players[0], "player"));
  await post("/api/host/reset");

  // --- Herd writing and voting ---------------------------------------------
  await post("/api/host/settings", { gameMode: "herd", roundPreset: "quick" });
  await post("/api/host/lock-setup");
  await post("/api/host/force-start");
  const writer = await stateAs(players[0], "player");
  record("herd-writing.player", writer);
  record("herd-writing.host", await stateAs(host, "host"));
  await post("/api/host/reset");

  // --- Errors and recovery --------------------------------------------------
  const missing = await call("/api/state", { code: "ZZZZ", playerKey: host, role: "host" });
  record("error.room-missing", missing.data);

  const badAction = await call("/api/does-not-exist", {});
  record("error.unknown-action", badAction.data);

  const notHost = await call("/api/host/skip", { playerKey: players[1] });
  record("error.not-host", notHost.data);

  // A reconnect is a fresh snapshot for a role that already exists.
  record("reconnect.player", await stateAs(players[0], "player"));

  await fs.mkdir(outDir, { recursive: true });
  const written = [];
  for (const [name, payload] of Object.entries(fixtures)) {
    const file = new URL(name + ".json", outDir);
    await fs.writeFile(file, JSON.stringify(payload, null, 2) + "\n", "utf8");
    written.push(name);
  }

  // Belt and braces: fail loudly if anything secret-looking survived.
  const all = JSON.stringify(fixtures);
  for (const secret of [host, ...players]) {
    if (all.includes(secret)) throw new Error("A credential reached a fixture: capture is unsafe");
  }

  console.log(JSON.stringify({ ok: true, captured: written.length, fixtures: written.sort() }, null, 2));
}

await main();
