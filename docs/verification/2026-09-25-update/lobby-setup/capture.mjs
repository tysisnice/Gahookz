// Screenshot capture for the 2026-09-25 lobby-setup slice (U2, U3, U4, U6, U17).
//
//   flock /tmp/gahookz-verify.lock npm run test:disposable -- \
//     node docs/verification/2026-09-25-update/lobby-setup/capture.mjs <label> [outDir]
//
// Disposable server only: it creates rooms and changes their settings.
import assert from "node:assert/strict";
import fs from "node:fs";
import puppeteer from "puppeteer";

const base = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
assert.equal(base, "http://127.0.0.1:3199", "capture only runs against the disposable server");
const label = process.argv[2] || "shot";
const out = process.argv[3] || "docs/verification/2026-09-25-update/lobby-setup";
const only = (process.env.CAPTURE_SIZES || "").split(",").filter(Boolean);
fs.mkdirSync(out, { recursive: true });

const SIZES = [
  { name: "320x568", width: 320, height: 568, mobile: true },
  { name: "360x740", width: 360, height: 740, mobile: true },
  { name: "390x844", width: 390, height: 844, mobile: true },
  { name: "844x390", width: 844, height: 390, mobile: true },
  { name: "1280x800", width: 1280, height: 800, mobile: false }
].filter((size) => !only.length || only.includes(size.name));

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const randomCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errors = [];
const metrics = {};

async function post(path, body) {
  const response = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  assert.equal(data.ok, true, path + ": " + JSON.stringify(data));
  return data;
}

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

async function open(key, code, size, { seen = true, hideExplainers = false } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: size.width, height: size.height, isMobile: size.mobile, hasTouch: size.mobile, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => errors.push(size.name + ": " + error.message));
  await page.evaluateOnNewDocument((clientKey, dismiss, roomCode, hide) => {
    localStorage.setItem("gahookz-client-key", clientKey);
    if (dismiss) for (const mode of ["quiz", "herd", "majority", "host", "overview"]) localStorage.setItem("gahookz-how-to-play-seen-v2-" + mode, "1");
    if (hide) for (const scope of ["is-join-status", "is-host-status"]) localStorage.setItem("gahookz-room-explainer-hidden-" + roomCode + "-" + scope + "-" + clientKey, "1");
  }, key, seen, code, hideExplainers);
  await page.goto(base + "/" + code);
  return page;
}

async function shot(page, name) {
  await wait(350);
  await page.screenshot({ path: `${out}/${label}-${name}.jpg`, type: "jpeg", quality: 62 });
}

async function clickText(page, selector, text) {
  const handles = await page.$$(selector);
  for (const handle of handles) {
    const value = await handle.evaluate((node) => node.textContent.trim());
    if (value.startsWith(text)) {
      await handle.click();
      return true;
    }
  }
  throw new Error(`No ${selector} starting with ${text}`);
}

async function scrollTo(page, selector, block = "start") {
  await page.evaluate((sel, where) => {
    const node = document.querySelector(sel);
    if (!node) return;
    const top = node.getBoundingClientRect().top + window.scrollY - (where === "start" ? 64 : 0);
    window.scrollTo(0, Math.max(0, top));
  }, selector, block);
  await wait(250);
}

async function joinMetrics(page) {
  return page.evaluate(() => {
    const submit = document.querySelector('.party-join-form button[type="submit"]');
    const box = submit?.getBoundingClientRect();
    const choices = [...document.querySelectorAll(".party-join-form .avatar-choice")];
    const visibleRows = new Set();
    const bottomLimit = box ? Math.min(window.innerHeight, box.top) : window.innerHeight;
    for (const choice of choices) {
      const rect = choice.getBoundingClientRect();
      if (rect.top >= 0 && rect.bottom <= bottomLimit + 1) visibleRows.add(Math.round(rect.top));
    }
    const first = choices[0]?.getBoundingClientRect();
    return {
      joinTop: box ? Math.round(box.top) : null,
      joinBottom: box ? Math.round(box.bottom) : null,
      viewport: window.innerHeight,
      joinFullyVisible: Boolean(box && box.top >= 0 && box.bottom <= window.innerHeight + 1),
      visibleAvatarRows: visibleRows.size,
      tile: first ? `${Math.round(first.width)}x${Math.round(first.height)}` : null,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth
    };
  });
}

