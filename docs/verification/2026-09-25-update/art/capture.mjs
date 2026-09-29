// Screenshot capture for the 2026-09-25 art slice (U11 Sad Pig, U7 tutorial
// artwork, U5 icon).
//
//   flock /tmp/gahookz-verify.lock npm run test:disposable -- \
//     node docs/verification/2026-09-25-update/art/capture.mjs [pig,tutorials]
//
// Disposable server only: it creates a room, joins players and Gahooks them.
import assert from "node:assert/strict";
import fs from "node:fs";
import puppeteer from "puppeteer";

const base = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
assert.equal(base, "http://127.0.0.1:3199", "capture only runs against the disposable server");
const sections = new Set((process.argv[2] || "pig,tutorials").split(","));
const out = "docs/verification/2026-09-25-update/art";
fs.mkdirSync(out, { recursive: true });

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const randomCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errors = [];
const report = {};

async function post(path, body) {
  const response = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  assert.equal(data.ok, true, path + ": " + JSON.stringify(data));
  return data;
}

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

async function open(key, code, size, { seen = true, path = "/" + code } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: size.width, height: size.height, isMobile: size.mobile, hasTouch: size.mobile, deviceScaleFactor: size.scale || 1 });
  page.on("pageerror", (error) => errors.push(size.width + "x" + size.height + ": " + error.message));
  await page.evaluateOnNewDocument((clientKey, dismiss) => {
    localStorage.setItem("gahookz-client-key", clientKey);
    if (dismiss) for (const mode of ["quiz", "herd", "majority", "host", "overview"]) localStorage.setItem("gahookz-how-to-play-seen-v2-" + mode, "1");
  }, key, seen);
  await page.goto(base + path);
  return page;
}

async function shot(page, name, options = {}) {
  await wait(options.wait ?? 350);
  const target = options.selector ? await page.$(options.selector) : page;
  await target.screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality: options.quality || 70 });
}

const PHONE = { width: 390, height: 844, mobile: true, scale: 1 };
const SMALL_PHONE = { width: 360, height: 740, mobile: true, scale: 1 };
const DESKTOP = { width: 1280, height: 800, mobile: false, scale: 1 };

try {
  if (sections.has("pig")) {
    const code = randomCode();
    const hostKey = code + "-host";
    const pigKey = code + "-pig";
    const friendKey = code + "-friend";
    await post("/api/room", { code, playerKey: hostKey });
    await post("/api/player/join", { code, playerKey: pigKey, name: "Sobbing Sam", avatarId: "fox" });
    await post("/api/player/join", { code, playerKey: friendKey, name: "Backup Bea", avatarId: "frog" });
    // The pig player chooses the form the old way: an old client or a saved
    // choice still says "capybara", and the server answers "pig".
    const chosen = await post("/api/player/gahook-form", { code, playerKey: pigKey, gahookForm: "capybara" });
    assert.equal(chosen.gahookForm, "pig");

    // 1. The picker in the player menu, phone sheet.
    for (const size of [PHONE, SMALL_PHONE]) {
      const page = await open(pigKey, code, size);
      await page.waitForSelector(".player-quick-menu > summary");
      await page.click(".player-quick-menu > summary");
      await page.waitForSelector(".player-quick-menu.is-sheet .gahook-form-picker");
      const picker = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll(".player-quick-menu.is-sheet .gahook-form-picker button")];
        return buttons.map((button) => ({ label: button.textContent.trim(), selected: button.classList.contains("is-selected") }));
      });
      assert.deepEqual(picker.slice(0, 6).map((entry) => entry.label), ["Classic Monkey", "Rage Gorilla", "Sad Pig", "Chonky Koala", "Cool Croc", "Cymbal Chicken"]);
      assert.equal(picker.find((entry) => entry.selected)?.label, "Sad Pig");
      await page.evaluate(() => document.querySelector(".player-quick-menu.is-sheet .gahook-form-picker")?.scrollIntoView({ block: "center" }));
      await shot(page, `pig-picker-${size.width}`);
      await shot(page, `pig-picker-tiles-${size.width}`, { selector: ".player-quick-menu.is-sheet .gahook-form-picker", quality: 80 });
      report["picker" + size.width] = picker.slice(0, 6);
      await page.browserContext().close();
    }

    // 2. The full-screen Gahook the friend receives from the pig. The sender
    // has to be connected to Gahook, so the pig keeps a page open meanwhile.
    const pigPage = await open(pigKey, code, SMALL_PHONE);
    await pigPage.waitForSelector(".player-card");
    for (const size of [PHONE, DESKTOP]) {
      const page = await open(friendKey, code, size);
      await page.waitForSelector(".player-card");
      await wait(600);
      await post("/api/player/poke", { code, playerKey: pigKey, playerId: friendKey });
      await page.waitForSelector(".poke-overlay.is-form-pig .poke-animal", { timeout: 5000 });
      const overlay = await page.evaluate(() => ({
        label: document.querySelector(".poke-overlay .poke-animal")?.getAttribute("aria-label"),
        props: document.querySelectorAll(".premium-effects-pig > span").length
      }));
      assert.equal(overlay.label, "Sad Pig Gahook");
      assert.equal(overlay.props, 15);
      await shot(page, `pig-gahook-${size.width}`, { wait: 500 });
      report["overlay" + size.width] = overlay;
      await page.browserContext().close();
      await wait(1800);
    }
    await pigPage.browserContext().close();
  }
} finally {
  await browser.close();
}

assert.deepEqual(errors, [], "page errors: " + errors.join("\n"));
console.log(JSON.stringify({ ok: true, sections: [...sections], report }, null, 2));
