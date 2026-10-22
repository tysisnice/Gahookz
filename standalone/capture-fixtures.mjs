// Captures synthetic, credential-free snapshots for every role and phase.
//
// P01 steps 1 and 5. These exist so that contract and client work has something
// real to validate against: the health schema was strict and narrower than the
// server's actual response, and nobody noticed because no fixture of a real
// response was ever compared to it.
//
// A fixture has to be what its name says, or the corpus quietly stops being
// evidence. Three ways it did, found 2026-10-22 and fixed here:
//
//   - `building.*` was captured before `/api/host/lock-setup`, so both files
//     held a `lobby` snapshot and the building phase was never covered at all;
//   - `lobby.spectator` was captured with the *host's* credential and a
//     different `role` string, so it recorded `isHost: true` -- the host's own
//     view under a spectator's name, which proves nothing about a spectator;
//   - nobody ever submitted a question, so `ownQuestions` was `[]` everywhere
//     and the test asserting an author can see their own answer key never ran.
//
// So the flow below plays real games: players write real questions (Classic
// with one correct answer, Majority with one prediction, Herd as prompts),
// everyone votes, and the votes are deliberately split so that a tie reason
// other than "none" reaches a fixture. `fixtures.test.ts` now asserts each of
// those properties rather than trusting this script.
//
// Everything here is synthetic. The room is created by this script, the
// players are invented, and the answers are placeholder text, so no fixture
// can contain a real player's name, question or message. Credentials are
// scrubbed on the way out rather than trusted not to appear.
//
// Two things use this journey, so it is written once and exported:
// run as a script it rewrites the fixture corpus, and `smoke-contract-drift`
// imports `captureFixtures` to validate the same payloads live and to notice
// when the committed corpus has drifted away from what the server now sends.
//
// Run against a disposable server only:
//   HOST=127.0.0.1 PORT=3199 npm start
//   GAHOOKZ_BASE_URL=http://127.0.0.1:3199 node standalone/capture-fixtures.mjs

import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const outDir = new URL("../packages/contracts/test/fixtures/", import.meta.url);

export const FIXTURE_DIR = outDir;

function assertDisposable(base) {
  if (/:(3102|80|443)(\/|$)/.test(base) || /gahookz\.com/.test(base)) {
    throw new Error("Refusing to capture fixtures from a live server: " + base);
  }
  return base;
}

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

/**
 * Plays synthetic games through every phase of all three modes and returns the
 * snapshot each role saw, keyed by `<phase>.<role>`. Nothing is written here.
 */
