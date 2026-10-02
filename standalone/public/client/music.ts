// Gahookz background music: a small generative sequencer and synthesiser.
//
// Tyson (25 Sep): "everyone says the music is terrible ... generate or source
// some good chill party music." The old music looped five raw oscillator notes
// per game state. This module composes chill party grooves bar by bar and
// plays them through instruments synthesised from oscillators and one shared
// noise buffer, so the game still ships no third-party audio at all.
//
// It is split in two so the musical part can be tested without a browser:
//
// - the *composer* (client/music-composer.ts; pure, no Web Audio, seeded
//   randomness) turns a style into bars of events: extended chords with
//   smooth voice leading, drum and bass patterns, sections (intro, A, B,
//   break), fills and short lead motifs;
// - the *player* (this file) turns those events into audio nodes a few
//   hundred milliseconds ahead of time, crossfades between game states on a
//   bar line, and ducks under game sounds.
//
// The player accepts any BaseAudioContext, so the sample renderer
// (standalone/render-audio-samples.mjs) runs exactly this code through an
// OfflineAudioContext. client/audio.js owns the real AudioContext, the
// gesture and mute rules, and drives the player from a timer.

import {
  Composer,
  MUSIC_STYLES,
  createRng,
  midiToHz,
  stepOffset,
  type Instrument,
  type MusicEvent,
  type MusicState,
  type MusicStyle,
  type Rng
} from "./music-composer.ts";

export { MUSIC_STATES, isMusicState, type MusicState } from "./music-composer.ts";

// ---------------------------------------------------------------------------
// Player (Web Audio)
// ---------------------------------------------------------------------------

/**
 * Output level of the music bus. Chosen by measurement: the lobby groove
 * averages about -31 dBFS RMS with peaks near -17 dBFS, so the music sits
 * well under the sound effects (whose peaks are around -10 to -4 dBFS).
 */
export const DEFAULT_MUSIC_LEVEL = 0.155;

export interface MusicPlayerOptions {
  readonly seed?: number;
  /** Output level of the whole music bus. */
  readonly level?: number;
  /** Used to disconnect finished songs; offline renders can omit it. */
  readonly setTimeout?: (handler: () => void, ms: number) => unknown;
  /** Play only these instruments. For mix analysis (the sample renderer's stems). */
  readonly solo?: readonly Instrument[];
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** One second and a half of seeded white noise per context, shared by every hit. */
export function sharedNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.5), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const rng = createRng(0x9e3779b9);
    for (let i = 0; i < data.length; i += 1) data[i] = rng() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

/**
 * A plate-like reverb tail made from decaying noise that darkens as it fades.
 * Generated once per context, so there is no sample file to ship.
 */
export function createReverbImpulse(ctx: BaseAudioContext, seconds = 1.8, seed = 0x51f15e): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  const preDelay = Math.floor(ctx.sampleRate * 0.012);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    const rng = createRng(seed + channel * 7919);
    let smooth = 0;
    for (let i = preDelay; i < length; i += 1) {
      const t = (i - preDelay) / ctx.sampleRate;
      const progress = t / seconds;
      const coefficient = 0.65 - 0.5 * progress;
      smooth += coefficient * ((rng() * 2 - 1) - smooth);
      data[i] = smooth * Math.exp(-t * 3.4);
    }
  }
  return impulse;
}

function holdParam(param: AudioParam, time: number): void {
  const withHold = param as AudioParam & { cancelAndHoldAtTime?: (when: number) => AudioParam };
  if (typeof withHold.cancelAndHoldAtTime === "function") {
    withHold.cancelAndHoldAtTime(time);
  } else {
    param.cancelScheduledValues(time);
    param.setValueAtTime(param.value, time);
  }
}

function createPanner(ctx: BaseAudioContext): AudioNode & { pan?: AudioParam } {
  return typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : ctx.createGain();
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}

function gain(ctx: BaseAudioContext, value: number): GainNode {
  const node = ctx.createGain();
  node.gain.value = value;
  return node;
}

