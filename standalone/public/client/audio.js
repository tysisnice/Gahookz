import { effectsMuted, musicEnabled, MUSIC_EVENT } from "./preferences.jsx";
import { normaliseGahookFormId } from "./gahook-forms.js";
import { MusicPlayer, isMusicState } from "./music.ts";

export function installGahookWarmup() {
  if (window.gahookzWarmupInstalled) {
    return;
  }
  window.gahookzWarmupInstalled = true;
  const warmFromGesture = () => {
    warmGahookEffects({
      fromGesture: true
    });
    window.removeEventListener("pointerdown", warmFromGesture, true);
    window.removeEventListener("touchstart", warmFromGesture, true);
    window.removeEventListener("keydown", warmFromGesture, true);
  };
  window.addEventListener("pointerdown", warmFromGesture, {
    capture: true,
    passive: true
  });
  window.addEventListener("touchstart", warmFromGesture, {
    capture: true,
    passive: true
  });
  window.addEventListener("keydown", warmFromGesture, true);
  setTimeout(() => warmGahookEffects(), 250);
}

export function warmGahookEffects(options = {}) {
  const fromGesture = Boolean(options.fromGesture);
  if (fromGesture && window.gahookzGestureWarmed) {
    return;
  }
  if (!fromGesture && window.gahookzPassiveWarmed) {
    return;
  }
  const ctx = getAudioContext();
  if (ctx) {
    [0.14, 0.18, 0.24, 0.26, 0.28].forEach(duration => getNoiseBuffer(ctx, duration));
    if (fromGesture) {
      window.gahookzGestureWarmed = true;
      Promise.resolve(ctx.resume?.()).then(() => {
        playSilentGahookWarmup(ctx);
        resumeGameMusic();
      }).catch(() => {});
    } else {
      window.gahookzPassiveWarmed = true;
      if (ctx.state === "running") {
        playSilentGahookWarmup(ctx);
      }
    }
  }
  warmSpeechSynthesis(fromGesture);
}

export function playSilentGahookWarmup(ctx) {
  const now = Date.now();
  if (window.gahookzSilentWarmupAt && now - window.gahookzSilentWarmupAt < 30000) {
    return;
  }
  window.gahookzSilentWarmupAt = now;
  const destination = ctx.createGain();
  destination.gain.setValueAtTime(0.00001, ctx.currentTime);
  destination.connect(ctx.destination);
  playMonkeyPokeSound({
    ctx,
    destination
  });
  playGahookVoiceCue({
    ctx,
    destination
  });
  setTimeout(() => {
    try {
      destination.disconnect();
    } catch (_error) {}
  }, 1200);
}

export function warmSpeechSynthesis(fromGesture = false) {
  if (effectsMuted()) return;
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    return;
  }
  try {
    window.speechSynthesis.getVoices?.();
    if (!fromGesture || window.gahookzSpeechWarmed) {
      return;
    }
    window.gahookzSpeechWarmed = true;
    const utterance = new SpeechSynthesisUtterance("gah hook");
    utterance.rate = 1.2;
    utterance.pitch = 0.7;
    utterance.volume = 0;
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  } catch (_error) {}
}

export function getAudioContext() {
  if (effectsMuted()) return null;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }
  if (!window.gahookzAudioContext) {
    window.gahookzAudioContext = new AudioContextCtor();
  }
  return window.gahookzAudioContext;
}

export function getNoiseBuffer(ctx, duration) {
  window.gahookzNoiseBuffers = window.gahookzNoiseBuffers || {};
  const key = ctx.sampleRate + ":" + Math.round(duration * 1000);
  if (window.gahookzNoiseBuffers[key]) {
    return window.gahookzNoiseBuffers[key];
  }
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }
  window.gahookzNoiseBuffers[key] = buffer;
  return buffer;
}

export function resetPokeSoundChannel() {
  stopCustomGahookAudio();
  const ctx = getAudioContext();
  if (!ctx) {
    return null;
  }
  const previous = window.gahookzPokeGain;
  if (previous) {
    try {
      previous.gain.cancelScheduledValues(ctx.currentTime);
      previous.gain.setValueAtTime(0.0001, ctx.currentTime);
      setTimeout(() => previous.disconnect(), 80);
    } catch (_error) {
      return {
        ctx,
        destination: ctx.destination
      };
    }
  }
  const destination = ctx.createGain();
  destination.gain.setValueAtTime(1, ctx.currentTime);
  destination.connect(ctx.destination);
  window.gahookzPokeGain = destination;
  // Every Gahook sound starts here, so this is where the music steps aside.
  duckMusic(0.55, 1.2);
  return {
    ctx,
    destination
  };
}

export function playTone(ctx, frequency, start, duration, type = "square", volume = 0.08, destination = ctx.destination) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function playSweep(ctx, fromFrequency, toFrequency, start, duration, type = "sawtooth", volume = 0.08, destination = ctx.destination) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(Math.max(1, fromFrequency), start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, toFrequency), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.025, duration * 0.2));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

export function playNoiseBurst(ctx, start, duration, volume = 0.12, destination = ctx.destination) {
  const buffer = getNoiseBuffer(ctx, duration);
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(gain).connect(destination);
  source.start(start);
}

// ---------------------------------------------------------------------------
// Music
// ---------------------------------------------------------------------------
//
// The music itself (a generative chill-party engine) lives in client/music.ts.
// This part decides *whether* it plays: never before a user gesture (the
// context stays suspended until warmGahookEffects resumes it), never while
// sound is muted, never with the Music switch off, and not in a hidden tab,
// where timers are throttled and a phone would waste battery on it.
//
// The engine schedules notes a few hundred milliseconds ahead of the audio
// clock, and this timer keeps that window topped up.

const MUSIC_LOOKAHEAD_SECONDS = 0.35;
const MUSIC_TICK_MS = 90;

function musicAllowed() {
  if (effectsMuted() || !musicEnabled()) return false;
  return !(typeof document !== "undefined" && document.hidden);
}

function getMusicPlayer(ctx) {
  const current = window.gahookzMusicPlayer;
  if (current && current.ctx === ctx) return current;
  const player = new MusicPlayer(ctx, ctx.destination, {
    setTimeout: (handler, ms) => window.setTimeout(handler, ms)
  });
  window.gahookzMusicPlayer = player;
  // A phone call or another app can suspend the context; pick the music back
  // up when the system hands the audio back.
  ctx.addEventListener?.("statechange", () => {
    if (ctx.state === "running") resumeGameMusic();
  });
  return player;
}

export function setGameMusicState(state) {
  const next = isMusicState(state) ? state : "off";
  if (window.gahookzMusicState === next) return;
  window.gahookzMusicState = next;
  if (next === "off") stopGameMusic();
  else resumeGameMusic();
}

