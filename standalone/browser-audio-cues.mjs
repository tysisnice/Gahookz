// Behavioural check of the game's sound cues and music switches, in headless
// Chromium against the built client/audio.runtime.js.
//
// The rules it pins down are the ones a source-text check cannot: the first
// snapshot of a room (a join, a refresh, a reconnect) plays nothing; the end
// of a game cheers once; your answer locking in and the reveal make a sound;
// mute silences everything; the Music switch starts and stops the music.
//
//   npm run build && npm run test:browser:audio
//
// No server and no port: the page's requests are answered from
// standalone/public by request interception. Sound is "observed" by counting
// the oscillators and buffer sources the page creates.

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const ORIGIN = "http://gahookz-audio.invalid";
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<script src="/vendor/react.production.min.js"></script>
<script type="importmap">{"imports":{"react":"/react-shim.js"}}</script>
<script>
  window.soundCount = 0;
  for (const method of ["createOscillator", "createBufferSource"]) {
    const original = BaseAudioContext.prototype[method];
    BaseAudioContext.prototype[method] = function (...args) {
      window.soundCount += 1;
      return original.apply(this, args);
    };
  }
</script></head><body></body></html>`;

const browser = await puppeteer.launch({ headless: true, protocolTimeout: 300000, args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
const results = [];
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    const url = new URL(request.url());
    if (url.origin !== ORIGIN) return request.abort();
    if (url.pathname === "/check.html") return request.respond({ status: 200, contentType: "text/html", body: PAGE });
    const file = path.normalize(path.join(publicDir, decodeURIComponent(url.pathname)));
    if (!file.startsWith(publicDir + path.sep)) return request.respond({ status: 403, body: "" });
    try {
      request.respond({ status: 200, contentType: "text/javascript", body: await fs.readFile(file) });
    } catch {
      request.respond({ status: 404, body: "" });
    }
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(ORIGIN + "/check.html");
  await page.evaluate(async () => {
    localStorage.clear();
    window.audio = await import("/client/audio.runtime.js");
    window.prefs = await import("/client/preferences.js");
    await window.audio.getAudioContext().resume();
    // Count what one call makes, with the music out of the way.
    window.sounds = (action) => {
      const before = window.soundCount;
      action();
      return window.soundCount - before;
    };
  });

  const check = async (name, fn) => {
    await fn();
    results.push(name);
    console.log("  ok  " + name);
  };
  const cues = (snapshot) => page.evaluate((value) => window.sounds(() => window.audio.syncGameSoundCues(value)), snapshot);
  const question = { id: "q1", answers: [{ id: "red", correct: true }, { id: "blue", correct: false }] };

  await check("the first snapshot of a finished game (a refresh) plays no cheer", async () => {
    assert.equal(await cues({ code: "AAAA", phase: "finished", lastGameSummary: { matchId: "m1" } }), 0);
    assert.equal(await cues({ code: "AAAA", phase: "finished", lastGameSummary: { matchId: "m1" } }), 0);
  });

  await check("the end of a game cheers once", async () => {
    assert.equal(await cues({ code: "BBBB", phase: "reveal", currentQuestion: question }), 0);
    const cheer = await cues({ code: "BBBB", phase: "finished", currentQuestion: question, lastGameSummary: { matchId: "m2" } });
    assert.ok(cheer >= 30, "a fanfare and a crowd should be dozens of voices, got " + cheer);
    assert.equal(await cues({ code: "BBBB", phase: "finished", currentQuestion: question, lastGameSummary: { matchId: "m2" } }), 0);
  });

  await check("an answer locking in, and the reveal, make a sound once each", async () => {
    const answering = { code: "CCCC", phase: "answering", currentQuestion: question, phaseEndsAt: 0 };
    assert.equal(await cues(answering), 0);
    assert.ok(await cues({ ...answering, ownAnswer: { answerId: "red" } }) > 0);
    assert.equal(await cues({ ...answering, ownAnswer: { answerId: "red" } }), 0);
    assert.ok(await cues({ ...answering, phase: "reveal", ownAnswer: { answerId: "red" } }) > 0);
    assert.equal(await cues({ ...answering, phase: "reveal", ownAnswer: { answerId: "red" } }), 0);
  });

  await check("the last three seconds tick for someone still answering", async () => {
    const endsAt = await page.evaluate(() => Date.now() + 3600);
    assert.equal(await cues({ code: "DDDD", phase: "reveal", currentQuestion: { id: "q0" } }), 0);
    const ticks = await cues({ code: "DDDD", phase: "answering", currentQuestion: { id: "q2" }, phaseEndsAt: endsAt });
    assert.ok(ticks >= 6, "three woodblock ticks should be scheduled, got " + ticks);
  });

  await check("mute silences every cue", async () => {
    await page.evaluate(() => window.prefs.setEffectsMuted(true));
    assert.equal(await cues({ code: "EEEE", phase: "reveal" }), 0);
    assert.equal(await cues({ code: "EEEE", phase: "finished", lastGameSummary: { matchId: "m3" } }), 0);
    await page.evaluate(() => window.prefs.setEffectsMuted(false));
  });

  await check("the Music switch starts and stops the music, separately from sound effects", async () => {
    const playing = await page.evaluate(async () => {
      await window.audio.getAudioContext().resume();
      window.audio.setGameMusicState("lobby");
      await new Promise((resolve) => setTimeout(resolve, 900));
      return { state: window.gahookzMusicPlayer?.state, sounds: window.soundCount };
    });
    assert.equal(playing.state, "lobby");
    const stopped = await page.evaluate(async () => {
      window.prefs.setMusicEnabled(false);
      await new Promise((resolve) => setTimeout(resolve, 400));
      const before = window.soundCount;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return { state: window.gahookzMusicPlayer?.state ?? null, added: window.soundCount - before, stored: localStorage.getItem("gahookz-music-off") };
    });
    assert.equal(stopped.state, null);
    assert.equal(stopped.added, 0, "no new notes once the music is off");
    assert.equal(stopped.stored, "1");
    assert.ok(await cues({ code: "FFFF", phase: "answering", currentQuestion: question }) === 0 && await cues({ code: "FFFF", phase: "reveal", currentQuestion: question }) > 0, "sound effects still play with the music off");
    const resumed = await page.evaluate(async () => {
      window.prefs.setMusicEnabled(true);
      await new Promise((resolve) => setTimeout(resolve, 600));
      return window.gahookzMusicPlayer?.state;
    });
    assert.equal(resumed, "lobby");
  });

  await check("the Sad Pig cries for \"pig\" and for a legacy \"capybara\"", async () => {
    const counts = await page.evaluate(() => {
      window.audio.stopGameMusic(0.05);
      const channel = () => ({ ctx: window.audio.getAudioContext(), destination: window.audio.getAudioContext().destination });
      return ["pig", "capybara", "monkey"].map((form) => window.sounds(() => window.audio.playGahookFormSound(form, channel())));
    });
    assert.ok(counts[0] > 0 && counts[0] === counts[1], "pig and capybara should make the same cry: " + counts.join(","));
    assert.notEqual(counts[0], counts[2], "the pig should not fall back to the monkey");
  });

  assert.deepEqual(pageErrors, []);
} finally {
  await browser.close();
}
console.log(JSON.stringify({ ok: true, checks: results.length }));
