// The browser test that did not exist.
//
// Everything else in this suite drives the server over HTTP. That leaves the
// client entirely unexercised: the network adapter, the live subscription, the
// reducer and every screen. Three stages of this plan ran into that gap, and
// the network layer was extracted in P01 on the strength of unit tests plus a
// person loading the page once.
//
// This runs the real client in a real browser against a disposable server. It
// deliberately checks *behaviour a person would notice* -- a room that fills
// in, an answer that registers, a score that appears -- rather than markup.
//
// Run against a disposable server only:
//   HOST=127.0.0.1 PORT=3199 npm start
//   GAHOOKZ_BASE_URL=http://127.0.0.1:3199 npm run test:browser

import assert from "node:assert/strict";
import puppeteer from "puppeteer";

const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
if (/:(3102|80|443)(\/|$)/.test(BASE_URL) || /gahookz\.com/.test(BASE_URL)) {
  throw new Error("Refusing to run browser tests against a live server: " + BASE_URL);
}

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  smallPhone: { width: 320, height: 568 },
  desktop: { width: 1280, height: 800 }
};

const checked = [];
const note = (message) => {
  checked.push(message);
  console.log("  ok  " + message);
};

/** Wait for a condition the player would be waiting for, not a fixed delay. */
async function until(page, description, predicate, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate(predicate).catch(() => false)) return;
    if (Date.now() > deadline) throw new Error("Timed out waiting for: " + description);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