export function resumeGameMusic() {
  const state = window.gahookzMusicState;
  if (!isMusicState(state) || !musicAllowed()) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running") return;
  const player = getMusicPlayer(ctx);
  player.play(state);
  runMusicClock(ctx, player);
}

export function stopGameMusic(fadeSeconds = 0.6) {
  window.clearTimeout(window.gahookzMusicTimer);
  window.gahookzMusicTimer = null;
  window.gahookzMusicPlayer?.stop(fadeSeconds);
}

function runMusicClock(ctx, player) {
  if (window.gahookzMusicTimer) return;
  const tick = () => {
    window.gahookzMusicTimer = null;
    if (!musicAllowed() || ctx.state !== "running" || !player.state) {
      if (player.state) player.stop(0.4);
      return;
    }
    player.scheduleUntil(ctx.currentTime + MUSIC_LOOKAHEAD_SECONDS);
    window.gahookzMusicTimer = window.setTimeout(tick, MUSIC_TICK_MS);
  };
  tick();
}

/** Game sounds pull the music down for a moment, like a DJ's side-chain. */
export function duckMusic(depth = 0.5, holdSeconds = 0.8) {
  try {
    window.gahookzMusicPlayer?.duck(depth, holdSeconds);
  } catch (_error) {}
}

function setMusicFocus(focused) {
  try {
    window.gahookzMusicPlayer?.setFocus(focused);
  } catch (_error) {}
}

if (typeof window !== "undefined") {
  window.gahookzResumeMusic = resumeGameMusic;
  window.addEventListener(MUSIC_EVENT, (event) => {
    if (event.detail) resumeGameMusic();
    else stopGameMusic(0.8);
  });
  document.addEventListener?.("visibilitychange", () => {
    if (document.hidden) stopGameMusic(0.3);
    else resumeGameMusic();
  });
}

export function playMonkeyPokeSound(channel) {
  const ctx = channel?.ctx || getAudioContext();
  if (!ctx) {
    return;
  }
  ctx.resume?.();
  const destination = channel?.destination || ctx.destination;
  const start = ctx.currentTime + 0.02;
  [0, 0.1, 0.2, 0.34].forEach((offset, index) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(index % 2 ? 860 : 520, start + offset);
    oscillator.frequency.exponentialRampToValueAtTime(index % 2 ? 280 : 1120, start + offset + 0.12);
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.16, start + offset + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.15);
    oscillator.connect(gain).connect(destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.17);
  });
  playNoiseBurst(ctx, start, 0.28, 0.11, destination);
}

export function playGahookFormSound(formId, channel, customGahook = null, maxDurationMs = 950) {
  // The Sad Pig replaced the Airhorn Capy (25 Sep). Old rooms and saved
  // choices may still say "capybara"; both cry like the pig, whichever way
  // the forms module normalises the id.
  const requestedForm = String(formId || "").toLowerCase();
  const form = requestedForm === "pig" ? "pig" : normaliseGahookFormId(formId);
  if (form === "custom") {
    playCustomGahookSound(customGahook, channel, maxDurationMs);
    return;
  }
  if (form === "monkey") {
    playMonkeyPokeSound(channel);
    return;
  }
  const ctx = channel?.ctx || getAudioContext();
  if (!ctx) return;
  ctx.resume?.();
  const destination = channel?.destination || ctx.destination;
  const start = ctx.currentTime + 0.015;

  if (form === "gorilla") {
    [78, 61, 92, 54].forEach((frequency, index) => {
      const offset = index * 0.13;
      playTone(ctx, frequency, start + offset, 0.3, "sawtooth", 0.16, destination);
      playTone(ctx, frequency * 2.03, start + offset, 0.2, "square", 0.05, destination);
      playNoiseBurst(ctx, start + offset, 0.1, 0.105, destination);
    });
    playSweep(ctx, 145, 48, start + 0.08, 0.7, "sawtooth", 0.12, destination);
    playSweep(ctx, 540, 1280, start + 0.5, 0.2, "square", 0.07, destination);
    return;
  }
  if (form === "koala") {
    [980, 180, 1120, 150, 860, 1320].forEach((frequency, index) => {
      const offset = index * 0.075;
      playTone(ctx, frequency, start + offset, 0.15, index % 2 ? "sawtooth" : "triangle", 0.11, destination);
      if (index % 2 === 0) playSweep(ctx, frequency, frequency * 1.45, start + offset, 0.12, "triangle", 0.055, destination);
    });
    playSweep(ctx, 210, 92, start + 0.18, 0.55, "triangle", 0.085, destination);
    [0.1, 0.33, 0.56].forEach(offset => playNoiseBurst(ctx, start + offset, 0.1, 0.075, destination));
    return;
  }
  if (form === "croc") {
    [220, 440, 880, 1320, 330, 1660].forEach((frequency, index) => {
      playTone(ctx, frequency, start + index * 0.05, 0.11, "square", 0.09, destination);
    });
    playSweep(ctx, 180, 2100, start + 0.04, 0.33, "sawtooth", 0.08, destination);
    playSweep(ctx, 1700, 260, start + 0.35, 0.22, "square", 0.095, destination);
    [0.25, 0.42, 0.58].forEach((offset, index) => playNoiseBurst(ctx, start + offset, 0.08, 0.2 - index * 0.035, destination));
    playTone(ctx, 2350, start + 0.55, 0.15, "sine", 0.07, destination);
    return;
  }
  if (form === "pig" || form === "capybara") {
    playSadPigCry(ctx, destination, start);
    return;
  }
  if (form === "chicken") {
    [1180, 760, 1320, 690, 1540, 860, 1760].forEach((frequency, index) => {
      playTone(ctx, frequency, start + index * 0.06, 0.105, "square", 0.095, destination);
      if (index % 2 === 0) playSweep(ctx, frequency, frequency * 0.58, start + index * 0.06, 0.13, "sawtooth", 0.055, destination);
    });
    [0.04, 0.2, 0.4, 0.61].forEach((offset, index) => playNoiseBurst(ctx, start + offset, 0.12, 0.18 - index * 0.02, destination));
    playTone(ctx, 2460, start + 0.48, 0.28, "triangle", 0.075, destination);
  }
}

export function stopCustomGahookAudio() {
  if (typeof window === "undefined") return;
  window.clearTimeout(window.gahookzCustomAudioTimer);
  window.gahookzCustomAudioTimer = null;
  const audio = window.gahookzCustomAudio;
  if (!audio) return;
  try {
    audio.pause();
    audio.currentTime = 0;
  } catch (_error) {}
  if (window.gahookzCustomAudio === audio) window.gahookzCustomAudio = null;
}