try {
  for (const size of SIZES) {
    const code = randomCode();
    const hostKey = code + "-host-" + Date.now().toString(36);
    await post("/api/room", { code, playerKey: hostKey, intent: "host" });
    for (let index = 0; index < 3; index += 1) {
      await post("/api/player/join", { code, playerKey: code + "-p" + index + Date.now().toString(36), name: ["Mighty Moose", "Sly Otter", "Jazzy Yak"][index], avatarId: "fox" });
    }
    const size_metrics = metrics[size.name] = {};

    // Host lobby: share band, then the game setup panel.
    const host = await open(hostKey, code, size);
    await host.waitForSelector(".host-control-panel .mode-selector");
    await wait(400);
    await shot(host, `host-top-${size.name}`);
    size_metrics.codeBand = await host.evaluate(() => {
      const band = document.querySelector(".code-band");
      const layout = document.querySelector(".code-band__layout");
      if (!band || !layout) return null;
      const outer = band.getBoundingClientRect();
      const inner = layout.getBoundingClientRect();
      return { label: document.querySelector(".code-band__text > span")?.textContent, height: Math.round(outer.height), top: Math.round(inner.top - outer.top), bottom: Math.round(outer.bottom - inner.bottom), left: Math.round(inner.left - outer.left), right: Math.round(outer.right - inner.right) };
    });
    await scrollTo(host, ".host-control-panel .mode-selector");
    await shot(host, `host-quiz-${size.name}`);
    const setupHeight = async () => host.evaluate(() => {
      const mode = document.querySelector(".mode-selector")?.getBoundingClientRect();
      const length = document.querySelector(".round-preset-selector")?.getBoundingClientRect();
      const modeButton = document.querySelector(".mode-selector-options > *")?.getBoundingClientRect();
      return { modeCardHeight: modeButton ? Math.round(modeButton.height) : null, modeSelector: mode ? Math.round(mode.height) : null, lengthSelector: length ? Math.round(length.height) : null, horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth };
    });
    size_metrics.quizStandard = await setupHeight();
    await clickText(host, ".round-preset-selector [role=radio], .round-preset-selector .round-preset-options button", "Custom");
    await wait(500);
    await scrollTo(host, ".host-control-panel .round-preset-selector");
    await shot(host, `host-quiz-custom-${size.name}`);
    size_metrics.quizCustom = await setupHeight();
    await clickText(host, ".mode-selector-options button", "Herd");
    await wait(600);
    await clickText(host, ".round-preset-selector [role=radio], .round-preset-selector .round-preset-options button", "Custom");
    await wait(600);
    await scrollTo(host, ".host-control-panel .mode-selector");
    await shot(host, `host-herd-custom-${size.name}`);
    size_metrics.herdCustom = await setupHeight();
    // The host page stays open while the join screens are captured, so the
    // room does not show its "host disconnected" notice over them.

    // Join screen for a newcomer: first visit (explainer shown) and returning (hidden).
    const joiner = await open(code + "-new-" + Date.now().toString(36), code, size);
    await joiner.waitForSelector(".party-join-form .avatar-choice");
    await wait(400);
    await shot(joiner, `join-${size.name}`);
    size_metrics.joinFirstVisit = await joinMetrics(joiner);
    await joiner.browserContext().close();
    const returning = await open(code + "-back-" + Date.now().toString(36), code, size, { hideExplainers: true });
    await returning.waitForSelector(".party-join-form .avatar-choice");
    await wait(400);
    await shot(returning, `join-returning-${size.name}`);
    size_metrics.joinReturning = await joinMetrics(returning);
    await returning.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(returning, `join-returning-bottom-${size.name}`);
    size_metrics.joinReturningBottom = await joinMetrics(returning);
    await returning.browserContext().close();
    await host.browserContext().close();
  }
  // Two join variants at a common phone size: a password room (the password
  // field joins the sticky footer) and editing an existing profile (Cancel and
  // Save side by side).
  const phone = SIZES.find((size) => size.name === "360x740") || SIZES[0];
  if (phone) {
    const code = randomCode();
    const hostKey = code + "-host-" + Date.now().toString(36);
    await post("/api/room", { code, playerKey: hostKey, intent: "host", password: "moose123" });
    const host = await open(hostKey, code, phone);
    await host.waitForSelector(".host-control-panel");
    const guarded = await open(code + "-pw-" + Date.now().toString(36), code, phone, { hideExplainers: true });
    await guarded.waitForSelector('.party-join-form input[type="password"]');
    await wait(300);
    await shot(guarded, `join-password-${phone.name}`);
    metrics.password = await joinMetrics(guarded);
    await guarded.browserContext().close();

    const playerKey = code + "-editor-" + Date.now().toString(36);
    await post("/api/player/join", { code, playerKey, name: "Captain Llama", avatarId: "panda", password: "moose123" });
    const editor = await open(playerKey, code, phone);
    await editor.waitForSelector(".player-card");
    await editor.click(".host-quick-menu summary").catch(() => {});
    await wait(300);
    const opened = await editor.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((node) => node.textContent.includes("Change name"));
      button?.click();
      return Boolean(button);
    });
    if (opened) {
      await editor.waitForSelector(".party-join-form .profile-edit-cancel");
      await wait(300);
      await shot(editor, `profile-edit-${phone.name}`);
      metrics.profileEdit = await joinMetrics(editor);
    } else {
      metrics.profileEdit = "menu entry not found";
    }
    await editor.browserContext().close();
    await host.browserContext().close();
  }
  console.log(JSON.stringify({ ok: errors.length === 0, label, errors, metrics }, null, 2));
} finally {
  await browser.close();
}