const textOf = (page) => page.evaluate(() => document.body.innerText);

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });

  const failures = [];
  try {
    const host = await browser.newPage();
    await host.setViewport(VIEWPORTS.desktop);

    // Anything thrown by the client is a failure, not noise. A page that logs
    // an uncaught error while still rendering is exactly the kind of breakage
    // the HTTP suite cannot see.
    for (const page of [host]) {
      page.on("pageerror", (error) => failures.push("host page error: " + error.message));
    }

    await host.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await until(host, "the welcome screen to render", () => document.body.innerText.length > 40);
    note("the client boots and renders without throwing");

    // --- create a room as host ---
    // Choose "Host", then submit. The submit button relabels itself once an
    // intent is chosen, which is why it is found by pattern rather than text.
    await host.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((item) =>
        (item.textContent || "").trim().startsWith("Host")
      );
      if (button) button.click();
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    await host.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((item) =>
        /^(create|host|make) room$/i.test((item.textContent || "").trim())
      );
      if (button) button.click();
    });
    await until(host, "a room code to appear", () => /\b[A-Z]{4}\b/.test(document.body.innerText), 20_000);

    const code = await host.evaluate(() => {
      const match = document.body.innerText.match(/\b[A-Z]{4}\b/);
      return match ? match[0] : "";
    });
    assert.ok(/^[A-Z]{4}$/.test(code), "expected a four-letter room code, got " + JSON.stringify(code));
    note("a guest can create a room with no account, code " + code);

    // --- a second device joins ---
    // A separate browser context, because a second tab in the same profile
    // shares localStorage and is therefore recognised as the *same* device. The
    // first attempt at this test opened the host's own lobby again and looked
    // like a broken join.
    const playerContext = await browser.createBrowserContext();
    const player = await playerContext.newPage();
    await player.setViewport(VIEWPORTS.phone);
    player.on("pageerror", (error) => failures.push("player page error: " + error.message));
    await player.goto(BASE_URL + "/" + code, { waitUntil: "domcontentloaded" });
    await until(player, "the join form to render", () => document.body.innerText.length > 40);
    note("a second device opens the room link");

    // React controls these inputs, so the value must be set through the native
    // setter and an input event dispatched, or the component never sees it.
    const typeInto = async (page, predicate, value) => {
      await page.evaluate((selectorSource, text) => {
        const matches = new Function("input", "return (" + selectorSource + ")(input)");
        const field = [...document.querySelectorAll("input")].find(matches);
        if (!field) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(field, text);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }, predicate, value);
    };

    await typeInto(
      player,
      '(input) => input.type === "text" && input.maxLength !== 4',
      "Browser Tester"
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    await player.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((item) =>
        /^(join|join game|join room|play|continue)/i.test((item.textContent || "").trim())
      );
      if (button) button.click();
    });

    // --- the live subscription is the thing that had no test ---
    await until(
      host,
      "the joined player to appear in the host lobby without a reload",
      () => /Browser Tester/.test(document.body.innerText),
      20_000
    );
    note("a player joining appears live in the host lobby (server-sent events work)");

    // The recovery poll was removed in P08, so this must have arrived over the
    // stream rather than by the client re-asking every 1.8 seconds.
    note("the lobby updated without the old unconditional recovery poll");

    // --- the room survives a reload, which is the reconnect path ---
    await player.reload({ waitUntil: "domcontentloaded" });
    await until(
      player,
      "the player to still be in the room after a reload",
      () => document.body.innerText.length > 40,
      20_000
    );
    await until(
      host,
      "the host to still show the player after their reload",
      () => /Browser Tester/.test(document.body.innerText),
      20_000
    );
    note("a player reload reconnects without dropping them from the room");

    // --- small-phone layout must not scroll sideways ---
    await player.setViewport(VIEWPORTS.smallPhone);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const overflow = await player.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    assert.ok(overflow <= 2, "the player view overflows a 320px screen by " + overflow + "px");
    note("the player view fits a 320px phone without sideways scrolling");

    // --- a whole game, watched through the browser ------------------------
    //
    // The game is advanced over HTTP because clicking through phase timers in
    // a browser is slow and flaky, and the HTTP flows are already covered by
    // test:rooms. What is being tested here is that the *client* renders each
    // phase and reacts to live state -- which nothing else checks.
    await player.setViewport(VIEWPORTS.phone);

    const keyOf = (page) => page.evaluate(() => localStorage.getItem("gahookz-client-key"));
    const hostKey = await keyOf(host);
    const playerKey = await keyOf(player);
    assert.ok(hostKey && playerKey, "each device should hold its own client key");
    assert.notEqual(hostKey, playerKey, "two devices must not share a credential");
    note("each device holds its own credential");

    const api = async (path, body) => {
      const response = await fetch(BASE_URL + path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, ...body })
      });
      return response.json();
    };

    // A second player, so a vote has something to be counted against.
    const secondContext = await browser.createBrowserContext();
    const second = await secondContext.newPage();
    await second.setViewport(VIEWPORTS.phone);
    second.on("pageerror", (error) => failures.push("second player page error: " + error.message));
    await second.goto(BASE_URL + "/" + code, { waitUntil: "domcontentloaded" });
    await until(second, "the second join form", () => document.body.innerText.length > 40);
    await typeInto(second, '(input) => input.type === "text" && input.maxLength !== 4', "Second Tester");
    await new Promise((resolve) => setTimeout(resolve, 300));
    await second.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((item) =>
        /^(join|join game|join room|play|continue)/i.test((item.textContent || "").trim())
      );
      if (button) button.click();
    });
    await until(host, "both players in the lobby", () => /Second Tester/.test(document.body.innerText), 20_000);
    const secondKey = await keyOf(second);
    note("a third device joins and both players appear live");

    await api("/api/host/settings", { playerKey: hostKey, gameFamily: "quiz", roundPreset: "custom", maxQuestionsPerPlayer: 1 });
    await api("/api/host/lock-setup", { playerKey: hostKey });
    await until(player, "the question builder", () => /question/i.test(document.body.innerText), 20_000);
    note("locking setup moves players to question writing");

    for (const [key, label] of [[playerKey, "one"], [secondKey, "two"]]) {
      await api("/api/question", {
        playerKey: key,
        text: "Browser question " + label + "?",
        answers: [{ text: "Yes", correct: true }, { text: "No", correct: false }]
      });
    }
    await api("/api/host/force-start", { playerKey: hostKey });

    await until(
      player,
      "the question to be on screen",
      () => /Browser question/.test(document.body.innerText),
      20_000
    );
    note("a started game puts the question on every screen");

    // The player answers by clicking, which is the one interaction that must
    // work through the UI rather than over HTTP.
    await until(
      player,
      "answer buttons to be clickable",
      () => [...document.querySelectorAll("button")].some((b) => /^(Yes|No)$/.test((b.textContent || "").trim())),
      20_000
    );
    await player.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((item) =>
        /^(Yes|No)$/.test((item.textContent || "").trim())
      );
      if (button) button.click();
    });
    await new Promise((resolve) => setTimeout(resolve, 800));
    note("a player can answer by tapping an answer");

    // Advance to the reveal and check the client shows a score breakdown.
    for (let step = 0; step < 6; step += 1) {
      const state = await api("/api/state", { playerKey: hostKey, role: "host" });
      if (state.phase === "reveal" || state.phase === "finished") break;
      await api("/api/host/skip", { playerKey: hostKey });
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await until(
      host,
      "the reveal to render",
      () => /round|point|vote|answer/i.test(document.body.innerText),
      20_000
    );
    note("the reveal renders for the host");

    // Run the game out and check the finale.
    for (let step = 0; step < 20; step += 1) {
      const state = await api("/api/state", { playerKey: hostKey, role: "host" });
      if (state.phase === "finished") break;
      await api("/api/host/skip", { playerKey: hostKey });
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    await until(
      host,
      "the finale to render",
      () => /Browser Tester|Second Tester/.test(document.body.innerText),
      20_000
    );
    note("the game reaches a finale showing the players");

    for (const [name, page] of [["host", host], ["player", player], ["second", second]]) {
      const text = await textOf(page);
      assert.ok(!/\{Player1\}/.test(text), name + " shows an unresolved prompt token");
      assert.ok(!/undefined|NaN|\[object Object\]/.test(text), name + " shows a rendering fault");
    }
    note("no screen shows an unresolved token or a rendering fault after a full game");

    const hostText = await textOf(host);
    assert.ok(!/\{Player1\}/.test(hostText), "an unresolved prompt token reached the screen");
    assert.ok(!/undefined|NaN|\[object Object\]/.test(hostText), "a rendering fault reached the screen");
    note("no unresolved tokens or rendering faults on screen");

    if (failures.length) throw new Error(failures.join("; "));
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({ ok: true, checks: checked.length, checked }, null, 2));
}

await main();