function playCustomGahookSound(customGahook, channel, maxDurationMs = 950) {
  if (effectsMuted()) return;
  const soundId = String(customGahook?.soundId || "bonk").toLowerCase();
  if (soundId === "none") return;
  if (soundId === "custom" && customGahook?.customAudioDataUrl) {
    try {
      stopCustomGahookAudio();
      const audio = new Audio(customGahook.customAudioDataUrl);
      audio.volume = 0.82;
      window.gahookzCustomAudio = audio;
      audio.addEventListener("ended", () => {
        if (window.gahookzCustomAudio === audio) stopCustomGahookAudio();
      }, { once: true });
      audio.play().catch(() => {});
      const boundedDuration = Math.max(100, Math.min(15_000, Number(maxDurationMs) || 950));
      window.gahookzCustomAudioTimer = window.setTimeout(() => {
        if (window.gahookzCustomAudio === audio) stopCustomGahookAudio();
      }, boundedDuration);
    } catch (_error) {}
    return;
  }

  const ctx = channel?.ctx || getAudioContext();
  if (!ctx) return;
  ctx.resume?.();
  const destination = channel?.destination || ctx.destination;
  const start = ctx.currentTime + 0.015;
  if (soundId === "honk") {
    playSweep(ctx, 240, 172, start, 0.46, "sawtooth", 0.15, destination);
    playSweep(ctx, 480, 344, start, 0.46, "square", 0.055, destination);
    return;
  }
  if (soundId === "boing") {
    playSweep(ctx, 118, 740, start, 0.19, "triangle", 0.15, destination);
    playSweep(ctx, 740, 176, start + 0.18, 0.42, "sine", 0.13, destination);
    return;
  }
  if (soundId === "airhorn") {
    [196, 247, 294].forEach((frequency) => {
      playTone(ctx, frequency, start, 0.62, "sawtooth", 0.095, destination);
      playTone(ctx, frequency * 1.01, start + 0.015, 0.58, "square", 0.035, destination);
    });
    playNoiseBurst(ctx, start, 0.12, 0.09, destination);
    return;
  }
  playTone(ctx, 132, start, 0.2, "sine", 0.18, destination);
  playSweep(ctx, 410, 94, start, 0.25, "triangle", 0.13, destination);
  playNoiseBurst(ctx, start + 0.02, 0.09, 0.1, destination);
}

export function playGahookVoiceCue(channel) {
  const ctx = channel?.ctx || getAudioContext();
  if (!ctx) {
    return;
  }
  ctx.resume?.();
  const destination = channel?.destination || ctx.destination;
  const start = ctx.currentTime + 0.42;
  const notes = [[170, 0, 0.16], [130, 0.15, 0.2], [92, 0.34, 0.26]];
  notes.forEach(([frequency, offset, duration]) => {
    playTone(ctx, frequency, start + offset, duration, "sawtooth", 0.11, destination);
    playTone(ctx, frequency * 1.52, start + offset, duration * 0.8, "triangle", 0.035, destination);
  });
}

export function playLongGahookCue() {
  const ctx = getAudioContext();
  if (!ctx) {
    speakText("gah hoooook", {
      rate: 0.72,
      pitch: 0.6,
      volume: 1,
      lang: "en-US"
    });
    return;
  }
  ctx.resume?.();
  const start = ctx.currentTime + 0.02;
  playTone(ctx, 150, start, 0.55, "sawtooth", 0.13);
  playTone(ctx, 105, start + 0.34, 0.9, "sawtooth", 0.15);
  playTone(ctx, 72, start + 0.78, 0.58, "triangle", 0.09);
  playNoiseBurst(ctx, start + 0.98, 0.24, 0.05);
  speakText("gah hoooook", {
    rate: 0.72,
    pitch: 0.6,
    volume: 0.9,
    lang: "en-US"
  });
}

export function playUltimateGahookSound(channel) {
  const ctx = channel?.ctx || getAudioContext();
  if (!ctx) {
    speakText("ultimate gah hook", {
      rate: 0.82,
      pitch: 0.5,
      volume: 1,
      lang: "en-US"
    });
    return;
  }
  ctx.resume?.();
  const destination = channel?.destination || ctx.destination;
  const start = ctx.currentTime + 0.02;
  for (let index = 0; index < 10; index += 1) {
    const offset = index * 0.13;
    const high = index % 2 ? 980 : 620;
    const low = index % 2 ? 240 : 360;
    playTone(ctx, high, start + offset, 0.12, "sawtooth", 0.12, destination);
    playTone(ctx, low, start + offset + 0.05, 0.18, "square", 0.09, destination);
  }
  [0, 0.55, 1.1, 1.65].forEach(offset => playNoiseBurst(ctx, start + offset, 0.26, 0.13, destination));
  playTone(ctx, 74, start + 0.2, 2.1, "sawtooth", 0.08, destination);
}

export function playUltimateExtraGahookSound() {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  ctx.resume?.();
  const destination = window.gahookzPokeGain || ctx.destination;
  const start = ctx.currentTime + 0.01;
  playNoiseBurst(ctx, start, 0.14, 0.15, destination);
  playTone(ctx, 1180, start, 0.1, "square", 0.11, destination);
  playTone(ctx, 420, start + 0.06, 0.16, "sawtooth", 0.1, destination);
  playTone(ctx, 1480, start + 0.13, 0.09, "square", 0.09, destination);
}

export function playCounterGahookSound(channel) {
  const ctx = channel?.ctx || getAudioContext();
  if (!ctx) return;
  ctx.resume?.();
  const destination = channel?.destination || ctx.destination;
  const start = ctx.currentTime + 0.015;
  playSweep(ctx, 1480, 160, start, 0.22, "sawtooth", 0.12, destination);
  playNoiseBurst(ctx, start + 0.17, 0.16, 0.17, destination);
  playSweep(ctx, 170, 1760, start + 0.22, 0.34, "square", 0.13, destination);
  [420, 630, 945, 1415].forEach((frequency, index) => {
    playTone(ctx, frequency, start + 0.34 + index * 0.07, 0.16, index % 2 ? "triangle" : "square", 0.085, destination);
  });
  playNoiseBurst(ctx, start + 0.62, 0.22, 0.13, destination);
}

