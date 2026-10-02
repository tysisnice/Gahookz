// Screenshots of the new Music switch (audio slice, 2026-09-25 update):
// player Settings, the host's Lobby rules, and the join screen's menu.
//
//   flock /tmp/gahookz-verify.lock npm run test:disposable -- \
//     node docs/verification/2026-09-25-update/audio-ui/capture.mjs
//
// Disposable server only: it creates a room and joins a player.
import assert from "node:assert/strict";
import fs from "node:fs";
import puppeteer from "puppeteer";

const base = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
assert.equal(base, "http://127.0.0.1:3199", "capture only runs against the disposable server");
const out = "docs/verification/2026-09-25-update/audio-ui";
fs.mkdirSync(out, { recursive: true });
const SIZES = [
  { name: "390x844", width: 390, height: 844, mobile: true },
  { name: "1280x800", width: 1280, height: 800, mobile: false }
];
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
const hostKey = code + "-host-" + Date.now().toString(36);
const playerKey = code + "-player-" + Date.now().toString(36);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errors = [];

async function post(path, body) {
  const response = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  assert.equal(data.ok, true, path + ": " + JSON.stringify(data));
  return data;
}

await post("/api/room", { code, playerKey: hostKey, intent: "host" });
await post("/api/player/join", { code, playerKey, name: "Mighty Moose", avatarId: "fox" });

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

async function open(key, size) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: size.width, height: size.height, isMobile: size.mobile, hasTouch: size.mobile, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => errors.push(size.name + ": " + error.message));
  await page.evaluateOnNewDocument((clientKey) => {
    localStorage.setItem("gahookz-client-key", clientKey);
    for (const mode of ["quiz", "herd", "majority", "host", "overview"]) localStorage.setItem("gahookz-how-to-play-seen-v2-" + mode, "1");
  }, key);
  await page.goto(base + "/" + code, { waitUntil: "networkidle2" });
  await wait(700);
  return page;
}

async function clickText(page, selector, text) {
  for (const handle of await page.$$(selector)) {
    const value = await handle.evaluate((node) => node.textContent.trim());
    const visible = await handle.evaluate((node) => Boolean(node.offsetParent || node.getClientRects().length));
    if (visible && value.startsWith(text)) {
      await handle.click();
      await wait(400);
      return;
    }
  }
  throw new Error(`No visible ${selector} starting with ${text}`);
}

for (const size of SIZES) {
  const player = await open(playerKey, size);
  await clickText(player, "summary", "Player menu");
  await clickText(player, "button", "Settings");
  assert.ok(await player.$eval(".player-settings-modal", (node) => node.textContent.includes("Music")), "Settings shows the Music switch");
  await player.screenshot({ path: `${out}/player-settings-${size.name}.jpg`, type: "jpeg", quality: 62 });
  await player.browserContext().close();

  const host = await open(hostKey, size);
  await clickText(host, "button", "Lobby rules");
  await host.$$eval(".rules-personal-row", (rows) => rows.find((row) => row.textContent.includes("Music"))?.scrollIntoView({ block: "center" }));
  await wait(300);
  await host.screenshot({ path: `${out}/host-lobby-rules-${size.name}.jpg`, type: "jpeg", quality: 62 });
  await host.browserContext().close();

  const visitor = await open(code + "-visitor-" + size.name, size);
  await clickText(visitor, "summary", "Menu");
  assert.ok(await visitor.evaluate(() => document.body.textContent.includes("Turn music off")), "Join menu offers the music button");
  await visitor.screenshot({ path: `${out}/join-menu-${size.name}.jpg`, type: "jpeg", quality: 62 });
  await visitor.browserContext().close();
}

await browser.close();
assert.deepEqual(errors, []);
console.log(JSON.stringify({ ok: true, code, shots: fs.readdirSync(out).filter((name) => name.endsWith(".jpg")) }));