interface TimedEvent {
  readonly time: number;
  readonly event: MusicEvent;
}

/** One style playing from a start time; the player crossfades between songs. */
class Song {
  readonly state: MusicState;
  readonly style: MusicStyle;
  readonly startTime: number;
  readonly stepSeconds: number;
  readonly barSeconds: number;
  private readonly ctx: BaseAudioContext;
  private readonly composer: Composer;
  private readonly rng: Rng;
  private readonly queue: TimedEvent[] = [];
  private bar = 0;
  private leadSide = 1;
  private readonly lfos: OscillatorNode[] = [];
  readonly out: GainNode;
  private readonly verb: GainNode;
  private readonly echo: GainNode;
  private readonly pump: GainNode;
  private readonly drums: GainNode;
  private readonly hatFilter: BiquadFilterNode;
  private readonly shakerFilter: BiquadFilterNode;
  private readonly clapFilter: BiquadFilterNode;
  private readonly snareFilter: BiquadFilterNode;
  private readonly clickFilter: BiquadFilterNode;
  private readonly crashFilter: BiquadFilterNode;
  private readonly keysBus: AudioNode;
  private readonly padFilter: BiquadFilterNode;
  private readonly leadPan: AudioNode & { pan?: AudioParam };

  private readonly solo: ReadonlySet<Instrument> | null;

  constructor(ctx: BaseAudioContext, player: { input: AudioNode; reverb: AudioNode; delay: AudioNode; solo: ReadonlySet<Instrument> | null }, state: MusicState, startTime: number, seed: number, fadeIn: number) {
    this.ctx = ctx;
    this.solo = player.solo;
    this.state = state;
    this.style = MUSIC_STYLES[state];
    this.startTime = startTime;
    this.stepSeconds = 60 / this.style.bpm / 4;
    this.barSeconds = this.stepSeconds * 16;
    this.rng = createRng(seed ^ 0xa5a5a5a5);
    this.composer = new Composer(this.style, createRng(seed));

    this.out = gain(ctx, 0);
    this.out.gain.setValueAtTime(0, startTime);
    this.out.gain.linearRampToValueAtTime(this.style.level, startTime + Math.max(0.02, fadeIn));
    this.out.connect(player.input);
    this.verb = gain(ctx, 1);
    this.verb.connect(player.reverb);
    this.echo = gain(ctx, 1);
    this.echo.connect(player.delay);
    this.pump = gain(ctx, 1);
    this.pump.connect(this.out);
    this.drums = gain(ctx, 1);
    this.drums.connect(this.out);

    this.hatFilter = filter(ctx, "highpass", 7400, 0.6);
    this.shakerFilter = filter(ctx, "bandpass", 5600, 1.3);
    this.clapFilter = filter(ctx, "bandpass", 1300, 0.6);
    this.snareFilter = filter(ctx, "bandpass", 1900, 0.65);
    this.clickFilter = filter(ctx, "highpass", 2600, 0.7);
    this.crashFilter = filter(ctx, "highpass", 5200, 0.5);
    [this.hatFilter, this.shakerFilter, this.clapFilter, this.snareFilter, this.clickFilter, this.crashFilter].forEach((node) => node.connect(this.drums));
    const drumVerb = gain(ctx, 0.28);
    this.clapFilter.connect(drumVerb);
    this.snareFilter.connect(drumVerb);
    this.crashFilter.connect(drumVerb);
    drumVerb.connect(this.verb);

    // Electric piano: a slow auto-pan, like a Rhodes suitcase amp, in time
    // with the groove (one sweep every two beats).
    const keysPan = createPanner(ctx);
    const keysVerb = gain(ctx, 0.3);
    keysPan.connect(this.pump);
    keysPan.connect(keysVerb);
    keysVerb.connect(this.verb);
    if (keysPan.pan) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = this.style.bpm / 60 / 2;
      const depth = gain(ctx, 0.28);
      lfo.connect(depth).connect(keysPan.pan);
      lfo.start(startTime);
      this.lfos.push(lfo);
    }
    this.keysBus = keysPan;