export function playGetGotSound(channel) {
  const ctx = channel?.ctx || getAudioContext();
  if (!ctx) {
    return;
  }
  ctx.resume?.();
  const destination = channel?.destination || ctx.destination;
  const start = ctx.currentTime + 0.02;
  const GET_GOT_SOUND_DURATION_SECONDS = 2.85;

  for (let offset = 0; offset < GET_GOT_SOUND_DURATION_SECONDS; offset += 0.32) {
    const beat = Math.round(offset / 0.32);
    const high = beat % 3 === 0 ? 1380 : beat % 3 === 1 ? 840 : 1120;
    const low = beat % 2 === 0 ? 92 : 136;
    playNoiseBurst(ctx, start + offset, beat % 4 === 0 ? 0.19 : 0.11, beat % 4 === 0 ? 0.17 : 0.105, destination);
    playSweep(ctx, high, high * (beat % 2 ? 0.48 : 1.42), start + offset, 0.18, beat % 2 ? "square" : "sawtooth", 0.105, destination);
    playTone(ctx, low, start + offset + 0.09, 0.22, "sawtooth", 0.11, destination);
  }
  [0.18, 1.22, 2.26].forEach((offset, index) => {
    [196, 247, 294].forEach(frequency => playTone(ctx, frequency * (1 + index * 0.05), start + offset, 0.38, "sawtooth", 0.052, destination));
    playSweep(ctx, 240 + index * 45, 980 + index * 120, start + offset, 0.42, "square", 0.065, destination);
  });
  [0.7, 1.62, 2.42].forEach(offset => {
    playTone(ctx, 62, start + offset, 0.42, "square", 0.13, destination);
    playNoiseBurst(ctx, start + offset, 0.24, 0.18, destination);
  });
}

// ---------------------------------------------------------------------------
// Sound-effect palette (everything except the Gahooks)
// ---------------------------------------------------------------------------
//
// One family of timbres, shared with the music: the soft marimba that plays
// the music's lead, glassy FM chimes, a woodblock, bubbly pops, a round brass
// for fanfares and breathy noise. Attacks are a few milliseconds (never a
// hard click), nothing sits in the shrill 3-5 kHz band for long, and the
// pitches come from C major, so the cues agree with each other.
//
// Each effect takes an optional channel ({ ctx, destination }) like the
// Gahook sounds do. The sample renderer passes an OfflineAudioContext
// channel; in the game they play through a bus with a safety limiter.

const NOTE = {
  C4: 261.63, Eb4: 311.13, E4: 329.63, G4: 392, A4: 440,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, B5: 987.77,
  C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, C7: 2093
};

function getSfxBus(ctx) {
  const current = window.gahookzSfxBus;
  if (current && current.context === ctx) return current;
  const bus = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 0;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  bus.connect(limiter).connect(ctx.destination);
  window.gahookzSfxBus = bus;
  return bus;
}

function sfxChannel(channel) {
  if (channel?.ctx) return channel;
  const ctx = getAudioContext();
  if (!ctx) return null;
  ctx.resume?.();
  return { ctx, destination: getSfxBus(ctx) };
}

function envelope(ctx, destination, start, peak, attack, decay) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  gain.gain.setTargetAtTime(0, start + attack, decay);
  gain.connect(destination);
  return gain;
}

function oscillator(ctx, type, frequency, start, stop) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  osc.start(start);
  osc.stop(stop);
  return osc;
}

/** A marimba bar: the fundamental and its quickly-dying fourth partial. */
function mallet(ctx, destination, start, frequency, peak = 0.2, decay = 0.28) {
  const sources = [];
  [[1, 1, decay], [3.93, 0.3, 0.028]].forEach(([ratio, level, tau]) => {
    const osc = oscillator(ctx, "sine", frequency * ratio, start, start + tau * 7 + 0.05);
    osc.connect(envelope(ctx, destination, start, peak * level, 0.002, tau));
    sources.push(osc);
  });
  return sources;
}

/** A two-operator FM bell: bright strike, soft glassy ring. */
function chime(ctx, destination, start, frequency, peak = 0.06, decay = 0.45) {
  const stop = start + decay * 6;
  const carrier = oscillator(ctx, "sine", frequency, start, stop);
  const modulator = oscillator(ctx, "sine", frequency * 3.5, start, stop);
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(frequency * 2, start);
  depth.gain.setTargetAtTime(frequency * 0.15, start, 0.12);
  modulator.connect(depth).connect(carrier.frequency);
  carrier.connect(envelope(ctx, destination, start, peak, 0.003, decay));
  return [carrier, modulator];
}

/** A hollow woodblock tock. */
function woodblock(ctx, destination, start, frequency, peak = 0.2) {
  const body = oscillator(ctx, "sine", frequency * 1.06, start, start + 0.2);
  body.frequency.exponentialRampToValueAtTime(frequency, start + 0.012);
  body.connect(envelope(ctx, destination, start, peak, 0.0015, 0.022));
  const knock = oscillator(ctx, "sine", frequency * 2.63, start, start + 0.08);
  knock.connect(envelope(ctx, destination, start, peak * 0.35, 0.001, 0.008));
  return [body, knock];
}

/** A bubble: a sine that leaps up an octave in a few milliseconds. */
function pop(ctx, destination, start, frequency, peak = 0.12) {
  const osc = oscillator(ctx, "sine", frequency * 0.55, start, start + 0.3);
  osc.frequency.exponentialRampToValueAtTime(frequency, start + 0.035);
  osc.connect(envelope(ctx, destination, start, peak, 0.004, 0.05));
  return [osc];
}

/** Round brass for fanfares: two detuned saws through an opening low-pass. */
function brass(ctx, destination, start, frequency, seconds, peak = 0.1) {
  const end = start + seconds;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.Q.value = 1.2;
  tone.frequency.setValueAtTime(500, start);
  tone.frequency.linearRampToValueAtTime(2800, start + 0.04);
  tone.frequency.setTargetAtTime(1500, start + 0.05, 0.12);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.025);
  gain.gain.setTargetAtTime(peak * 0.75, start + 0.03, 0.1);
  gain.gain.setTargetAtTime(0, end, 0.07);
  tone.connect(gain).connect(destination);
  const sources = [-6, 6].map((cents) => {
    const osc = oscillator(ctx, "sawtooth", frequency, start, end + 0.5);
    osc.detune.value = cents;
    osc.connect(tone);
    return osc;
  });
  if (seconds > 0.3) {
    // A little vibrato on held notes, arriving late, as a player would.
    const vibrato = oscillator(ctx, "sine", 5.5, start, end + 0.5);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, start);
    depth.gain.linearRampToValueAtTime(frequency * 0.012, start + seconds * 0.6);
    vibrato.connect(depth);
    sources.forEach((osc) => depth.connect(osc.frequency));
    sources.push(vibrato);
  }
  return sources;
}

/** Filtered noise sweeping between two frequencies: sparkle or whoosh. */
function swish(ctx, destination, start, seconds, from, to, peak = 0.04) {
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx, 1);
  source.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.4;
  band.frequency.setValueAtTime(from, start);
  band.frequency.exponentialRampToValueAtTime(to, start + seconds);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + seconds * 0.6);
  gain.gain.linearRampToValueAtTime(0, start + seconds);
  source.connect(band).connect(gain).connect(destination);
  source.start(start);
  source.stop(start + seconds + 0.02);
  return [source];
}

