// What one tab does to a server it cannot reach.
//
// The unit tests in public/client/net.test.ts prove the snapshot fetcher keeps
// one request in flight. They cannot prove the *app* uses it: a raw
// `fetch("/api/state")` added back into app.jsx would leave all of them
// passing. Only the real client in a real browser can show that, so this suite
// runs one and counts.
//
// It holds every /api/state, ticket and /events request open without ever
// answering — a black-holed connection, which is what a phone that has lost
// its network looks like from the page's side, and worse than an outright
// failure because nothing ever rejects. Before the fetcher existed this tab
// started a new snapshot request every five seconds and never closed one:
// eight open after a minute, and when the network returned they all landed at
// once, each serialising a whole room.
//
// Run against a disposable server only:
//   node standalone/test-disposable.mjs node standalone/browser-recovery-storm.mjs
import assert from "node:assert/strict";
import puppeteer from "puppeteer";

const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
if (/:(3102|80|443)(\/|$)/.test(BASE_URL) || /gahookz\.com/.test(BASE_URL)) {
  throw new Error("Refusing to run browser tests against a live server: " + BASE_URL);
}

// The client reaches for a snapshot after 25 seconds of silence and checks
// every 5, so a window of 40 covers three attempts under the old code and the
// timeout firing at least once under the new one.
const WINDOW_MS = Number(process.env.GAHOOKZ_RECOVERY_WINDOW_MS || 40_000);

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
const hostKey = "recovery-host-" + Date.now();

const checked = [];
const note = (message) => {
  checked.push(message);
  console.log("  ok  " + message);
};

async function post(path, body) {
  const response = await fetch(BASE_URL + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  assert.equal(data.ok, true, path + " failed: " + data.error);
  return data;
}

async function main() {
  await post("/api/room", { code, playerKey: hostKey, intent: "host" });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    timeout: 60_000
  });

  const failures = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    page.on("pageerror", (error) => failures.push("page error: " + error.message));

    // The host's own room, entered the way a refresh enters it: this device's
    // stored client key, and the room code in the path.
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate((key) => localStorage.setItem("gahookz-client-key", key), hostKey);

    const isState = (url) => url.includes("/api/state");
    const starts = [];
    let live = 0;
    let peak = 0;
    let abandoned = 0;
    let beganAt = 0;

    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const url = request.url();
      // Holding the ticket and the stream too is what makes the room silent;
      // a working stream would keep the recovery poll asleep.
      const held = isState(url) || url.includes("/api/events/ticket") || url.includes("/events?");
      if (!held) {
        request.continue().catch(() => {});
        return;
      }
      if (!isState(url)) return;
      starts.push(Date.now() - beganAt);
      live += 1;
      peak = Math.max(peak, live);
    });
    // A request the client abandons is reported here, and it is the only way to
    // tell one still open from one given up on.
    const settle = (request) => {
      if (!isState(request.url())) return;
      live -= 1;
      abandoned += 1;
    };
    page.on("requestfailed", settle);
    page.on("requestfinished", settle);

    beganAt = Date.now();
    await page.goto(BASE_URL + "/" + code, { waitUntil: "domcontentloaded" });
    await new Promise((resolve) => setTimeout(resolve, WINDOW_MS));

    const seconds = Math.round(WINDOW_MS / 1000);
    assert.ok(
      starts.length >= 2,
      "the tab made " + starts.length + " snapshot requests in " + seconds + "s: recovery is not running, so this suite would pass vacuously"
    );
    note("a silent room keeps trying: " + starts.length + " snapshot requests in " + seconds + "s");

    assert.equal(peak, 1, "requests stacked up: " + peak + " were open at once");
    note("never more than one snapshot request is open at a time");

    assert.ok(abandoned >= 1, "no request was ever abandoned, so the timeout is not reaching the browser");
    note("an unanswered request is abandoned rather than holding the slot (" + abandoned + " of " + starts.length + ")");

    const shown = await page.evaluate(() => document.body.innerText);
    assert.ok(/room/i.test(shown) && /retry|refresh|connection|reach/i.test(shown),
      "the screen does not explain itself: " + JSON.stringify(shown.slice(0, 200)));
    note("the player is told the room cannot be reached, and offered a retry");
  } finally {
    await browser.close();
  }

  if (failures.length) {
    for (const failure of failures) console.log("  FAIL  " + failure);
    throw new Error(failures.length + " browser failure(s)");
  }
  console.log("\nRecovery storm checks passed: " + checked.length);
}

await main();