    // Pad: one shared low-pass whose cutoff drifts slowly.
    this.padFilter = filter(ctx, "lowpass", 700 + 500 * this.style.brightness, 0.5);
    const padLfo = ctx.createOscillator();
    padLfo.frequency.value = 0.06;
    const padDepth = gain(ctx, 260);
    padLfo.connect(padDepth).connect(this.padFilter.frequency);
    padLfo.start(startTime);
    this.lfos.push(padLfo);
    const padVerb = gain(ctx, 0.45);
    this.padFilter.connect(this.pump);
    this.padFilter.connect(padVerb);
    padVerb.connect(this.verb);

    this.leadPan = createPanner(ctx);
    const leadEcho = gain(ctx, 0.3);
    const leadVerb = gain(ctx, 0.3);
    this.leadPan.connect(this.out);
    this.leadPan.connect(leadEcho);
    this.leadPan.connect(leadVerb);
    leadEcho.connect(this.echo);
    leadVerb.connect(this.verb);
  }

  /** The next bar line after `time`, or the next beat if the bar line is far off. */
  boundaryAfter(time: number): number {
    if (time <= this.startTime) return this.startTime;
    const elapsed = time - this.startTime;
    const barLine = this.startTime + Math.ceil(elapsed / this.barSeconds - 1e-6) * this.barSeconds;
    if (barLine - time <= 2) return barLine;
    const beat = this.barSeconds / 4;
    return this.startTime + Math.ceil(elapsed / beat - 1e-6) * beat;
  }

  scheduleUntil(limit: number): void {
    for (;;) {
      if (this.queue.length === 0) {
        const barStart = this.startTime + this.bar * this.barSeconds;
        if (barStart >= limit) return;
        const plan = this.composer.nextBar();
        for (const event of plan.events) {
          const time = barStart + stepOffset(event.step, this.stepSeconds, this.style.swing) + event.nudge;
          this.queue.push({ time: Math.max(barStart, time), event });
        }
        this.queue.sort((a, b) => a.time - b.time);
        this.bar += 1;
        continue;
      }
      const next = this.queue[0];
      if (!next || next.time >= limit) return;
      this.queue.shift();
      // A throttled timer can fall behind; late notes are dropped rather than
      // played in a burst.
      if (next.time >= this.ctx.currentTime - 0.005) this.render(next.time, next.event);
    }
  }

  /** Fade the song away from `at`; its already-scheduled notes finish silently. */
  release(at: number, seconds: number): void {
    for (const node of [this.out, this.verb, this.echo]) {
      holdParam(node.gain, at);
      node.gain.setTargetAtTime(0, at, Math.max(0.01, seconds / 4));
    }
    for (const lfo of this.lfos) {
      try {
        lfo.stop(at + seconds * 2 + 0.5);
      } catch (_error) {
        // Already stopped.
      }
    }
    this.queue.length = 0;
  }

  disconnect(): void {
    for (const node of [this.out, this.verb, this.echo]) {
      try {
        node.disconnect();
      } catch (_error) {
        // Already disconnected.
      }
    }
  }

  private render(time: number, event: MusicEvent): void {
    if (this.solo && !this.solo.has(event.instrument)) return;
    const duration = event.steps * this.stepSeconds;
    switch (event.instrument) {
      case "kick": this.kick(time, event.velocity); break;
      case "snare": this.snare(time, event.velocity); break;
      case "clap": this.clap(time, event.velocity); break;
      case "hat": this.noiseHit(this.hatFilter, time, 0.12, 0.4 * event.velocity, 0.001, 0.026); break;
      case "open": this.noiseHit(this.hatFilter, time, 0.5, 0.22 * event.velocity, 0.002, 0.09); break;
      case "shaker": this.noiseHit(this.shakerFilter, time, 0.14, 0.28 * event.velocity, 0.012, 0.03); break;
      case "crash": this.noiseHit(this.crashFilter, time, 2.6, 0.11 * event.velocity, 0.003, 0.55); break;
      case "riser": this.riser(time, duration, event.velocity); break;
      case "bass": this.bass(time, duration, event.notes, event.velocity); break;
      case "keys": this.keys(time, duration, event.notes, event.velocity); break;
      case "pad": this.pad(time, duration + 0.35, event.notes, event.velocity); break;
      case "lead": this.lead(time, duration, event.notes, event.velocity); break;
    }
  }

  private duckOnKick(time: number, velocity: number): void {
    const depth = this.style.pump * velocity;
    if (depth <= 0) return;
    this.pump.gain.setTargetAtTime(1 - depth, time, 0.006);
    this.pump.gain.setTargetAtTime(1, time + 0.045, 0.1);
  }

  private noiseHit(destination: AudioNode, time: number, seconds: number, peak: number, attack: number, decay: number): void {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    const buffer = sharedNoiseBuffer(ctx);
    source.buffer = buffer;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(peak, time + attack);
    envelope.gain.setTargetAtTime(0, time + attack, decay);
    source.connect(envelope).connect(destination);
    if (seconds < buffer.duration - 0.02) {
      // A random slice of the shared buffer, so no two hits are identical.
      source.start(time, this.rng() * (buffer.duration - seconds - 0.01), seconds);
    } else {
      source.loop = true;
      source.start(time, this.rng() * buffer.duration * 0.5);
      source.stop(time + seconds);
    }
  }

  private kick(time: number, velocity: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const envelope = ctx.createGain();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(54, time + 0.08);
    osc.frequency.exponentialRampToValueAtTime(44, time + 0.3);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(0.42 * velocity, time + 0.003);
    envelope.gain.setTargetAtTime(0, time + 0.03, 0.085);
    osc.connect(envelope).connect(this.drums);
    osc.start(time);
    osc.stop(time + 0.55);
    this.noiseHit(this.clickFilter, time, 0.02, 0.07 * velocity, 0.0008, 0.004);
    this.duckOnKick(time, velocity);
  }

  private body(time: number, from: number, to: number, peak: number, decay: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const envelope = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(from, time);
    osc.frequency.exponentialRampToValueAtTime(to, time + 0.06);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(peak, time + 0.002);
    envelope.gain.setTargetAtTime(0, time + 0.004, decay);
    osc.connect(envelope).connect(this.drums);
    osc.start(time);
    osc.stop(time + decay * 6 + 0.02);
  }

  private snare(time: number, velocity: number): void {
    this.noiseHit(this.snareFilter, time, 0.45, 0.75 * velocity, 0.001, 0.085);
    this.body(time, 200, 168, 0.26 * velocity, 0.045);
  }

  private clap(time: number, velocity: number): void {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = sharedNoiseBuffer(ctx);
    const envelope = ctx.createGain();
    const peak = 1.1 * velocity;
    envelope.gain.setValueAtTime(0, time);
    // Three quick slaps then a short tail: what makes a clap read as hands.
    [0, 0.011, 0.023].forEach((offset, index) => {
      envelope.gain.setValueAtTime(peak * (index === 2 ? 1 : 0.75), time + offset);
      envelope.gain.setTargetAtTime(peak * 0.12, time + offset + 0.001, 0.0035);
    });
    envelope.gain.setValueAtTime(peak * 0.6, time + 0.034);
    envelope.gain.setTargetAtTime(0, time + 0.035, 0.09);
    source.connect(envelope).connect(this.clapFilter);
    source.start(time, this.rng() * 1.1, 0.34);
    this.body(time, 210, 180, 0.12 * velocity, 0.03);
  }

  private riser(time: number, seconds: number, velocity: number): void {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = sharedNoiseBuffer(ctx);
    source.loop = true;
    const band = filter(ctx, "bandpass", 400, 1.6);
    band.frequency.setValueAtTime(350, time);
    band.frequency.exponentialRampToValueAtTime(6000, time + seconds);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(0.1 * velocity, time + seconds * 0.98);
    envelope.gain.setTargetAtTime(0, time + seconds * 0.98, 0.015);
    source.connect(band).connect(envelope);
    envelope.connect(this.out);
    envelope.connect(this.verb);
    source.start(time);
    source.stop(time + seconds + 0.12);
  }

  private bass(time: number, seconds: number, notes: readonly number[], velocity: number): void {
    const ctx = this.ctx;
    const midi = notes[0];
    if (midi === undefined) return;
    const frequency = midiToHz(midi);
    const end = time + Math.max(0.08, seconds * 0.92);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(0.24 * velocity, time + 0.006);
    envelope.gain.setTargetAtTime(0.18 * velocity, time + 0.01, 0.25);
    envelope.gain.setTargetAtTime(0, end, 0.03);
    envelope.connect(this.pump);
    // A pure sine for the weight, and a filtered saw so phone speakers, which
    // cannot reproduce the fundamental, still hear the bass line.
    const sub = ctx.createOscillator();
    sub.frequency.value = frequency;
    const subLevel = gain(ctx, 0.45);
    sub.connect(subLevel).connect(envelope);
    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = frequency;
    const tone = filter(ctx, "lowpass", 900, 2.5);
    tone.frequency.setValueAtTime(900 + 900 * velocity, time);
    tone.frequency.setTargetAtTime(420, time + 0.005, 0.08);
    const sawLevel = gain(ctx, 0.55);
    saw.connect(tone).connect(sawLevel).connect(envelope);
    sub.start(time);
    saw.start(time);
    sub.stop(end + 0.2);
    saw.stop(end + 0.2);
  }

  /** Two-operator FM electric piano: bright on the attack, mellow as it rings. */
  private keys(time: number, seconds: number, notes: readonly number[], velocity: number): void {
    const ctx = this.ctx;
    const stab = seconds <= this.stepSeconds * 1.5;
    const end = time + (stab ? Math.max(0.1, seconds) : seconds);
    const level = 0.2 * this.style.keysLevel * velocity / Math.sqrt(Math.max(1, notes.length / 2));
    const brightness = this.style.brightness * (0.75 + 0.6 * velocity);
    for (const midi of notes) {
      const frequency = midiToHz(midi) * Math.pow(2, (this.rng() - 0.5) * 0.004);
      const carrier = ctx.createOscillator();
      carrier.frequency.value = frequency;
      const modulator = ctx.createOscillator();
      modulator.frequency.value = frequency;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(frequency * 1.8 * brightness, time);
      depth.gain.setTargetAtTime(frequency * 0.32 * brightness, time, 0.18);
      modulator.connect(depth).connect(carrier.frequency);
      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(0, time);
      envelope.gain.linearRampToValueAtTime(level, time + 0.004);
      envelope.gain.setTargetAtTime(level * 0.3, time + 0.004, 0.55 + 220 / frequency);
      envelope.gain.setTargetAtTime(0, end, stab ? 0.08 : 0.16);
      carrier.connect(envelope).connect(this.keysBus);
      const stop = end + (stab ? 0.5 : 0.9);
      carrier.start(time);
      modulator.start(time);
      carrier.stop(stop);
      modulator.stop(stop);
    }
  }

  /** Warm pad: two detuned saws per note through the shared drifting low-pass. */
  private pad(time: number, seconds: number, notes: readonly number[], velocity: number): void {
    const ctx = this.ctx;
    const level = 0.045 * this.style.padLevel * velocity;
    const end = time + seconds;
    for (const midi of notes) {
      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(0, time);
      envelope.gain.linearRampToValueAtTime(level, time + Math.min(0.6, seconds * 0.3));
      envelope.gain.setTargetAtTime(0, end, 0.35);
      envelope.connect(this.padFilter);
      for (const cents of [-7, 7]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = midiToHz(midi);
        osc.detune.value = cents;
        osc.connect(envelope);
        osc.start(time);
        osc.stop(end + 1.8);
      }
    }
  }

  private lead(time: number, seconds: number, notes: readonly number[], velocity: number): void {
    const ctx = this.ctx;
    const midi = notes[0];
    if (midi === undefined) return;
    const frequency = midiToHz(midi);
    this.leadSide = -this.leadSide;
    if (this.leadPan.pan) this.leadPan.pan.setTargetAtTime(0.22 * this.leadSide, Math.max(0, time - 0.03), 0.01);
    if (this.style.lead.timbre === "marimba") {
      // A marimba bar: the fundamental plus its bright fourth partial, which
      // dies away almost at once.
      const partials: [number, number, number][] = [[1, 0.27, 0.32], [3.93, 0.08, 0.03]];
      for (const [ratio, peak, decay] of partials) {
        const osc = ctx.createOscillator();
        osc.frequency.value = frequency * ratio;
        const envelope = ctx.createGain();
        envelope.gain.setValueAtTime(0, time);
        envelope.gain.linearRampToValueAtTime(peak * velocity, time + 0.002);
        envelope.gain.setTargetAtTime(0, time + 0.003, decay);
        osc.connect(envelope).connect(this.leadPan);
        osc.start(time);
        osc.stop(time + decay * 7 + 0.05);
      }
      return;
    }
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = frequency;
    const tone = filter(ctx, "lowpass", 3400, 2.2);
    tone.frequency.setValueAtTime(3600, time);
    tone.frequency.setTargetAtTime(900, time + 0.004, 0.11);
    const envelope = ctx.createGain();
    const end = time + Math.max(0.12, seconds);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(0.1 * velocity, time + 0.004);
    envelope.gain.setTargetAtTime(0.035 * velocity, time + 0.006, 0.18);
    envelope.gain.setTargetAtTime(0, end, 0.08);
    osc.connect(tone).connect(envelope).connect(this.leadPan);
    osc.start(time);
    osc.stop(end + 0.5);
  }
}