function getPinkNoiseBuffer(ctx) {
  window.gahookzPinkNoise = window.gahookzPinkNoise || new WeakMap();
  let buffer = window.gahookzPinkNoise.get(ctx);
  if (buffer) return buffer;
  // Paul Kellet's economy pink filter over white noise: the "shhh" of a
  // crowd rather than the hiss of white noise.
  buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let index = 0; index < data.length; index += 1) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    data[index] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
  }
  window.gahookzPinkNoise.set(ctx, buffer);
  return buffer;
}

/** A burst of hand claps scattered over a stretch of time. */
function claps(ctx, destination, start, seconds, count, peak = 0.16, density = (u) => 1) {
  const bands = [950, 1450, 2100].map((frequency) => {
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = frequency;
    band.Q.value = 1.1;
    band.connect(destination);
    return band;
  });
  const noise = getNoiseBuffer(ctx, 1);
  for (let index = 0; index < count; index += 1) {
    const u = (Math.random() + Math.random()) / 2;
    const at = start + u * seconds;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const gain = ctx.createGain();
    const level = peak * (0.55 + Math.random() * 0.45) * density(u);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.001);
    gain.gain.setTargetAtTime(0, at + 0.001, 0.011);
    source.connect(gain).connect(bands[index % bands.length]);
    source.start(at, Math.random() * 0.9, 0.08);
  }
}

/**
 * A synthesised crowd cheer: a swelling roar of shaped noise, a handful of
 * voices going "wooo!" and "yeah!", a couple of whistles and a scatter of
 * applause, all rising together and fading out.
 */
export function playCrowdCheer(channel, options = {}) {
  const ch = sfxChannel(channel);
  if (!ch) return;
  const { ctx, destination } = ch;
  const seconds = options.seconds ?? 3.2;
  const size = options.size ?? 1;
  const level = options.level ?? 1;
  const start = options.at ?? ctx.currentTime + 0.02;
  const end = start + seconds;
  const bus = ctx.createGain();
  bus.gain.value = level;
  bus.connect(destination);
  // Loudness over the cheer: a fast swell, a held peak, a long fade.
  const shape = (u) => (u < 0.12 ? u / 0.12 : u < 0.5 ? 1 : Math.max(0, 1 - (u - 0.5) / 0.5) ** 1.6);

  // The roar: pink noise through open-vowel formants.
  const roar = ctx.createBufferSource();
  roar.buffer = getPinkNoiseBuffer(ctx);
  roar.loop = true;
  const roarGain = ctx.createGain();
  roarGain.gain.setValueAtTime(0, start);
  for (let t = 0; t <= seconds; t += 0.11) {
    const wobble = 0.78 + Math.random() * 0.22;
    roarGain.gain.linearRampToValueAtTime(0.9 * shape(t / seconds) * wobble, start + t);
  }
  roarGain.gain.linearRampToValueAtTime(0, end);
  [[650, 0.9, 1], [1150, 1.2, 0.75], [2500, 1.6, 0.3]].forEach(([frequency, q, amount]) => {
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = frequency;
    band.Q.value = q;
    const mix = ctx.createGain();
    mix.gain.value = amount;
    roar.connect(band).connect(mix).connect(roarGain);
  });
  roarGain.connect(bus);
  roar.start(start, Math.random());
  roar.stop(end + 0.05);

  // Voices: "wooo" (an oo vowel) and "yeah" (eh opening to ah).
  const voices = Math.max(2, Math.round(7 * size));
  for (let index = 0; index < voices; index += 1) {
    const pitch = 200 + Math.random() * 300;
    const at = start + 0.05 + Math.random() * seconds * 0.35;
    const length = Math.min(end - at - 0.1, 0.7 + Math.random() * 0.9);
    if (length < 0.3) continue;
    const stop = at + length;
    const woo = Math.random() < 0.6;
    const voice = oscillator(ctx, "sawtooth", pitch * 0.8, at, stop + 0.3);
    voice.frequency.exponentialRampToValueAtTime(pitch * 1.22, at + 0.2);
    voice.frequency.linearRampToValueAtTime(pitch * 1.1, at + length * 0.7);
    voice.frequency.exponentialRampToValueAtTime(pitch * 0.78, stop);
    const vibrato = oscillator(ctx, "sine", 5 + Math.random() * 1.5, at, stop + 0.3);
    const vibratoDepth = ctx.createGain();
    vibratoDepth.gain.value = pitch * 0.025;
    vibrato.connect(vibratoDepth).connect(voice.frequency);
    const amp = ctx.createGain();
    const peak = (0.05 + Math.random() * 0.03) * shape((at - start) / seconds + 0.05);
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(peak, at + 0.08);
    amp.gain.setTargetAtTime(0, stop - 0.08, 0.07);
    amp.connect(bus);
    const first = ctx.createBiquadFilter();
    first.type = "bandpass";
    first.Q.value = 5;
    first.frequency.setValueAtTime(woo ? 300 : 480, at);
    first.frequency.linearRampToValueAtTime(woo ? 340 : 760, at + 0.18);
    const second = ctx.createBiquadFilter();
    second.type = "bandpass";
    second.Q.value = 7;
    second.frequency.setValueAtTime(woo ? 780 : 1850, at);
    second.frequency.linearRampToValueAtTime(woo ? 850 : 1250, at + 0.18);
    const secondLevel = ctx.createGain();
    secondLevel.gain.value = 0.5;
    voice.connect(first).connect(amp);
    voice.connect(second).connect(secondLevel).connect(amp);
  }

  // Whistles: a wolf whistle and a long rising one, kept soft.
  const whistle = (at, points, peak) => {
    const last = points[points.length - 1][0];
    const osc = oscillator(ctx, "sine", points[0][1], at, at + last + 0.2);
    points.slice(1).forEach(([time, frequency]) => osc.frequency.exponentialRampToValueAtTime(frequency, at + time));
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(peak, at + 0.03);
    amp.gain.setValueAtTime(peak, at + last - 0.04);
    amp.gain.linearRampToValueAtTime(0, at + last + 0.03);
    osc.connect(amp).connect(bus);
  };
  if (size >= 0.5) {
    const wolf = start + 0.35 + Math.random() * 0.3;
    whistle(wolf, [[0, 1350], [0.16, 2600]], 0.03);
    whistle(wolf + 0.26, [[0, 1250], [0.2, 2750], [0.42, 1750]], 0.03);
  }
  if (size >= 1) whistle(start + 1.1 + Math.random() * 0.4, [[0, 2100], [0.55, 2900], [0.7, 2500]], 0.024);

  // Applause, thickest while the roar peaks.
  claps(ctx, bus, start + 0.12, seconds * 0.9, Math.round(42 * size), 0.2, (u) => 0.4 + 0.6 * shape(u));
}

