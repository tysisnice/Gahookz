// Render the game's generated music and sound effects to listenable files.
//
// Nobody can review a sound from its source code, and the agent that wrote
// these could not hear them. This script runs the real browser modules
// (client/music.js and client/audio.runtime.js, built from source) inside
// headless Chromium, renders each sound through an OfflineAudioContext, and
// writes small mono Ogg/Opus files plus their measured levels.
//
//   npm run build && npm run audio:samples
//
// Output: docs/verification/2026-09-25-update/audio/*.ogg and levels.json.
// Needs ffmpeg on PATH. Uses no server and no port: every request the page
// makes is answered from standalone/public by request interception.

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const outDir = path.resolve(__dirname, "..", process.env.GAHOOKZ_AUDIO_OUT || "docs/verification/2026-09-25-update/audio");
const ORIGIN = "http://gahookz-audio.invalid";
const SAMPLE_RATE = 48000;
const MUSIC_SECONDS = Number(process.env.GAHOOKZ_MUSIC_SECONDS || 20);
const only = new Set((process.env.GAHOOKZ_AUDIO_ONLY || "").split(",").filter(Boolean));

for (const required of ["client/music.js", "client/audio.runtime.js", "client/preferences.js"]) {
  try {
    await fs.access(path.join(publicDir, required));
  } catch {
    throw new Error(`Missing ${required}: run "npm run build" first.`);
  }
}

const TYPES = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json" };