export async function captureFixtures(baseUrl = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199") {
  const base = assertDisposable(baseUrl);
  const fixtures = {};
  const record = (name, payload) => {
    fixtures[name] = stabilise(scrub(payload));
  };
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
  // A shared display, captured as one really is: a viewer who is not the host.
  // Asking with a different `role` string buys no authority -- the credential
  // decides -- so capturing this with the host's key recorded the host's view.
  for (const role of ["spectator", "display", "party"]) {
    const { data } = await call("/api/state", { playerKey: players[3], role });
    if (data.ok !== false) {
      record("lobby." + role, data);
      break;
    }
  }
  // The keyless shared screen: no credential at all.
  const keyless = await call("/api/state", { playerKey: "", role: "party" });
  if (keyless.data.ok !== false) record("lobby.party-keyless", keyless.data);

  /**
   * Drives a locked-in game to `finished`, recording the first snapshot seen in
   * each phase for the host and for a player.
   *
   * Votes are split two and two on purpose. A unanimous room produces
   * `tieBreakReason: "none"` for every question, which is the one case that
   * needs no contract; a split produces a real tie and a real reason.
   */
  const drive = async (prefix) => {
    let snapshot = await stateAs(host, "host");
    const seen = new Set();
    for (let guard = 0; snapshot.phase !== "finished" && guard < 200; guard += 1) {
      const phase = snapshot.phase;
      if (!seen.has(phase)) {
        seen.add(phase);
        record(prefix + phase + ".host", snapshot);
        record(prefix + phase + ".player", await stateAs(players[0], "player"));
      }
      if (phase === "answering") {
        for (const [index, key] of players.entries()) {
          const own = await stateAs(key, "player");
          if (own.phase !== "answering" || own.ownAnswer) continue;
          const choices = (own.currentQuestion?.answers || []).filter((answer) => !answer.ownAnswer);
          if (choices.length) {
            await post("/api/answer", { playerKey: key, answerId: choices[index % 2 % choices.length].id });
          }
        }
      }
      if (phase !== "reading" && phase !== "answering" && phase !== "reveal") break;
      if ((await stateAs(host, "host")).phase === phase) await post("/api/host/skip");
      snapshot = await stateAs(host, "host");
    }
    record(prefix + "finished.host", snapshot);
    record(prefix + "finished.player", await stateAs(players[0], "player"));
  };

  /** Everyone marks ready, then the host starts; force-start is the fallback. */
  const startGame = async () => {
    for (const key of players) await post("/api/player/ready", { playerKey: key, ready: true });
    const started = await call("/api/host/start", {});
    if (started.data.ok === false) await post("/api/host/force-start", {});
  };

  // --- Quiz, Classic scoring, through every phase --------------------------
  await post("/api/host/settings", { gameMode: "quiz", roundPreset: "quick" });
  await post("/api/host/lock-setup");
  // Genuinely the building phase this time, and before any question exists.
  record("building.host", await stateAs(host, "host"));
  record("building.player", await stateAs(players[0], "player"));

  for (const [index, key] of players.entries()) {
    await post("/api/question", {
      playerKey: key,
      text: "Placeholder Classic question " + (index + 1) + "?",
      answers: [
        { text: "Placeholder right answer", correct: true },
        { text: "Placeholder wrong answer" },
        { text: "Placeholder other answer" }
      ]
    });
  }
  // An author in the building phase: the only snapshot that carries a player's
  // own answer key, which is the counterpart to withholding it from everyone else.
  record("building.author", await stateAs(players[0], "player"));

  await startGame();
  await drive("");
  await post("/api/host/reset");

  // --- Quiz, Majority scoring: predictions and a real tie ------------------
  await post("/api/host/settings", { gameMode: "majority", roundPreset: "quick" });
  await post("/api/host/lock-setup");
  for (const [index, key] of players.entries()) {
    await post("/api/question", {
      playerKey: key,
      text: "Placeholder Majority question " + (index + 1) + "?",
      answers: [
        { text: "Placeholder predicted answer", predicted: true },
        { text: "Placeholder second answer" },
        { text: "Placeholder third answer" }
      ]
    });
  }
  record("majority-building.author", await stateAs(players[0], "player"));
  await startGame();
  await drive("majority-");
  await post("/api/host/reset");

  // --- Herd: private writing, then voting and attribution at reveal --------
  await post("/api/host/settings", { gameMode: "herd", roundPreset: "quick" });
  await post("/api/host/lock-setup");
  for (const [index, key] of players.entries()) {
    await post("/api/question", { playerKey: key, text: "Placeholder Herd prompt " + (index + 1) + "?", answers: [] });
  }
  await startGame();
  record("herd-writing.player", await stateAs(players[0], "player"));
  record("herd-writing.host", await stateAs(host, "host"));

  for (const [index, key] of players.entries()) {
    const own = await stateAs(key, "player");
    for (const [slot, assignment] of (own.ownHerdAssignments || []).entries()) {
      await post("/api/herd/answer", {
        playerKey: key,
        questionId: assignment.questionId,
        text: "Placeholder Herd answer " + (index + 1) + "-" + (slot + 1)
      });
    }
    await post("/api/player/ready", { playerKey: key, ready: true });
  }
  if ((await stateAs(host, "host")).phase === "herd-writing") await post("/api/host/skip");
  await drive("herd-");
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

  // Belt and braces: fail loudly if anything secret-looking survived. This runs
  // for the smoke consumer too, so a leak is caught even when nothing is saved.
  const all = JSON.stringify(fixtures);
  for (const secret of [host, ...players]) {
    if (all.includes(secret)) throw new Error("A credential reached a fixture: capture is unsafe");
  }

  return fixtures;
}

/** Rewrites the committed corpus from a fresh capture. */
export async function writeFixtures(baseUrl) {
  const fixtures = await captureFixtures(baseUrl);
  await fs.mkdir(outDir, { recursive: true });
  const written = [];
  for (const [name, payload] of Object.entries(fixtures)) {
    await fs.writeFile(new URL(name + ".json", outDir), JSON.stringify(payload, null, 2) + "\n", "utf8");
    written.push(name);
  }
  return written.sort();
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const written = await writeFixtures();
  console.log(JSON.stringify({ ok: true, captured: written.length, fixtures: written }, null, 2));
}
