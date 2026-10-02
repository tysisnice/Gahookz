// Optional accounts, end to end, with the developer sign-in.
//
//   sign in -> join and play as normal -> profile and custom Gahooks saved ->
//   sign out -> sign in again -> everything retained -> restored into a new
//   room on another "device" -> a guest who signs in from a room keeps what
//   they drew -> delete -> gone everywhere, cookie cleared, seats detached.
//
// Plus the guard: a production process refuses the developer sign-in even
// when GAHOOKZ_DEV_LOGIN=1 is set.
//
// This test owns its servers (memory repository, temporary journal, free
// loopback ports), so it runs the same alone or inside test:disposable, and it
// never touches a shared, development or production process.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "gahookz-accounts-smoke-"));
const servers = [];

async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function startServer(name, extraEnv) {
  const port = await freePort();
  const baseUrl = "http://127.0.0.1:" + port;
  const instance = "accounts-smoke-" + name;
  const child = spawn(process.execPath, ["--import", "tsx", new URL("./server.js", import.meta.url).pathname], {
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      HOST: "127.0.0.1",
      PORT: String(port),
      DATABASE_URL: "",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      GAHOOKZ_REQUIRE_POSTGRES: "0",
      GAHOOKZ_DRAIN_TIMEOUT_MS: "0",
      GAHOOKZ_CAREER_JOURNAL: path.join(scratch, name + ".journal"),
      GAHOOKZ_INSTANCE_ID: instance,
      ...extraEnv
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const server = { child, baseUrl, log: "" };
  child.stdout.on("data", (chunk) => { server.log += chunk; });
  child.stderr.on("data", (chunk) => { server.log += chunk; });
  servers.push(server);
  for (let attempt = 0; attempt < 150; attempt++) {
    if (child.exitCode !== null) throw new Error(name + " server exited: " + server.log);
    try {
      const health = await fetch(baseUrl + "/api/health").then((response) => response.json());
      if (health.instance !== instance) throw new Error("Unexpected listener on " + baseUrl);
      return server;
    } catch (error) {
      if (/Unexpected listener/.test(String(error?.message))) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(name + " server did not start: " + server.log);
}

async function stopServers() {
  for (const { child } of servers) {
    if (child.exitCode !== null) continue;
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 5000))]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

function client(baseUrl) {
  async function post(pathname, body = {}, { cookie = "", origin = baseUrl } = {}) {
    const response = await fetch(baseUrl + pathname, {
      method: "POST",
      headers: { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });
    return { status: response.status, data: await response.json().catch(() => null), setCookie: response.headers.get("set-cookie") || "" };
  }
  async function account(cookie = "") {
    const response = await fetch(baseUrl + "/api/account", { headers: cookie ? { cookie } : {} });
    return response.json();
  }
  return { post, account };
}

const sessionCookieFrom = (setCookie) => {
  const match = String(setCookie).match(/gahookz_session=([^;]*)/);
  return match && match[1] ? "gahookz_session=" + match[1] : "";
};

const customGahook = (name) => ({ name, frames: [TINY_PNG], backgroundId: "monkey", backgroundColor: "#246bfe", effectId: "spin", soundId: "boing", customAudioDataUrl: "", customAudioName: "" });

async function eventually(check, message) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

try {
  // --- a development server with the developer sign-in ----------------------
  const dev = await startServer("dev", { NODE_ENV: "development", GAHOOKZ_DEV_LOGIN: "1" });
  const { post, account } = client(dev.baseUrl);

  const anonymous = await account();
  assert.equal(anonymous.signedIn, false);
  assert.equal(anonymous.account, null, "a request without a cookie gets no account");
  assert.equal(anonymous.devLoginAvailable, true, "the opt-in enables the developer sign-in in development");
  assert.equal(anonymous.googleAvailable, false);

  // A guest host creates the room; nobody needs an account to play.
  const hostKey = randomUUID();
  const room = await post("/api/room", { playerKey: hostKey });
  assert.equal(room.data?.ok, true, "a guest creates a room");
  const code = room.data.code;
  const guestKey = randomUUID();
  const guestJoin = await post("/api/player/join", { code, playerKey: guestKey, name: "Plain Guest", avatarId: "frog" });
  assert.equal(guestJoin.data?.ok, true, "a guest joins with no account");

  assert.equal((await post("/api/account/dev-login", { displayName: "x" }, { origin: "https://attacker.invalid" })).status, 403, "sign-in is same-origin only");
  const missingName = await post("/api/account/dev-login", { displayName: "   " });
  assert.equal(missingName.status, 400);
  const login = await post("/api/account/dev-login", { displayName: "Smoke Tester" });
  assert.equal(login.status, 200);
  const cookie = sessionCookieFrom(login.setCookie);
  assert.ok(cookie, "the developer sign-in sets the session cookie");
  assert.match(login.setCookie, /HttpOnly/);
  assert.equal(login.data.signedIn, true);
  assert.equal(login.data.account.developer, true, "the account is labelled as a developer account");
  assert.equal(login.data.account.customGahookSlots, 2, "an account keeps both custom Gahook slots");
  assert.equal(login.data.account.profile, null, "a new account has no saved look yet");

  // Playing normally saves the look.
  const playerKey = randomUUID();
  const joined = await post("/api/player/join", { code, playerKey, name: "Banana Bob", avatarId: "frog", avatarImageDataUrl: TINY_PNG, gahookForm: "gorilla" }, { cookie });
  assert.equal(joined.data?.ok, true, "a signed-in player joins");
  for (const slot of [0, 1]) {
    const saved = await post("/api/player/custom-gahook", { code, playerKey, slot, customGahook: customGahook("Cloud " + slot) }, { cookie });
    assert.equal(saved.data?.ok, true, "custom Gahook slot " + slot + " saves");
    assert.equal(saved.data.persisted, true, "slot " + slot + " is written to the account");
  }
  const guestSave = await post("/api/player/custom-gahook", { code, playerKey: guestKey, slot: 1, customGahook: customGahook("Guest") });
  assert.equal(guestSave.data?.ok, true, "a guest still gets both local slots");
  assert.equal(guestSave.data.persisted, false, "a guest's custom Gahook is not persisted anywhere");

  const formChange = await post("/api/player/gahook-form", { code, playerKey, gahookForm: "koala" }, { cookie });
  assert.equal(formChange.data?.ok, true);
  const afterPlay = await eventually(async () => {
    const status = await account(cookie);
    return status.account?.profile?.gahookForm === "koala" ? status : null;
  }, "the chosen Gahook form reaches the saved profile");
  assert.equal(afterPlay.account.profile.playerName, "Banana Bob");
  assert.equal(afterPlay.account.profile.avatarImageDataUrl, TINY_PNG, "the drawn profile picture is saved as an image");
  assert.deepEqual(afterPlay.account.savedCustomGahooks.map((item) => [item.slot, item.name]), [[0, "Cloud 0"], [1, "Cloud 1"]]);
  assert.ok(afterPlay.account.savedCustomGahooks.every((item) => item.previewFrame.startsWith("data:image/")), "the panel gets a preview per slot");
  assert.equal(JSON.stringify(afterPlay).includes("customAudioDataUrl"), false, "the browser gets previews, not full saved configurations");

  // Sign out, then back in: retained.
  const logout = await post("/api/account/logout", {}, { cookie });
  assert.equal(logout.data?.ok, true);
  assert.match(logout.setCookie, /Max-Age=0/);
  assert.equal((await account(cookie)).signedIn, false, "the old cookie is dead after sign-out");
  const relogin = await post("/api/account/dev-login", { displayName: "smoke tester" });
  const cookie2 = sessionCookieFrom(relogin.setCookie);
  const retained = await account(cookie2);
  assert.equal(retained.account.profile.playerName, "Banana Bob", "the saved look survives sign-out and sign-in");
  assert.equal(retained.account.profile.gahookForm, "koala");
  assert.equal(retained.account.savedCustomGahooks.length, 2, "both saved custom Gahooks survive");

  // Another device, another room: the saved Gahooks are loaded into the seat.
  const room2 = await post("/api/room", { playerKey: randomUUID() });
  const code2 = room2.data.code;
  const otherDevice = randomUUID();
  const joined2 = await post("/api/player/join", { code: code2, playerKey: otherDevice, name: retained.account.profile.playerName, avatarId: "frog", gahookForm: "custom" }, { cookie: cookie2 });
  assert.equal(joined2.data?.ok, true);
  const seat = (await post("/api/state", { code: code2, playerKey: otherDevice, role: "player" }, { cookie: cookie2 })).data;
  assert.equal(seat.customGahookOptions.accountLinked, true);
  assert.deepEqual(seat.customGahookOptions.slots.map((slot) => [slot.drawn, slot.name]), [[true, "Cloud 0"], [true, "Cloud 1"]], "both saved slots are restored into a new room");
  assert.equal(seat.ownCustomGahook.name, "Cloud 0");

  // A guest who signs in from inside a room keeps what they drew there.
  const upgradeKey = randomUUID();
  await post("/api/player/join", { code: code2, playerKey: upgradeKey, name: "Late Signer", avatarId: "frog" });
  await post("/api/player/custom-gahook", { code: code2, playerKey: upgradeKey, slot: 0, customGahook: customGahook("Drawn As Guest") });
  const upgrade = await post("/api/account/dev-login", { displayName: "Upgrade Tester" });
  const upgradeCookie = sessionCookieFrom(upgrade.setCookie);
  assert.equal((await post("/api/account/link", { code: code2, playerKey: randomUUID() }, { cookie: upgradeCookie })).data.linked, false, "linking without a seat is harmless");
  const linked = await post("/api/account/link", { code: code2, playerKey: upgradeKey }, { cookie: upgradeCookie });
  assert.equal(linked.data?.ok, true);
  assert.equal(linked.data.uploaded, 1, "the guest's drawing is uploaded to the new account");
  const upgraded = await account(upgradeCookie);
  assert.equal(upgraded.account.savedCustomGahooks[0]?.name, "Drawn As Guest");
  assert.equal(upgraded.account.profile?.playerName, "Late Signer", "the guest's look becomes the account's first saved look");
  assert.equal((await post("/api/account/link", { code: code2, playerKey: upgradeKey })).status, 400, "linking needs a session");

  // Delete: explicit confirmation, session required, same origin.
  assert.equal((await post("/api/account/delete", { confirm: "DELETE" })).status, 401, "deletion needs a session");
  assert.equal((await post("/api/account/delete", {}, { cookie: cookie2 })).status, 400, "deletion needs the explicit confirmation");
  assert.equal((await post("/api/account/delete", { confirm: "yes" }, { cookie: cookie2 })).status, 400);
  assert.equal((await post("/api/account/delete", { confirm: "DELETE" }, { cookie: cookie2, origin: "https://attacker.invalid" })).status, 403, "deletion is same-origin only");
  const deleted = await post("/api/account/delete", { confirm: "DELETE" }, { cookie: cookie2 });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.data.deleted, true);
  assert.match(deleted.setCookie, /gahookz_session=;.*Max-Age=0/, "the session cookie is cleared");
  assert.equal((await account(cookie2)).signedIn, false, "the deleted account's session is gone");
  const detached = (await post("/api/state", { code: code2, playerKey: otherDevice, role: "player" })).data;
  assert.equal(detached.customGahookOptions.accountLinked, false, "seats no longer point at the deleted account");
  assert.equal(detached.ownPlayer?.name, "Banana Bob", "the player stays in the room as a guest");
  const fresh = await post("/api/account/dev-login", { displayName: "Smoke Tester" });
  assert.equal(fresh.data.account.profile, null, "signing in with the same name again finds nothing: the look is gone");
  assert.deepEqual(fresh.data.account.savedCustomGahooks, [], "the saved custom Gahooks are gone");
  assert.equal(fresh.data.account.stats.gamesPlayed, 0);
  assert.equal((await account(upgradeCookie)).account.savedCustomGahooks.length, 1, "other accounts are untouched");

  // Guests are unaffected by all of it.
  const guestState = (await post("/api/state", { code, playerKey: guestKey, role: "player" })).data;
  assert.equal(guestState.ownPlayer?.name, "Plain Guest");
  assert.equal(guestState.customGahookOptions.slots[1].name, "Guest");
  console.log("Developer sign-in, saved look and custom Gahooks, sign-out/in retention, cross-room restore, guest upgrade and deletion passed.");

  // --- the production guard --------------------------------------------------
  const production = await startServer("production", { NODE_ENV: "production", GAHOOKZ_DEV_LOGIN: "1", GAHOOKZ_HTTPS: "0", GAHOOKZ_TRUST_PROXY: "0" });
  const prod = client(production.baseUrl);
  const prodStatus = await prod.account();
  assert.equal(prodStatus.devLoginAvailable, false, "production never offers the developer sign-in");
  const refused = await prod.post("/api/account/dev-login", { displayName: "Intruder" });
  assert.equal(refused.status, 404, "production refuses the developer sign-in even with GAHOOKZ_DEV_LOGIN=1");
  assert.equal(refused.setCookie, "", "and sets no cookie");
  assert.match(production.log, /GAHOOKZ_DEV_LOGIN is ignored/, "the refusal is logged at start-up");
  const prodRoom = await prod.post("/api/room", { playerKey: randomUUID() });
  assert.equal(prodRoom.data?.ok, true, "guest rooms work on the production server as always");
  console.log("Production refuses the developer sign-in with GAHOOKZ_DEV_LOGIN=1 set; guest rooms unaffected.");
} catch (error) {
  for (const server of servers) process.stderr.write("--- server log " + server.baseUrl + " ---\n" + server.log.slice(-4000) + "\n");
  throw error;
} finally {
  await stopServers();
  fs.rmSync(scratch, { recursive: true, force: true });
}
console.log("Account smoke servers stopped.");