/** "Ta-ta-ta-taaa": a short brass fanfare over a C major chord. */
function fanfare(ctx, destination, start, scale = 1) {
  const step = 0.085;
  [NOTE.G4, NOTE.C5, NOTE.E5].forEach((frequency, index) => brass(ctx, destination, start + index * step, frequency, 0.075, 0.09 * scale));
  [NOTE.C5, NOTE.E5, NOTE.G5].forEach((frequency) => brass(ctx, destination, start + step * 3, frequency, 0.7, 0.07 * scale));
  brass(ctx, destination, start + step * 3, NOTE.C4, 0.7, 0.06 * scale);
  chime(ctx, destination, start + step * 3, NOTE.G6, 0.04 * scale, 0.5);
  chime(ctx, destination, start + step * 3 + 0.05, NOTE.C7, 0.03 * scale, 0.5);
}

/**
 * The end of a game: a fanfare and the whole room cheering. Played once per
 * game for everyone watching, from syncGameSoundCues.
 */
export function playGameWinCheer(channel) {
  const ch = sfxChannel(channel);
  if (!ch) return;
  duckMusic(0.7, 3.2);
  const start = ch.ctx.currentTime + 0.03;
  fanfare(ch.ctx, ch.destination, start, 1);
  playCrowdCheer(ch, { at: start + 0.2, seconds: 3.2, size: 1, level: 1 });
}

/** A smaller win: the 1v1 arena winner hears a fanfare and a little crowd. */
export function playVictoryPartySound(channel) {
  const ch = sfxChannel(channel);
  if (!ch) return;
  duckMusic(0.6, 1.8);
  const start = ch.ctx.currentTime + 0.03;
  fanfare(ch.ctx, ch.destination, start, 0.9);
  playCrowdCheer(ch, { at: start + 0.2, seconds: 1.8, size: 0.5, level: 0.75 });
}

/** The player's answer is in: a woodblock tock and a rising two-note mallet. */
export function playAnswerLockedSound(channel) {
  const ch = sfxChannel(channel);
  if (!ch) return;
  const { ctx, destination } = ch;
  window.gahookzAnswerLockedAt = Date.now();
  duckMusic(0.3, 0.3);
  const start = ctx.currentTime + 0.01;
  woodblock(ctx, destination, start, 1250, 0.16);
  mallet(ctx, destination, start + 0.015, NOTE.G5, 0.2, 0.18);
  mallet(ctx, destination, start + 0.085, NOTE.C6, 0.24, 0.3);
  chime(ctx, destination, start + 0.085, NOTE.C7, 0.02, 0.3);
}

/**
 * One of the last three seconds of answering: a soft woodblock, a little
 * higher each second. Returns the scheduled sources so a cancelled countdown
 * (everyone answered, the host paused) can be silenced before it sounds.
 */
export function playCountdownTick(secondsLeft, channel, at) {
  const ch = sfxChannel(channel);
  if (!ch) return [];
  const pitch = secondsLeft >= 3 ? 1050 : secondsLeft === 2 ? 1180 : 1400;
  const start = at ?? ch.ctx.currentTime + 0.01;
  return woodblock(ch.ctx, ch.destination, start, pitch, 0.13 + (3 - Math.min(3, secondsLeft)) * 0.025);
}

/** The reveal: "correct" sparkles upward, "wrong" is a friendly womp, "neutral" a soft ta-da. */
export function playRevealSound(result = "neutral", channel) {
  const ch = sfxChannel(channel);
  if (!ch) return;
  const { ctx, destination } = ch;
  duckMusic(0.5, 0.9);
  const start = ctx.currentTime + 0.02;
  if (result === "correct") {
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((frequency, index) => {
      mallet(ctx, destination, start + index * 0.06, frequency, 0.19, 0.3);
    });
    chime(ctx, destination, start + 0.2, NOTE.E6, 0.05, 0.5);
    chime(ctx, destination, start + 0.26, NOTE.G6, 0.04, 0.55);
    swish(ctx, destination, start + 0.05, 0.45, 2500, 9000, 0.02);
    return;
  }
  if (result === "wrong") {
    // Two soft falling notes, the second sagging a little: "aww", not a buzzer.
    [[NOTE.Eb4, 0, 0.16], [NOTE.C4, 0.2, 0.42]].forEach(([frequency, offset, length]) => {
      const at = start + offset;
      const osc = oscillator(ctx, "triangle", frequency, at, at + length + 0.3);
      if (length > 0.3) osc.frequency.exponentialRampToValueAtTime(frequency * 0.93, at + length);
      const tone = ctx.createBiquadFilter();
      tone.type = "lowpass";
      tone.frequency.value = 1400;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.26, at + 0.02);
      gain.gain.setTargetAtTime(0.18, at + 0.03, 0.1);
      gain.gain.setTargetAtTime(0, at + length, 0.06);
      osc.connect(tone).connect(gain).connect(destination);
    });
    return;
  }
  [NOTE.C5, NOTE.E5, NOTE.G5].forEach((frequency) => mallet(ctx, destination, start, frequency, 0.13, 0.35));
  chime(ctx, destination, start + 0.04, NOTE.G6, 0.035, 0.5);
}

/**
 * Someone answered. (The name is historical: this used to be a vocal "ooh".)
 * Each answer is a bubble a step higher up the scale, so a round of answers
 * sounds like a jar filling up.
 */
export function playAnswerOohSound(count = 1, channel) {
  let cueCount = Math.max(1, Math.min(6, Number(count) || 1));
  // The player's own answer already had its confirmation sound.
  if (Date.now() - (window.gahookzAnswerLockedAt || 0) < 400) cueCount -= 1;
  if (cueCount <= 0) return;
  const ch = sfxChannel(channel);
  if (!ch) return;
  const ladder = [NOTE.C5, NOTE.D5, NOTE.E5, NOTE.G5, NOTE.A5, NOTE.C6, NOTE.D6, NOTE.E6];
  const start = ch.ctx.currentTime + 0.015;
  for (let index = 0; index < cueCount; index += 1) {
    const step = Math.min(ladder.length - 1, (window.gahookzAnswerPopCount || 0) + index);
    pop(ch.ctx, ch.destination, start + index * 0.07, ladder[step], 0.12);
  }
  window.gahookzAnswerPopCount = (window.gahookzAnswerPopCount || 0) + cueCount;
}

/** Congratulations: a sparkling mallet run, a chime on top and a few claps. */
export function playCongratsSound(channel) {
  const ch = sfxChannel(channel);
  if (!ch) return;
  const { ctx, destination } = ch;
  duckMusic(0.55, 1);
  const start = ctx.currentTime + 0.02;
  [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6].forEach((frequency, index) => mallet(ctx, destination, start + index * 0.065, frequency, 0.2, 0.3));
  chime(ctx, destination, start + 0.3, NOTE.G6, 0.05, 0.6);
  chime(ctx, destination, start + 0.34, NOTE.C7, 0.035, 0.6);
  swish(ctx, destination, start + 0.1, 0.5, 3000, 10000, 0.018);
  claps(ctx, destination, start + 0.3, 0.45, 6, 0.2);
}