/**
 * The music bus: every song, its reverb and echo, a gentle glue compressor,
 * a "focus" low-pass for reading time, the side-chain duck that game sounds
 * pull on, and the output level.
 */
export class MusicPlayer {
  readonly ctx: BaseAudioContext;
  readonly input: GainNode;
  readonly reverb: ConvolverNode;
  readonly delay: GainNode;
  readonly output: GainNode;
  private readonly delayLine: DelayNode;
  private readonly focusFilter: BiquadFilterNode;
  private readonly focusGain: GainNode;
  private readonly duckGain: GainNode;
  private readonly timers: MusicPlayerOptions["setTimeout"];
  private current: Song | null = null;
  private pending: Song | null = null;
  private scheduled = 0;
  private seed: number;
  private focused = false;
  readonly solo: ReadonlySet<Instrument> | null;

  constructor(ctx: BaseAudioContext, destination: AudioNode, options: MusicPlayerOptions = {}) {
    this.ctx = ctx;
    this.solo = options.solo ? new Set(options.solo) : null;
    this.timers = options.setTimeout;
    this.seed = (options.seed ?? Math.floor(Math.random() * 0xffffffff)) >>> 0;

    this.input = gain(ctx, 1);
    const rumble = filter(ctx, "highpass", 32, 0.7);
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -14;
    glue.knee.value = 10;
    glue.ratio.value = 3;
    glue.attack.value = 0.01;
    glue.release.value = 0.22;
    this.focusFilter = filter(ctx, "lowpass", 16000, 0.5);
    this.focusGain = gain(ctx, 1);
    this.duckGain = gain(ctx, 1);
    this.output = gain(ctx, options.level ?? DEFAULT_MUSIC_LEVEL);
    this.input.connect(rumble).connect(glue).connect(this.focusFilter).connect(this.focusGain).connect(this.duckGain).connect(this.output);
    this.output.connect(destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = createReverbImpulse(ctx);
    const reverbReturn = gain(ctx, 0.5);
    this.reverb.connect(reverbReturn).connect(this.input);

    // A dotted-eighth echo for the lead, darkened on each repeat.
    this.delay = gain(ctx, 1);
    this.delayLine = ctx.createDelay(2);
    this.delayLine.delayTime.value = 0.45;
    const feedback = gain(ctx, 0.32);
    const darken = filter(ctx, "lowpass", 2800, 0.5);
    const thin = filter(ctx, "highpass", 320, 0.5);
    const echoReturn = gain(ctx, 0.55);
    this.delay.connect(this.delayLine);
    this.delayLine.connect(darken).connect(thin);
    thin.connect(feedback).connect(this.delayLine);
    thin.connect(echoReturn).connect(this.input);
  }

  get state(): MusicState | null {
    return (this.pending ?? this.current)?.state ?? null;
  }

  private nextSeed(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed;
  }

  private song(state: MusicState, start: number, fadeIn: number): Song {
    const song = new Song(this.ctx, this, state, start, this.nextSeed(), fadeIn);
    this.delayLine.delayTime.setValueAtTime(0.75 * 60 / song.style.bpm, start);
    return song;
  }

  private retire(song: Song, after: number): void {
    if (!this.timers) return;
    const delayMs = Math.max(0, (after - this.ctx.currentTime) * 1000);
    this.timers(() => song.disconnect(), delayMs);
  }

  /**
   * Play a state. From silence the song fades in; from another state the new
   * song starts on the next bar line (or beat, if the bar line is far away)
   * and the old one fades out underneath it.
   */
  play(state: MusicState): void {
    const now = this.ctx.currentTime;
    if (this.pending) {
      if (this.pending.state === state) return;
      this.pending.disconnect();
      this.pending = null;
    }
    if (this.current && this.current.state === state) return;
    const from = Math.max(now + 0.05, this.scheduled);
    if (!this.current) {
      this.current = this.song(state, from, 1.2);
      return;
    }
    this.pending = this.song(state, this.current.boundaryAfter(from), 0.04);
  }

  stop(fadeSeconds = 0.6): void {
    const now = this.ctx.currentTime;
    if (this.pending) {
      this.pending.disconnect();
      this.pending = null;
    }
    if (this.current) {
      this.current.release(now, fadeSeconds);
      this.retire(this.current, now + fadeSeconds * 2 + 2);
      this.current = null;
    }
    this.scheduled = now;
  }

  /** Create audio nodes for every note that starts before `time`. */
  scheduleUntil(time: number): void {
    if (time <= this.scheduled) return;
    if (this.pending && this.current && time >= this.pending.startTime) {
      const switchAt = this.pending.startTime;
      this.current.scheduleUntil(switchAt);
      this.current.release(switchAt, 1);
      this.retire(this.current, switchAt + 4);
      this.current = this.pending;
      this.pending = null;
    }
    this.current?.scheduleUntil(time);
    this.scheduled = time;
  }

  /** Side-chain from game sounds: dip the music, then let it swell back. */
  duck(depth = 0.45, holdSeconds = 0.6, at = this.ctx.currentTime): void {
    const param = this.duckGain.gain;
    holdParam(param, at);
    param.setTargetAtTime(Math.max(0.05, 1 - depth), at, 0.03);
    param.setTargetAtTime(1, at + Math.max(0.05, holdSeconds), 0.45);
  }

  /** Reading time: tuck the music further back and soften its top end. */
  setFocus(focused: boolean, at = this.ctx.currentTime): void {
    if (this.focused === focused) return;
    this.focused = focused;
    holdParam(this.focusFilter.frequency, at);
    holdParam(this.focusGain.gain, at);
    this.focusFilter.frequency.setTargetAtTime(focused ? 2400 : 16000, at, 0.4);
    this.focusGain.gain.setTargetAtTime(focused ? 0.62 : 1, at, 0.4);
  }

  dispose(): void {
    this.stop(0.05);
    try {
      this.output.disconnect();
    } catch (_error) {
      // Already disconnected.
    }
  }
}
