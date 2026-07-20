import { effectsMuted } from "./preferences.jsx";
import { normaliseGahookFormId } from "./gahook-forms.js";

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
      Promise.resolve(ctx.resume?.()).then(() => playSilentGahookWarmup(ctx)).catch(() => {});
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

export function playVictoryPartySound() {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  ctx.resume?.();
  const start = ctx.currentTime + 0.04;
  const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 987.77, 1174.66, 1318.51];
  notes.forEach((note, index) => playTone(ctx, note, start + index * 0.12, 0.16, index % 2 ? "triangle" : "square", 0.09));
  playNoiseBurst(ctx, start, 0.18, 0.08);
  playNoiseBurst(ctx, start + 0.38, 0.2, 0.07);
  playNoiseBurst(ctx, start + 0.78, 0.24, 0.08);
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
  const form = normaliseGahookFormId(formId);
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
  if (form === "capybara") {
    [0, 0.24, 0.49].forEach((offset, stabIndex) => {
      [196, 247, 294].forEach((frequency) => {
        playTone(ctx, frequency * (1 + stabIndex * 0.08), start + offset, 0.2, "sawtooth", 0.085, destination);
        playTone(ctx, frequency * 1.01, start + offset + 0.015, 0.18, "square", 0.03, destination);
      });
      playNoiseBurst(ctx, start + offset, 0.08, 0.105, destination);
    });
    playSweep(ctx, 260, 820, start + 0.08, 0.64, "sawtooth", 0.055, destination);
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

export function playAnswerOohSound(count = 1) {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  ctx.resume?.();
  const cueCount = Math.max(1, Math.min(6, Number(count) || 1));
  const destination = ctx.destination;
  for (let index = 0; index < cueCount; index += 1) {
    const start = ctx.currentTime + 0.015 + index * 0.055;
    const output = ctx.createGain();
    output.gain.setValueAtTime(0.0001, start);
    output.gain.exponentialRampToValueAtTime(0.034, start + 0.035);
    output.gain.exponentialRampToValueAtTime(0.018, start + 0.17);
    output.gain.exponentialRampToValueAtTime(0.0001, start + 0.34);
    output.connect(destination);
    [[215, 0.78], [430, 0.22], [645, 0.08]].forEach(([frequency, volume], harmonicIndex) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = harmonicIndex === 0 ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.72, start + 0.16);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.88, start + 0.32);
      gain.gain.setValueAtTime(volume, start);
      oscillator.connect(gain).connect(output);
      oscillator.start(start);
      oscillator.stop(start + 0.35);
    });
    setTimeout(() => {
      try {
        output.disconnect();
      } catch (_error) {}
    }, 480 + index * 55);
  }
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

export function playCongratsSound(channel) {
  const ctx = channel?.ctx || getAudioContext();
  if (!ctx) {
    return;
  }
  ctx.resume?.();
  const destination = channel?.destination || ctx.destination;
  const start = ctx.currentTime + 0.02;
  [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((note, index) => {
    playTone(ctx, note, start + index * 0.09, 0.15, index % 2 ? "triangle" : "square", 0.1, destination);
  });
  playNoiseBurst(ctx, start + 0.08, 0.15, 0.06, destination);
  playNoiseBurst(ctx, start + 0.42, 0.18, 0.08, destination);
}

export function playUltimateCongratsSound(channel) {
  const ctx = channel?.ctx || getAudioContext();
  if (!ctx) {
    speakText("ultimate congratulations", { rate: 0.86, pitch: 1.35, volume: 1, lang: "en-US" });
    return;
  }
  ctx.resume?.();
  const destination = channel?.destination || ctx.destination;
  const start = ctx.currentTime + 0.02;
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98, 2093];
  for (let pass = 0; pass < 3; pass += 1) {
    notes.forEach((note, index) => {
      playTone(ctx, note * (1 + pass * 0.04), start + pass * 0.48 + index * 0.065, 0.18, index % 2 ? "triangle" : "square", 0.085, destination);
    });
    playNoiseBurst(ctx, start + pass * 0.48 + 0.08, 0.2, 0.055, destination);
  }
}

export function playUltimateCongratsExtraSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  ctx.resume?.();
  const destination = window.gahookzPokeGain || ctx.destination;
  const start = ctx.currentTime + 0.01;
  [1046.5, 1318.51, 1567.98].forEach((note, index) => playTone(ctx, note, start + index * 0.045, 0.12, "triangle", 0.08, destination));
  playNoiseBurst(ctx, start + 0.04, 0.11, 0.04, destination);
}

export function playBooSound(channel) {
  const ctx = channel?.ctx || getAudioContext();
  if (!ctx) {
    return;
  }
  ctx.resume?.();
  const destination = channel?.destination || ctx.destination;
  const start = ctx.currentTime + 0.02;
  playNoiseBurst(ctx, start, 0.28, 0.14, destination);
  [180, 150, 122, 92].forEach((note, index) => {
    playTone(ctx, note, start + index * 0.16, 0.28, "sawtooth", 0.12, destination);
    playTone(ctx, note * 0.55, start + index * 0.16 + 0.05, 0.24, "triangle", 0.08, destination);
  });
  playNoiseBurst(ctx, start + 0.72, 0.24, 0.12, destination);
}

export function speakText(text, options = {}) {
  if (effectsMuted()) return;
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options.rate ?? 1;
  utterance.pitch = options.pitch ?? 1;
  utterance.volume = options.volume ?? 1;
  utterance.lang = options.lang ?? "en-US";
  window.speechSynthesis.speak(utterance);
}