/** Ultimate congratulations: three climbing runs and a small crowd. */
export function playUltimateCongratsSound(channel) {
  const ch = sfxChannel(channel);
  if (!ch) {
    speakText("ultimate congratulations", { rate: 0.86, pitch: 1.35, volume: 1, lang: "en-US" });
    return;
  }
  const { ctx, destination } = ch;
  duckMusic(0.65, 2);
  const start = ctx.currentTime + 0.02;
  const runs = [[NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], [NOTE.D5, NOTE.G5, NOTE.B5, NOTE.D6], [NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6]];
  runs.forEach((run, pass) => {
    run.forEach((frequency, index) => mallet(ctx, destination, start + pass * 0.36 + index * 0.055, frequency, 0.18, 0.28));
  });
  chime(ctx, destination, start + 1.08, NOTE.C7, 0.05, 0.7);
  chime(ctx, destination, start + 1.08, NOTE.G6, 0.04, 0.7);
  playCrowdCheer(ch, { at: start + 0.35, seconds: 1.7, size: 0.55, level: 0.7 });
}

/** Each extra tap on an ultimate congratulations: a tiny sparkle. */
export function playUltimateCongratsExtraSound(channel) {
  const ctx = channel?.ctx || getAudioContext();
  if (!ctx) return;
  ctx.resume?.();
  const destination = channel?.destination || window.gahookzPokeGain || getSfxBus(ctx);
  const start = ctx.currentTime + 0.01;
  [NOTE.E6, NOTE.G6, NOTE.C7].forEach((frequency, index) => chime(ctx, destination, start + index * 0.045, frequency, 0.05, 0.25));
  pop(ctx, destination, start, NOTE.C6, 0.06);
}

/** A small crowd booing: low voices on an "oo" vowel sliding down. */
export function playBooSound(channel) {
  const ch = sfxChannel(channel);
  if (!ch) return;
  const { ctx, destination } = ch;
  duckMusic(0.6, 1.2);
  const start = ctx.currentTime + 0.02;
  for (let index = 0; index < 5; index += 1) {
    const at = start + Math.random() * 0.12;
    const pitch = 105 + Math.random() * 75;
    const stop = at + 0.95 + Math.random() * 0.15;
    const voice = oscillator(ctx, "sawtooth", pitch * 1.05, at, stop + 0.3);
    voice.frequency.linearRampToValueAtTime(pitch * 0.8, stop);
    const vibrato = oscillator(ctx, "sine", 4 + Math.random(), at, stop + 0.3);
    const depth = ctx.createGain();
    depth.gain.value = pitch * 0.03;
    vibrato.connect(depth).connect(voice.frequency);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(0.16, at + 0.12);
    amp.gain.setTargetAtTime(0, stop - 0.1, 0.09);
    amp.connect(destination);
    [[310, 5, 1], [720, 6, 0.45]].forEach(([frequency, q, level]) => {
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = frequency;
      band.Q.value = q;
      const mix = ctx.createGain();
      mix.gain.value = level;
      voice.connect(band).connect(mix).connect(amp);
    });
  }
  const breath = ctx.createBufferSource();
  breath.buffer = getPinkNoiseBuffer(ctx);
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 650;
  const air = ctx.createGain();
  air.gain.setValueAtTime(0, start);
  air.gain.linearRampToValueAtTime(0.2, start + 0.15);
  air.gain.setTargetAtTime(0, start + 0.85, 0.12);
  breath.connect(tone).connect(air).connect(destination);
  breath.start(start, Math.random());
  breath.stop(start + 1.4);
}

// ---------------------------------------------------------------------------
// The Sad Pig's cry
// ---------------------------------------------------------------------------

/**
 * Tyson: "a fat crying pig that makes an annoying crying sound". An oink
 * and a snort, a nasal wailing "WAAAH" that cracks upward, wobbles with sobs
 * and sags, then two wet sniffles. Fits the 950 ms Gahook sound budget.
 */
