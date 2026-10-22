// What this device remembers, proved in a real browser.
//
// public/client/session.test.ts covers the rules; this covers the thing those
// rules exist for — a person with a browser that is hostile, corrupted or
// simply set to keep nothing, who still has to be able to play. All three
// cases here were measured as real failures of the client before
// public/client/session.ts existed:
//
//   - a saved join whose name was the number 12345 threw during render and
//     left a blank page: no join form, no message, no way back but clearing
//     site data;
//   - a browser with site data blocked minted a new player key on every call,
//     so one tab sent 1,001 different identities and never got past "Joining";
//   - and the password from a legacy ?pwd= link had to stay out of durable
//     storage and out of the address bar.
//
// Run against a disposable server only:
//   node standalone/test-disposable.mjs node standalone/browser-session-storage.mjs
import assert from "node:assert/strict";
import puppeteer from "puppeteer";

const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
if (/:(3102|80|443)(\/|$)/.test(BASE_URL) || /gahookz\.com/.test(BASE_URL)) {
  throw new Error("Refusing to run browser tests against a live server: " + BASE_URL);
}

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const newCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
const SECRET = "hunter2-room-secret";

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

async function until(page, description, predicate, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate(predicate).catch(() => false)) return;
    if (Date.now() > deadline) {
      const seen = await page.evaluate(() => document.body.innerText).catch(() => "(no page)");
      throw new Error("Timed out waiting for: " + description + " — screen reads " + JSON.stringify(seen.replace(/\s+/g, " ").slice(0, 160)));
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

// React owns these inputs, so a value must be set through the native setter.
const typeInto = (page, value) => page.evaluate((text) => {
  const field = [...document.querySelectorAll("input")].find((input) => input.type === "text" && input.maxLength !== 4);
  if (!field) throw new Error("no name field on screen");
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(field, text);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}, value);

// "join the lobby" is written on the join screen itself, so waiting for the
// word would pass before anyone had joined. The form going away is the event.
const inTheRoom = (page) => until(page, "the room to open", () =>
  ![...document.querySelectorAll("input")].some((input) => input.type === "text" && input.maxLength !== 4) &&
  /lobby/i.test(document.body.innerText), 20_000);

const clickJoin = (page) => page.evaluate(() => {
  const button = [...document.querySelectorAll("button")].find((item) =>
    /^(join|join game|join room|play|continue)/i.test((item.textContent || "").trim())
  );
  if (button) button.click();
});

const storageOf = (page) => page.evaluate(() => {
  const dump = (store) => { try { return JSON.stringify(Object.entries(store)); } catch { return "[]"; } };
  return { local: dump(localStorage), session: dump(sessionStorage), url: location.href };
});

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    timeout: 60_000
  });
  const failures = [];

  // Each case is its own browser context: a second tab in the same profile
  // shares storage, which is the thing under test.
  const openTab = async (prepare) => {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 390, height: 844 });
    page.on("pageerror", (error) => failures.push("page error: " + error.message));
    if (prepare) await prepare(page);
    return { context, page };
  };

  try {
    // --- 1. a legacy link that carries the room password ------------------
    {
      const code = newCode();
      await post("/api/room", { code, playerKey: "session-host-1", intent: "host", passwordEnabled: true, password: SECRET });
      const { context, page } = await openTab();
      await page.goto(BASE_URL + "/" + code + "?pwd=" + encodeURIComponent(SECRET), { waitUntil: "domcontentloaded" });
      await until(page, "the join form", () => document.body.innerText.length > 40);

      const address = await page.evaluate(() => location.href);
      assert.ok(!address.includes(SECRET) && !/[?&]pwd?=/.test(address), "the password is still in the address: " + address);
      note("a password in a link is taken out of the address bar on arrival");

      await typeInto(page, "Session Tester");
      await clickJoin(page);
      await inTheRoom(page);

      const stored = await storageOf(page);
      assert.ok(!stored.local.includes(SECRET), "the room password reached localStorage: " + stored.local);
      assert.ok(stored.session.includes(SECRET), "the room password should be remembered for this tab");
      assert.ok(stored.session.includes("gahookz-room-password-" + code), "it should be keyed by room");
      note("the password is remembered for this tab only, and keyed by the room");
      await context.close();
    }

    // --- 2. a saved join from somewhere this code did not write -----------
    {
      const code = newCode();
      await post("/api/room", { code, playerKey: "session-host-2", intent: "host" });
      const { context, page } = await openTab(async (page) => {
        await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
        await page.evaluate(() => localStorage.setItem("gahookz-last-join", JSON.stringify({
          name: 12345,
          avatarId: { toString: "no" },
          avatarImageDataUrl: "http://example.invalid/tracker.gif",
          password: "left-behind-by-an-older-release",
          extra: "x".repeat(50)
        })));
      });
      await page.goto(BASE_URL + "/" + code, { waitUntil: "domcontentloaded" });
      await until(page, "a usable join form", () =>
        [...document.querySelectorAll("input")].some((input) => input.type === "text" && input.maxLength !== 4));
      note("a corrupt saved join still renders a join form a person can use");

      await typeInto(page, "Session Tester");
      await clickJoin(page);
      await inTheRoom(page);
      note("and the player can still join the room");

      const stored = await storageOf(page);
      assert.ok(!stored.local.includes("left-behind"), "a stored credential must be wiped, not stepped over");
      assert.ok(!stored.local.includes("example.invalid"), "a picture that is not a picture must be dropped");
      assert.ok(!stored.local.includes("12345"), "the corrupt name must not be written back");
      note("the junk is cleared out of the device rather than carried forward");
      await context.close();
    }

    // --- 3. a browser that keeps nothing ----------------------------------
    {
      const code = newCode();
      await post("/api/room", { code, playerKey: "session-host-3", intent: "host" });
      const { context, page } = await openTab(async (page) => {
        await page.evaluateOnNewDocument(() => {
          const blocked = {
            getItem: () => null,
            setItem: () => { throw new Error("site data is blocked"); },
            removeItem: () => {},
            clear: () => {},
            key: () => null,
            length: 0
          };
          Object.defineProperty(window, "localStorage", { configurable: true, get: () => blocked });
          Object.defineProperty(window, "sessionStorage", { configurable: true, get: () => blocked });
        });
      });
      const keys = new Set();
      page.on("request", (request) => {
        if (!request.url().includes("/api/")) return;
        try {
          const body = JSON.parse(request.postData() || "{}");
          if (body.playerKey) keys.add(body.playerKey);
        } catch { /* not a JSON command */ }
      });

      await page.goto(BASE_URL + "/" + code, { waitUntil: "domcontentloaded" });
      await until(page, "the join form", () => document.body.innerText.length > 40);
      await typeInto(page, "Blocked Tester");
      await clickJoin(page);
      await inTheRoom(page);
      note("a guest whose browser stores nothing can still join and reach the lobby");

      assert.equal(keys.size, 1, "this tab used " + keys.size + " different player keys; the room cannot recognise it twice");
      note("and it is the same player throughout: one credential, " + keys.size);
      await context.close();
    }
  } finally {
    await browser.close();
  }

  if (failures.length) {
    for (const failure of failures) console.log("  FAIL  " + failure);
    throw new Error(failures.length + " browser failure(s)");
  }
  console.log("\nSession storage checks passed: " + checked.length);
}

await main();