const RENDER_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<script src="/vendor/react.production.min.js"></script>
<script type="importmap">{"imports":{"react":"/react-shim.js"}}</script>
</head><body></body></html>`;

// Runs in the page. Each clip is a small program against the real modules.
const CLIPS = [
  ...["welcome", "lobby", "prep", "live", "finale"].map((state) => ({
    name: "music-" + state,
    group: "music",
    seconds: MUSIC_SECONDS,
    description: `${state} music, ${MUSIC_SECONDS} s from a cold start (seed 2026)`,
    program: `const player = new music.MusicPlayer(ctx, ctx.destination, { seed: 2026 });
      player.play(${JSON.stringify(state)});
      player.scheduleUntil(seconds);`
  })),
  // Stems, for balancing the mix: GAHOOKZ_AUDIO_STEMS=lobby (not rendered by default).
  ...(process.env.GAHOOKZ_AUDIO_STEMS ? [
    ["kick"], ["snare", "clap"], ["hat", "open", "shaker"], ["bass"], ["keys"], ["pad"], ["lead"], ["crash", "riser"]
  ].map((solo) => ({
    name: "stem-" + process.env.GAHOOKZ_AUDIO_STEMS + "-" + solo[0],
    group: "stems",
    seconds: 40,
    description: "stem: " + solo.join("+"),
    program: `const player = new music.MusicPlayer(ctx, ctx.destination, { seed: 2026, solo: ${JSON.stringify(solo)} });
      player.play(${JSON.stringify(process.env.GAHOOKZ_AUDIO_STEMS)});
      player.scheduleUntil(seconds);`
  })) : []),
  ...[
    ["sfx-answer-locked", 1, "your answer locks in (new)", "audio.playAnswerLockedSound(channel);"],
    ["sfx-answer-pops", 1.2, "other players answering: one bubble per answer, climbing (replaces the vocal ooh)", "audio.playAnswerOohSound(4, channel);"],
    ["sfx-countdown-ticks", 3.2, "the last three seconds of answering (new)", "[3, 2, 1].forEach((left, index) => audio.playCountdownTick(left, channel, 0.1 + index));"],
    ["sfx-reveal-correct", 1.4, "reveal, you picked the winning answer (new)", 'audio.playRevealSound("correct", channel);'],
    ["sfx-reveal-wrong", 1.2, "reveal, you did not (new)", 'audio.playRevealSound("wrong", channel);'],
    ["sfx-reveal-neutral", 1.2, "reveal on the host screen or when you did not answer (new)", 'audio.playRevealSound("neutral", channel);'],
    ["sfx-congrats", 1.6, "congratulations (redesigned)", "audio.playCongratsSound(channel);"],
    ["sfx-ultimate-congrats", 2.6, "ultimate congratulations (redesigned)", "audio.playUltimateCongratsSound(channel);"],
    ["sfx-ultimate-congrats-extra", 0.8, "each extra ultimate congratulations tap (redesigned)", "audio.playUltimateCongratsExtraSound(channel);"],
    ["sfx-boo", 1.6, "boo (redesigned)", "audio.playBooSound(channel);"],
    ["sfx-arena-victory", 2.4, "1v1 arena winner: fanfare and a small crowd (redesigned)", "audio.playVictoryPartySound(channel);"],
    ["cheer-game-win", 3.8, "end of the game, everyone: fanfare and crowd cheer (new)", "audio.playGameWinCheer(channel);"],
    ["gahook-pig-cry", 1.1, "Sad Pig Gahook: the crying pig (new, replaces the Airhorn Capy)", 'audio.playGahookFormSound("pig", channel);'],
    ["gahook-capybara-legacy", 1.1, "a legacy capybara Gahook now cries like the pig", 'audio.playGahookFormSound("capybara", channel);'],
    ["gahook-monkey-reference", 1.2, "Classic Monkey Gahook, unchanged, for level comparison", "audio.playMonkeyPokeSound(channel); audio.playGahookVoiceCue(channel);"],
    ["gahook-gorilla-reference", 1.2, "Rage Gorilla Gahook, unchanged, for level comparison", 'audio.playGahookFormSound("gorilla", channel);']
  ].map(([name, seconds, description, program]) => ({ name, group: name.split("-")[0], seconds, description, program })),
  {
    name: "mix-live-round",
    group: "mix",
    seconds: 13,
    description: "a player's round over the live music: reading (music steps back), answers arriving, countdown, answer locked (cancels the last tick), correct reveal, a congratulation",
    program: `const player = new music.MusicPlayer(ctx, ctx.destination, { seed: 11 });
      window.gahookzMusicPlayer = player;
      player.play("live");
      player.scheduleUntil(seconds);
      const at = (time, action) => ctx.suspend(time).then(() => { action(); ctx.resume(); });
      let ticks = [];
      at(0.2, () => player.setFocus(true));
      at(3.2, () => player.setFocus(false));
      at(4.0, () => audio.playAnswerOohSound(2, channel));
      at(5.1, () => audio.playAnswerOohSound(1, channel));
      at(5.5, () => { ticks = [3, 2, 1].flatMap((left, index) => audio.playCountdownTick(left, channel, 6 + index)); });
      at(7.4, () => { ticks.forEach((source) => { try { source.stop(0); } catch (_error) {} }); audio.playAnswerLockedSound(channel); });
      at(9.2, () => audio.playRevealSound("correct", channel));
      at(10.8, () => audio.playCongratsSound(channel));`
  },
  {
    name: "mix-game-finish",
    group: "mix",
    seconds: 14,
    description: "the last reveal ends the game: live music crossfades into the finale while the fanfare and crowd cheer play",
    program: `const player = new music.MusicPlayer(ctx, ctx.destination, { seed: 5 });
      window.gahookzMusicPlayer = player;
      player.play("live");
      player.scheduleUntil(4.3);
      ctx.suspend(4).then(() => {
        player.play("finale");
        audio.playGameWinCheer(channel);
        player.scheduleUntil(seconds);
        ctx.resume();
      });`
  },
  {
    name: "music-transition-lobby-to-live",
    group: "music",
    seconds: 16,
    description: "lobby music, then the game starts: crossfade into live on the next bar line",
    program: `const player = new music.MusicPlayer(ctx, ctx.destination, { seed: 7 });
      player.play("lobby");
      player.scheduleUntil(7);
      player.play("live");
      player.scheduleUntil(seconds);`
  }
];

async function main() {
  const launch = () => puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
  let browser;
  try {
    browser = await launch();
  } catch (error) {
    // A busy machine sometimes misses the launch timeout once.
    console.log("browser launch failed once (" + String(error?.message || error).slice(0, 60) + "), retrying");
    browser = await launch();
  }
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", async (request) => {
      const url = new URL(request.url());
      if (url.origin !== ORIGIN) return request.abort();
      if (url.pathname === "/render.html") return request.respond({ status: 200, contentType: "text/html", body: RENDER_PAGE });
      const file = path.normalize(path.join(publicDir, decodeURIComponent(url.pathname)));
      if (!file.startsWith(publicDir + path.sep)) return request.respond({ status: 403, body: "" });
      try {
        const body = await fs.readFile(file);
        request.respond({ status: 200, contentType: TYPES[path.extname(file)] || "application/octet-stream", body });
      } catch {
        request.respond({ status: 404, body: "" });
      }
    });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    await page.goto(ORIGIN + "/render.html");
    await page.evaluate(async () => {
      window.gahookzRenderModules = {
        music: await import("/client/music.js"),
        audio: await import("/client/audio.runtime.js")
      };
    });

    await fs.mkdir(outDir, { recursive: true });
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "gahookz-audio-"));
    const levels = {};
    for (const clip of CLIPS) {
      if (only.size && !only.has(clip.name) && !only.has(clip.group)) continue;
      const result = await page.evaluate(renderInPage, { program: clip.program, seconds: clip.seconds, sampleRate: SAMPLE_RATE });
      const wav = path.join(scratch, clip.name + ".wav");
      await fs.writeFile(wav, wavFile(Buffer.from(result.pcm, "base64"), SAMPLE_RATE));
      const ogg = path.join(outDir, clip.name + ".ogg");
      execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", wav, "-ac", "1", "-c:a", "libopus", "-b:a", "64k", ogg]);
      const { size } = await fs.stat(ogg);
      levels[clip.name] = { group: clip.group, description: clip.description, seconds: clip.seconds, ...result.stats, bytes: size };
      console.log(`${clip.name.padEnd(34)} peak ${fmt(result.stats.peakDb)} dBFS  rms ${fmt(result.stats.rmsDb)}  loudest 400ms ${fmt(result.stats.maxShortRmsDb)}  clipped ${result.stats.clippedSamples}  ${Math.round(size / 1024)} KB`);
    }
    await fs.rm(scratch, { recursive: true, force: true });
    if (pageErrors.length) throw new Error("Page errors while rendering:\n" + pageErrors.join("\n"));
    const levelsPath = path.join(outDir, "levels.json");
    let merged = {};
    if (only.size) {
      try {
        merged = JSON.parse(await fs.readFile(levelsPath, "utf8"));
      } catch {
        merged = {};
      }
    }
    await fs.writeFile(levelsPath, JSON.stringify({ ...merged, ...levels }, null, 2) + "\n");
  } finally {
    await browser.close();
  }
}

function fmt(value) {
  return (value >= 0 ? " " : "") + value.toFixed(1).padStart(6);
}

// Executed inside Chromium.
async function renderInPage({ program, seconds, sampleRate }) {
  const { music, audio } = window.gahookzRenderModules;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const channel = { ctx, destination: ctx.destination };
  // eslint-disable-next-line no-new-func
  const run = new Function("music", "audio", "ctx", "channel", "seconds", program);
  run(music, audio, ctx, channel, seconds);
  const buffer = await ctx.startRendering();
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  let peak = 0;
  let sum = 0;
  let clipped = 0;
  const windowSize = Math.floor(sampleRate * 0.4);
  let windowSum = 0;
  let maxWindow = 0;
  const mono = new Int16Array(left.length);
  for (let i = 0; i < left.length; i += 1) {
    const l = left[i];
    const r = right[i];
    const a = Math.max(Math.abs(l), Math.abs(r));
    if (a > peak) peak = a;
    if (a >= 1) clipped += 1;
    const power = (l * l + r * r) / 2;
    sum += power;
    windowSum += power;
    if (i >= windowSize) {
      const old = (left[i - windowSize] ** 2 + right[i - windowSize] ** 2) / 2;
      windowSum -= old;
    }
    if (i >= windowSize - 1 && windowSum > maxWindow) maxWindow = windowSum;
    const m = Math.max(-1, Math.min(1, (l + r) / 2));
    mono[i] = Math.round(m * 32767);
  }
  const db = (value) => (value > 0 ? 20 * Math.log10(value) : -120);
  const bytes = new Uint8Array(mono.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return {
    pcm: btoa(binary),
    stats: {
      peakDb: Math.round(db(peak) * 10) / 10,
      rmsDb: Math.round(db(Math.sqrt(sum / left.length)) * 10) / 10,
      maxShortRmsDb: Math.round(db(Math.sqrt(maxWindow / windowSize)) * 10) / 10,
      clippedSamples: clipped
    }
  };
}

function wavFile(pcm, sampleRate) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

await main();