function playSadPigCry(ctx, destination, start) {
  // Oink: a nasal grunt, rasped by a fast tremolo, with a snort of air.
  const grunt = oscillator(ctx, "sawtooth", 200, start, start + 0.2);
  grunt.frequency.exponentialRampToValueAtTime(135, start + 0.14);
  // The rasp is a fast tremolo on its own gain stage, so it can never sound
  // once the envelope after it has closed.
  const rasp = oscillator(ctx, "square", 38, start, start + 0.2);
  const raspDepth = ctx.createGain();
  raspDepth.gain.value = 0.35;
  const raspStage = ctx.createGain();
  raspStage.gain.value = 0.65;
  rasp.connect(raspDepth).connect(raspStage.gain);
  const gruntAmp = ctx.createGain();
  gruntAmp.gain.setValueAtTime(0, start);
  gruntAmp.gain.linearRampToValueAtTime(0.42, start + 0.012);
  gruntAmp.gain.setTargetAtTime(0.16, start + 0.03, 0.02);
  gruntAmp.gain.linearRampToValueAtTime(0.36, start + 0.075);
  gruntAmp.gain.setTargetAtTime(0, start + 0.1, 0.02);
  const snout = ctx.createBiquadFilter();
  snout.type = "bandpass";
  snout.frequency.value = 800;
  snout.Q.value = 2.2;
  grunt.connect(snout).connect(raspStage).connect(gruntAmp).connect(destination);
  const snort = ctx.createBufferSource();
  snort.buffer = getNoiseBuffer(ctx, 0.26);
  const snortBand = ctx.createBiquadFilter();
  snortBand.type = "bandpass";
  snortBand.frequency.value = 520;
  snortBand.Q.value = 1.6;
  const snortAmp = envelope(ctx, destination, start, 0.22, 0.01, 0.035);
  snort.connect(snortBand).connect(snortAmp);
  snort.start(start, 0, 0.16);

  // The wail: a whiny, nasal "waaah" that cracks up, sobs and sags.
  const wail = start + 0.16;
  const wailEnd = start + 0.74;
  const pitch = (osc, ratio) => {
    osc.frequency.setValueAtTime(360 * ratio, wail);
    osc.frequency.exponentialRampToValueAtTime(540 * ratio, wail + 0.12);
    osc.frequency.exponentialRampToValueAtTime(480 * ratio, wail + 0.38);
    osc.frequency.exponentialRampToValueAtTime(320 * ratio, wailEnd);
  };
  const voice = oscillator(ctx, "sawtooth", 360, wail, wailEnd + 0.1);
  pitch(voice, 1);
  // The fat pig's chest: the same cry an octave down, underneath.
  const chest = oscillator(ctx, "triangle", 180, wail, wailEnd + 0.1);
  pitch(chest, 0.5);
  const vibrato = oscillator(ctx, "sine", 7.5, wail, wailEnd + 0.1);
  const vibratoDepth = ctx.createGain();
  vibratoDepth.gain.value = 16;
  vibrato.connect(vibratoDepth);
  vibratoDepth.connect(voice.frequency);
  // Sobs: the cry pulses "wa-a-a-ah" about six times a second, on a gain
  // stage of its own ahead of the envelope.
  const cry = ctx.createGain();
  cry.gain.value = 0.7;
  const sob = oscillator(ctx, "sine", 6, wail + 0.12, wailEnd + 0.1);
  const sobDepth = ctx.createGain();
  sobDepth.gain.value = 0.3;
  sob.connect(sobDepth).connect(cry.gain);
  const cryEnvelope = ctx.createGain();
  cryEnvelope.gain.setValueAtTime(0, wail);
  cryEnvelope.gain.linearRampToValueAtTime(0.34, wail + 0.04);
  cryEnvelope.gain.setTargetAtTime(0.28, wail + 0.1, 0.1);
  cryEnvelope.gain.setTargetAtTime(0, wailEnd - 0.04, 0.03);
  cry.connect(cryEnvelope).connect(destination);
  // "w" opening to "aa", plus a nasal buzz near 2.7 kHz: that is the annoying part.
  [[[380, 850], 4, 1], [[900, 1300], 5, 0.6], [[2700, 2700], 8, 0.35]].forEach(([[from, to], q, level]) => {
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = q;
    band.frequency.setValueAtTime(from, wail);
    band.frequency.linearRampToValueAtTime(to, wail + 0.1);
    const mix = ctx.createGain();
    mix.gain.value = level;
    voice.connect(band).connect(mix).connect(cry);
  });
  const chestLevel = ctx.createGain();
  chestLevel.gain.value = 0.35;
  chest.connect(chestLevel).connect(cry);

  // Two wet sniffles: short breaths drawn in through a hissy band.
  [0.77, 0.86].forEach((offset) => {
    const at = start + offset;
    const sniff = ctx.createBufferSource();
    sniff.buffer = getNoiseBuffer(ctx, 0.14);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.setValueAtTime(2600, at);
    band.frequency.linearRampToValueAtTime(4200, at + 0.06);
    band.Q.value = 1.3;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(0.16, at + 0.055);
    amp.gain.linearRampToValueAtTime(0, at + 0.07);
    sniff.connect(band).connect(amp).connect(destination);
    sniff.start(at, 0, 0.08);
  });
}

// ---------------------------------------------------------------------------
// Game cues
// ---------------------------------------------------------------------------
//
// The app calls syncGameSoundCues with every room snapshot. It compares the
// snapshot with the previous one and plays the cues for what changed: your
// answer locked in, the last three seconds ticking, the reveal, the finale
// cheer. The first snapshot of a room on this page only records where the
// game is, so joining, refreshing or reconnecting into a round never replays
// a reveal or a cheer.

const gameCues = { code: "", phase: "", questionId: "", answerId: "", countdownKey: "", countdownSources: [], cheeredAt: 0 };

function cancelCountdownTicks() {
  gameCues.countdownSources.forEach((source) => {
    try {
      source.stop(0);
    } catch (_error) {}
  });
  gameCues.countdownSources = [];
}

function syncCountdownTicks(lobby, phase, questionId, answerId) {
  const endsAt = Number(lobby.phaseEndsAt) || 0;
  const key = phase === "answering" && endsAt && !lobby.paused && !answerId ? questionId + ":" + endsAt : "";
  if (key === gameCues.countdownKey) return;
  cancelCountdownTicks();
  gameCues.countdownKey = key;
  if (!key) return;
  const ch = sfxChannel();
  if (!ch || ch.ctx.state !== "running") return;
  const serverNow = Date.now() + (Number(window.gahookzServerClockOffset) || 0);
  [3, 2, 1].forEach((secondsLeft) => {
    const at = ch.ctx.currentTime + (endsAt - secondsLeft * 1000 - serverNow) / 1000;
    if (at > ch.ctx.currentTime + 0.02) gameCues.countdownSources.push(...playCountdownTick(secondsLeft, ch, at));
  });
}

function revealResultFor(lobby) {
  const answerId = lobby.ownAnswer?.answerId;
  if (!answerId) return "neutral";
  const question = lobby.currentQuestion;
  const winners = (question?.answers || []).filter((answer) => answer.correct || answer.id === question?.correctAnswerId).map((answer) => answer.id);
  if (!winners.length) return "neutral";
  return winners.includes(answerId) ? "correct" : "wrong";
}

export function syncGameSoundCues(lobby) {
  if (!lobby?.code) {
    cancelCountdownTicks();
    gameCues.countdownKey = "";
    gameCues.code = "";
    setMusicFocus(false);
    return;
  }
  const phase = String(lobby.phase || "");
  const questionId = String(lobby.currentQuestion?.id ?? lobby.currentQuestionIndex ?? "");
  const answerId = String(lobby.ownAnswer?.answerId || "");
  const firstSnapshot = gameCues.code !== lobby.code;
  const previous = { phase: gameCues.phase, questionId: gameCues.questionId, answerId: gameCues.answerId };
  Object.assign(gameCues, { code: lobby.code, phase, questionId, answerId });
  // Reading time: the music steps back so the question can be read (and, on
  // the host's screen, read aloud).
  setMusicFocus(phase === "reading");
  syncCountdownTicks(lobby, phase, questionId, answerId);
  if (firstSnapshot) return;
  if (questionId !== previous.questionId) window.gahookzAnswerPopCount = 0;
  if (phase === "answering" && answerId && !previous.answerId && questionId === previous.questionId) playAnswerLockedSound();
  if (phase === "reveal" && previous.phase !== "reveal") playRevealSound(revealResultFor(lobby));
  if (phase === "finished" && previous.phase !== "finished" && Date.now() - gameCues.cheeredAt > 10000) {
    gameCues.cheeredAt = Date.now();
    playGameWinCheer();
  }
}

export function speakText(text, options = {}) {
  if (effectsMuted()) return;
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    return;
  }
  window.speechSynthesis.cancel();
  duckMusic(0.55, Math.min(4, 0.6 + String(text).length * 0.07));
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options.rate ?? 1;
  utterance.pitch = options.pitch ?? 1;
  utterance.volume = options.volume ?? 1;
  utterance.lang = options.lang ?? "en-US";
  window.speechSynthesis.speak(utterance);
}
