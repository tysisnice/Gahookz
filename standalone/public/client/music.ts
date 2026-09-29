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
// - the *composer* (pure: no Web Audio, seeded randomness) turns a style into
//   bars of events: extended chords with smooth voice leading, drum and bass
//   patterns, sections (intro, A, B, break), fills and short lead motifs;
// - the *player* turns those events into audio nodes a few hundred
//   milliseconds ahead of time, crossfades between game states on a bar line,
//   and ducks under game sounds.
//
// The player accepts any BaseAudioContext, so the sample renderer
// (standalone/render-audio-samples.mjs) runs exactly this code through an
// OfflineAudioContext. client/audio.js owns the real AudioContext, the
// gesture and mute rules, and drives the player from a timer.

export type MusicState = "welcome" | "lobby" | "prep" | "live" | "finale";
export const MUSIC_STATES: readonly MusicState[] = ["welcome", "lobby", "prep", "live", "finale"];

export function isMusicState(value: unknown): value is MusicState {
  return typeof value === "string" && (MUSIC_STATES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Randomness and small helpers
// ---------------------------------------------------------------------------

export type Rng = () => number;

/** mulberry32: tiny, fast and good enough to vary a groove. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function itemAt<T>(items: readonly T[], index: number): T {
  const item = items[((index % items.length) + items.length) % items.length];
  if (item === undefined) throw new RangeError("Cannot pick from an empty list");
  return item;
}

function pick<T>(items: readonly T[], rng: Rng): T {
  return itemAt(items, Math.floor(rng() * items.length));
}

function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ---------------------------------------------------------------------------
// Harmony
// ---------------------------------------------------------------------------

// Four-note rootless voicings (the bass plays the root). These are the colours
// of neo-soul and lo-fi keys: ninths, elevenths and thirteenths rather than
// plain triads, which is most of what makes the music sound "chill".
const CHORD_QUALITIES = {
  maj9: { tones: [4, 7, 11, 14], third: 4, seventh: 11 },
  "6/9": { tones: [4, 7, 9, 14], third: 4, seventh: 9 },
  m9: { tones: [3, 7, 10, 14], third: 3, seventh: 10 },
  m11: { tones: [3, 10, 14, 17], third: 3, seventh: 10 },
  "9": { tones: [4, 7, 10, 14], third: 4, seventh: 10 },
  "13": { tones: [4, 10, 14, 21], third: 4, seventh: 10 },
  "9sus": { tones: [5, 7, 10, 14], third: 5, seventh: 10 }
} as const;

type ChordQuality = keyof typeof CHORD_QUALITIES;

const NOTE_NAMES: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export interface Chord {
  readonly name: string;
  readonly root: number;
  readonly quality: ChordQuality;
}

function isChordQuality(value: string): value is ChordQuality {
  return Object.prototype.hasOwnProperty.call(CHORD_QUALITIES, value);
}

export function parseChord(name: string): Chord {
  const match = /^([A-G])([#b]?)(.+)$/.exec(name);
  const letter = match?.[1] ?? "";
  const accidental = match?.[2] ?? "";
  const quality = match?.[3] ?? "";
  const base = NOTE_NAMES[letter];
  if (base === undefined || !isChordQuality(quality)) throw new Error("Unknown chord " + name);
  const shift = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  return { name, root: pitchClass(base + shift), quality };
}

export function chordPitchClasses(chord: Chord): number[] {
  return CHORD_QUALITIES[chord.quality].tones.map((interval) => pitchClass(chord.root + interval));
}

/**
 * Chooses the octave of each chord tone so the hands move as little as
 * possible from the previous chord and nothing gets muddy low down.
 * Four tones with one or two candidate octaves each is at most a few dozen
 * combinations, so an exhaustive search is cheaper than being clever.
 */
export function voiceChord(chord: Chord, previous: readonly number[] | null, low: number, high: number): number[] {
  const options = chordPitchClasses(chord).map((pc) => {
    const list: number[] = [];
    for (let midi = low; midi <= high; midi += 1) if (pitchClass(midi) === pc) list.push(midi);
    return list;
  });
  const centre = (low + high) / 2;
  const before = previous ? [...previous].sort((a, b) => a - b) : null;
  let best: number[] = [];
  let bestScore = Infinity;
  const visit = (index: number, chosen: number[]) => {
    if (index === options.length) {
      const sorted = [...chosen].sort((a, b) => a - b);
      const lowest = itemAt(sorted, 0);
      const highest = itemAt(sorted, -1);
      let score = 0;
      const span = highest - lowest;
      if (span > 15) score += 60 + span;
      if (span < 6) score += 12;
      for (let i = 1; i < sorted.length; i += 1) {
        const gap = itemAt(sorted, i) - itemAt(sorted, i - 1);
        if (gap === 0) score += 100;
        if (gap === 1) score += 3;
        if (gap <= 2 && itemAt(sorted, i - 1) < 60) score += 5;
      }
      if (before && before.length === sorted.length) {
        sorted.forEach((note, i) => { score += Math.abs(note - itemAt(before, i)); });
        score += Math.abs(highest - itemAt(before, -1)) * 0.5;
      } else {
        score += Math.abs((lowest + highest) / 2 - centre);
      }
      if (score < bestScore) {
        bestScore = score;
        best = sorted;
      }
      return;
    }
    for (const midi of itemAt(options, index)) visit(index + 1, [...chosen, midi]);
  };
  visit(0, []);
  return best;
}

/** The chord's root in the bass register, D2 to C#3. */
function bassRoot(chord: Chord): number {
  return 38 + pitchClass(chord.root - 2);
}

// ---------------------------------------------------------------------------
// Styles: one per game state
// ---------------------------------------------------------------------------

// Patterns are sixteen sixteenth-note steps, one character per step.
//
// Drums: "." rest, "1"-"9" a hit at that velocity (9 is loudest).
// Bass:  "R" root, "O" octave, "F" fifth, "T" third, "S" seventh,
//        "A" approach (a semitone under the next chord's root), "N" the next
//        root early; lower case is the same note played softer; "-" holds.
// Keys:  "X"/"x" the chord, loud/soft; "a" the next arpeggio note; "-" holds.
interface Groove {
  readonly kick: string;
  readonly snare: string;
  readonly hat: string;
  readonly open: string;
  readonly shaker: string;
  readonly bass: string;
  readonly keys: string;
}

type SectionKind = "intro" | "A" | "B" | "break";
type LeadTimbre = "marimba" | "pluck";

export interface MusicStyle {
  readonly state: MusicState;
  readonly bpm: number;
  /** Delay of every off-beat sixteenth, as a fraction of a sixteenth. */
  readonly swing: number;
  /** Major-pentatonic pitch classes the lead motifs are built from. */
  readonly scale: readonly number[];
  readonly progressions: readonly (readonly string[])[];
  readonly grooves: { readonly A: readonly Groove[]; readonly B: readonly Groove[]; readonly break: Groove; readonly intro: Groove };
  readonly snare: "clap" | "snare";
  readonly lead: { readonly timbre: LeadTimbre; readonly chance: number };
  /** How far pads, keys and bass dip on each kick (side-chain feel). */
  readonly pump: number;
  readonly level: number;
  readonly keysLevel: number;
  readonly padLevel: number;
  /** Electric-piano brightness (FM index) and pad filter opening. */
  readonly brightness: number;
  readonly fillChance: number;
  readonly crash: boolean;
  readonly riser: boolean;
}

const EMPTY_GROOVE: Groove = { kick: "", snare: "", hat: "", open: "", shaker: "", bass: "", keys: "" };

function groove(parts: Partial<Groove>): Groove {
  return { ...EMPTY_GROOVE, ...parts };
}

export const MUSIC_STYLES: Readonly<Record<MusicState, MusicStyle>> = {
  // Front door: mellow lo-fi in E flat, lazy swung hats, long piano chords.
  welcome: {
    state: "welcome",
    bpm: 82,
    swing: 0.22,
    scale: [3, 5, 7, 10, 0],
    progressions: [
      ["Abmaj9", "Gm9", "Fm9", "Bb13"],
      ["Ebmaj9", "Cm9", "Abmaj9", "Bb9sus"],
      ["Abmaj9", "Bb13", "Gm9", "Cm9"],
      ["Fm9", "Bb13", "Ebmaj9", "Cm11"]
    ],
    grooves: {
      A: [
        groove({ kick: "8.....5...8.....", snare: "....5.......5...", hat: "4.2.4.2.4.2.4.22", bass: "R-------R-----A-", keys: "X-------x-------" }),
        groove({ kick: "8.......8.5.....", snare: "....5.......5..2", hat: "4.2.4.224.2.4.2.", bass: "R-----r-R-------", keys: "X-----x---------" })
      ],
      B: [
        groove({ kick: "8.....5...8...4.", snare: "....5.......5...", hat: "4.3.4.3.4.3.4.3.", bass: "R-------F-----A-", keys: "X-----x-----x---" })
      ],
      break: groove({ hat: "3...3...3...3...", keys: "X---------------" }),
      intro: groove({ hat: "3.2.3.2.3.2.3.2.", keys: "X---------------" })
    },
    snare: "snare",
    lead: { timbre: "marimba", chance: 0.6 },
    pump: 0.1,
    level: 0.95,
    keysLevel: 1,
    padLevel: 0.9,
    brightness: 0.8,
    fillChance: 0.35,
    crash: false,
    riser: false
  },
  // Lobby: a chill nu-disco groove in A dorian, four on the floor but soft.
  lobby: {
    state: "lobby",
    bpm: 100,
    swing: 0.1,
    scale: [0, 2, 4, 7, 9],
    progressions: [
      ["Am9", "D9", "Gmaj9", "Cmaj9"],
      ["Fmaj9", "Em9", "Dm9", "G13"],
      ["Dm9", "G13", "Cmaj9", "Am9"],
      ["Am9", "Fmaj9", "Dm9", "E9sus"]
    ],
    grooves: {
      A: [
        groove({ kick: "8...8...8...8...", snare: "....7.......7...", hat: "32.232.232.232.2", open: "..4...4...4...4.", bass: "R..r..O...R.o.A.", keys: "..x...x...x..x.." }),
        groove({ kick: "8...8...8...8...", snare: "....7.......7..2", hat: "3..23..23..23..2", open: "..4...4...4...4.", bass: "R..R..O.R..R.O.A", keys: "..x...x...x...x." })
      ],
      B: [
        groove({ kick: "8...8...8...8...", snare: "....7.......7...", open: "..4...4...4...4.", shaker: "3232323232323232", bass: "R.O.R.O.R.O.R.O.", keys: "X-----------x---" }),
        groove({ kick: "8...8...8...8..3", snare: "....7..2....7...", open: "..4...4...4...4.", shaker: "3232323232323232", bass: "R..R..O...R.O.A.", keys: "X-----x-----x---" })
      ],
      break: groove({ shaker: "2.2.2.2.2.2.2.2.", keys: "X---------------" }),
      intro: groove({ shaker: "2.2.2.2.2.2.2.2.", keys: "X-------x-------" })
    },
    snare: "clap",
    lead: { timbre: "marimba", chance: 0.75 },
    pump: 0.32,
    level: 1,
    keysLevel: 0.95,
    padLevel: 0.8,
    brightness: 0.95,
    fillChance: 0.6,
    crash: true,
    riser: true
  },
  // Writing questions and Herd answers: light, focused, half-time study beat.
  prep: {
    state: "prep",
    bpm: 88,
    swing: 0.16,
    scale: [5, 7, 9, 0, 2],
    progressions: [
      ["Bbmaj9", "Am9", "Gm9", "C9sus"],
      ["Fmaj9", "Dm9", "Gm9", "C13"],
      ["Bbmaj9", "C9sus", "Am9", "Dm9"]
    ],
    grooves: {
      A: [
        groove({ kick: "7.......7.4.....", snare: "........5.......", hat: "3.2.3.2.3.2.3.2.", bass: "R---------------", keys: "a.a.a.a.a.a.a.a." }),
        groove({ kick: "7.....4.7.......", snare: "........5.....2.", hat: "3.2.3.2.3.2.3.22", bass: "R-------F-------", keys: "a..a..a.a..a..a." })
      ],
      B: [
        groove({ kick: "7.......7.4.....", snare: "........5.......", shaker: "2323232323232323", bass: "R-------r-----A-", keys: "a..a..a.a..a..a." })
      ],
      break: groove({ shaker: "2.2.2.2.2.2.2.2.", keys: "a.a.a.a.a.a.a.a." }),
      intro: groove({ keys: "a.a.a.a.a.a.a.a." })
    },
    snare: "snare",
    lead: { timbre: "marimba", chance: 0.3 },
    pump: 0.08,
    level: 0.85,
    keysLevel: 0.8,
    padLevel: 0.85,
    brightness: 0.7,
    fillChance: 0.25,
    crash: false,
    riser: false
  },
  // Live rounds: upbeat disco-house in G minor that sits under the game.
  live: {
    state: "live",
    bpm: 112,
    swing: 0.06,
    scale: [10, 0, 2, 5, 7],
    progressions: [
      ["Gm9", "C13", "Fmaj9", "Dm9"],
      ["Cm9", "F13", "Bbmaj9", "Gm9"],
      ["Ebmaj9", "F9sus", "Dm9", "Gm9"]
    ],
    grooves: {
      A: [
        groove({ kick: "8...8...8...8...", snare: "....7.......7...", hat: "32.232.232.232.2", open: "..4...4...4...4.", bass: "R.O.R.O.R.O.R.O.", keys: "..x...x...x...x." }),
        groove({ kick: "8...8...8...8...", snare: "....7.......7.3.", hat: "32.232.232.232.2", open: "..4...4...4...4.", bass: "R..R..O.R..R.O.A", keys: "..x...x...x..x.." })
      ],
      B: [
        groove({ kick: "8...8...8...8...", snare: "....7.......7...", open: "..4...4...4...4.", shaker: "3232323232323232", bass: "R..R..O.R..R.O.A", keys: "x..x..x...x..x.." })
      ],
      break: groove({ open: "..3...3...3...3.", shaker: "2.2.2.2.2.2.2.2.", keys: "X---------------" }),
      intro: groove({ open: "..3...3...3...3.", keys: "X-------x-------" })
    },
    snare: "clap",
    lead: { timbre: "pluck", chance: 0.35 },
    pump: 0.3,
    level: 0.8,
    keysLevel: 0.85,
    padLevel: 0.65,
    brightness: 0.9,
    fillChance: 0.5,
    crash: true,
    riser: true
  },
  // Final results: celebratory piano-house in D major.
  finale: {
    state: "finale",
    bpm: 120,
    swing: 0.05,
    scale: [2, 4, 6, 9, 11],
    progressions: [
      ["Gmaj9", "A13", "F#m9", "Bm9"],
      ["Gmaj9", "A9sus", "D6/9", "D6/9"],
      ["Em9", "A13", "Dmaj9", "Bm9"]
    ],
    grooves: {
      A: [
        groove({ kick: "9...9...9...9...", snare: "....8.......8...", hat: "32.232.232.232.2", open: "..5...5...5...5.", bass: "R.O.R.O.R.O.R.O.", keys: "X..X..X...X..X.." })
      ],
      B: [
        groove({ kick: "9...9...9...9...", snare: "....8.......8.44", open: "..5...5...5...5.", shaker: "4343434343434343", bass: "R..R..O.R..R.O.A", keys: "X..x..X...x..X.." })
      ],
      break: groove({ shaker: "3.3.3.3.3.3.3.3.", keys: "X-------X-------" }),
      intro: groove({ open: "..4...4...4...4.", keys: "X..X..X...X..X.." })
    },
    snare: "clap",
    lead: { timbre: "pluck", chance: 0.9 },
    pump: 0.35,
    level: 1,
    keysLevel: 1,
    padLevel: 0.75,
    brightness: 1.1,
    fillChance: 0.7,
    crash: true,
    riser: true
  }
};

// ---------------------------------------------------------------------------
// Composer (pure)
// ---------------------------------------------------------------------------

export type Instrument = "kick" | "snare" | "clap" | "hat" | "open" | "shaker" | "bass" | "keys" | "pad" | "lead" | "crash" | "riser";

export interface MusicEvent {
  readonly instrument: Instrument;
  /** Sixteenth step inside the bar, 0-15. */
  readonly step: number;
  /** Length in sixteenth steps. */
  readonly steps: number;
  readonly velocity: number;
  /** MIDI notes; empty for drums. */
  readonly notes: readonly number[];
  /** Humanising offset in seconds. */
  readonly nudge: number;
}

export interface BarPlan {
  readonly bar: number;
  readonly section: SectionKind;
  readonly sectionBar: number;
  readonly chord: string;
  readonly events: readonly MusicEvent[];
}

type FillKind = "roll" | "drop" | "riser" | null;

interface Section {
  readonly kind: SectionKind;
  readonly length: number;
  readonly chords: readonly Chord[];
  readonly progressionIndex: number;
  readonly groove: Groove;
  readonly motif: readonly MotifNote[] | null;
  readonly fill: FillKind;
  readonly crash: boolean;
  readonly arp: readonly number[];
}

interface MotifNote {
  /** Step across two bars, 0-31. */
  readonly step: number;
  readonly degree: number;
  readonly steps: number;
  readonly velocity: number;
}

// Two-bar rhythms for the lead, "x" marks an onset. Short, singable phrases
// with space after them, so a motif reads as a hook rather than noodling.
const MOTIF_RHYTHMS: readonly string[] = [
  "x..x..x...x.x...x.....x.x.......",
  "..x.x...x.....x...x.x...x.......",
  "x...x.x...x.....x.x.x.......x...",
  "...x..x..x..x.......x..x..x.....",
  "x.x...x.x...x.......x.x.....x...",
  "..x..x..x.x.x.......x.......x..."
];

// Arpeggio orders over a four-note voicing plus the lowest note an octave up.
const ARP_SHAPES: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 3, 2, 1],
  [0, 2, 1, 3, 2, 4, 3, 1],
  [4, 3, 2, 1, 0, 1, 2, 3],
  [0, 1, 2, 3]
];

const KEYS_LOW = 55;
const KEYS_HIGH = 76;
const LEAD_LOW = 70;
const LEAD_HIGH = 88;

function velocityOf(char: string): number {
  const digit = Number(char);
  return Number.isFinite(digit) && digit > 0 ? digit / 9 : 0;
}

/** Length of a note starting at `index`: itself plus every "-" after it. */
function heldSteps(pattern: string, index: number): number {
  let steps = 1;
  while (pattern[index + steps] === "-") steps += 1;
  return steps;
}

export class Composer {
  readonly style: MusicStyle;
  private readonly rng: Rng;
  private section: Section | null = null;
  private previousKind: SectionKind | null = null;
  private sectionsSinceBreak = 0;
  private barInSection = 0;
  private bar = 0;
  private voicing: number[] | null = null;
  private arpIndex = 0;
  private nextProgression: number;
  private readonly chordCache = new Map<string, Chord>();

  constructor(style: MusicStyle, rng: Rng) {
    this.style = style;
    this.rng = rng;
    this.nextProgression = Math.floor(rng() * style.progressions.length);
  }

  private chord(name: string): Chord {
    let chord = this.chordCache.get(name);
    if (!chord) {
      chord = parseChord(name);
      this.chordCache.set(name, chord);
    }
    return chord;
  }

  private chooseKind(): SectionKind {
    const previous = this.previousKind;
    const roll = this.rng();
    const breakAllowed = this.sectionsSinceBreak >= 2;
    if (previous === null) return "intro";
    if (previous === "intro" || previous === "break") return roll < 0.55 ? "A" : "B";
    if (previous === "A") return roll < 0.65 ? "B" : breakAllowed && roll < 0.85 ? "break" : "A";
    return roll < 0.6 ? "A" : breakAllowed && roll < 0.85 ? "break" : "B";
  }

  private startSection(): Section {
    const style = this.style;
    const rng = this.rng;
    const kind = this.chooseKind();
    const progressionIndex = this.nextProgression;
    // Pick the following section's progression now, so the last bar of this
    // one can lead into it with an approach note in the bass.
    let following = Math.floor(rng() * style.progressions.length);
    if (style.progressions.length > 1 && following === progressionIndex) following = (following + 1) % style.progressions.length;
    this.nextProgression = kind === "intro" ? progressionIndex : following;
    const length = kind === "intro" ? 2 : kind === "break" ? 4 : 8;
    const pool = kind === "A" ? style.grooves.A : kind === "B" ? style.grooves.B : null;
    const chosenGroove = pool ? pick(pool, rng) : kind === "break" ? style.grooves.break : style.grooves.intro;
    const wantsLead = kind === "B" ? rng() < style.lead.chance : kind === "break" ? rng() < style.lead.chance * 0.5 : kind === "A" ? rng() < style.lead.chance * 0.2 : false;
    let fill: FillKind = null;
    if ((kind === "A" || kind === "B") && rng() < style.fillChance) {
      const options: FillKind[] = style.riser ? ["roll", "drop", "riser"] : ["roll", "drop"];
      fill = pick(options, rng);
    } else if (kind === "break" && style.riser) {
      fill = "riser";
    }
    const crash = style.crash && (kind === "A" || kind === "B") && (this.previousKind === "break" || this.previousKind === "intro" || rng() < 0.35);
    this.previousKind = kind;
    this.sectionsSinceBreak = kind === "break" ? 0 : this.sectionsSinceBreak + 1;
    const chords = itemAt(style.progressions, progressionIndex).map((name) => this.chord(name));
    return {
      kind,
      length,
      chords,
      progressionIndex,
      groove: chosenGroove,
      motif: wantsLead ? this.makeMotif() : null,
      fill,
      crash,
      arp: pick(ARP_SHAPES, rng)
    };
  }

  private makeMotif(): MotifNote[] {
    const rng = this.rng;
    const rhythm = pick(MOTIF_RHYTHMS, rng);
    const onsets: number[] = [];
    for (let i = 0; i < rhythm.length; i += 1) if (rhythm[i] === "x") onsets.push(i);
    const table = this.leadTable();
    let degree = Math.floor(table.length * (0.3 + rng() * 0.3));
    return onsets.map((step, index) => {
      if (index > 0) {
        const move = rng() < 0.7 ? 1 : 2;
        degree += rng() < 0.5 ? -move : move;
        degree = Math.max(0, Math.min(table.length - 1, degree));
      }
      const next = onsets[index + 1];
      const steps = next === undefined ? 6 : Math.min(4, next - step);
      return { step, degree, steps, velocity: index === 0 ? 0.85 : 0.6 + rng() * 0.2 };
    });
  }

  private leadTable(): number[] {
    const table: number[] = [];
    for (let midi = LEAD_LOW; midi <= LEAD_HIGH; midi += 1) if (this.style.scale.includes(pitchClass(midi))) table.push(midi);
    return table;
  }

  /** On strong beats a lead note that clashes with the chord moves to the nearest chord tone. */
  private fitToChord(midi: number, chord: Chord, strong: boolean): number {
    if (!strong) return midi;
    const tones = new Set([...chordPitchClasses(chord), chord.root]);
    if (tones.has(pitchClass(midi))) return midi;
    for (const offset of [-1, 1, -2, 2]) if (tones.has(pitchClass(midi + offset))) return midi + offset;
    return midi;
  }

  nextBar(): BarPlan {
    if (!this.section || this.barInSection >= this.section.length) {
      this.section = this.startSection();
      this.barInSection = 0;
    }
    const section = this.section;
    const style = this.style;
    const rng = this.rng;
    const sectionBar = this.barInSection;
    const lastBar = sectionBar === section.length - 1;
    const chord = itemAt(section.chords, sectionBar);
    const nextChord = lastBar ? this.chord(itemAt(itemAt(style.progressions, this.nextProgression), 0)) : itemAt(section.chords, sectionBar + 1);
    const voicing = voiceChord(chord, this.voicing, KEYS_LOW, KEYS_HIGH);
    this.voicing = voicing;
    const events: MusicEvent[] = [];
    const g = section.groove;
    const jitter = (amount: number) => (rng() - 0.5) * 2 * amount;
    const drop = lastBar && section.fill === "drop";

    const drum = (instrument: Instrument, pattern: string, human: number) => {
      for (let step = 0; step < 16; step += 1) {
        const velocity = velocityOf(pattern[step] ?? ".");
        if (!velocity) continue;
        if (drop && step >= 12 && instrument !== "hat" && instrument !== "shaker") continue;
        events.push({ instrument, step, steps: 1, velocity: Math.min(1, velocity * (1 - human + rng() * human * 2)), notes: [], nudge: jitter(human * 0.03) });
      }
    };
    const introHats = section.kind === "intro" && sectionBar === 0;
    drum("kick", g.kick, 0.02);
    drum(style.snare, g.snare, 0.05);
    if (!introHats) drum("hat", g.hat, 0.15);
    if (!introHats) drum("open", g.open, 0.1);
    drum("shaker", g.shaker, 0.2);
    if (lastBar && section.fill === "roll") {
      [[13, 0.3], [14, 0.45], [15, 0.62]].forEach(([step, velocity]) => {
        events.push({ instrument: style.snare, step: step ?? 15, steps: 1, velocity: velocity ?? 0.5, notes: [], nudge: 0 });
      });
    }
    if (lastBar && section.fill === "riser") events.push({ instrument: "riser", step: 0, steps: 16, velocity: 0.8, notes: [], nudge: 0 });
    if (sectionBar === 0 && section.crash) events.push({ instrument: "crash", step: 0, steps: 16, velocity: 0.7, notes: [], nudge: 0 });

    // Bass
    const root = bassRoot(chord);
    const quality = CHORD_QUALITIES[chord.quality];
    const nextRoot = bassRoot(nextChord);
    const approach = nextRoot - 1 < 36 ? nextRoot + 11 : nextRoot - 1;
    for (let step = 0; step < 16; step += 1) {
      const symbol = g.bass[step] ?? ".";
      if (symbol === "." || symbol === "-") continue;
      if (drop && step >= 12) continue;
      const upper = symbol.toUpperCase();
      const note = upper === "R" ? root :
        upper === "O" ? root + 12 :
        upper === "F" ? root + 7 :
        upper === "T" ? root + quality.third :
        upper === "S" ? root + quality.seventh :
        upper === "A" ? approach :
        upper === "N" ? nextRoot : root;
      events.push({ instrument: "bass", step, steps: heldSteps(g.bass, step), velocity: symbol === upper ? 0.9 : 0.6, notes: [note], nudge: 0 });
    }

    // Keys: chords or arpeggios
    const arpNotes = [...voicing, itemAt(voicing, 0) + 12];
    for (let step = 0; step < 16; step += 1) {
      const symbol = g.keys[step] ?? ".";
      if (symbol === "X" || symbol === "x") {
        events.push({ instrument: "keys", step, steps: heldSteps(g.keys, step), velocity: symbol === "X" ? 0.85 : 0.62, notes: voicing, nudge: jitter(0.006) });
      } else if (symbol === "a") {
        const note = itemAt(arpNotes, itemAt(section.arp, this.arpIndex));
        this.arpIndex += 1;
        const accent = step % 4 === 0 ? 0.72 : 0.55;
        events.push({ instrument: "keys", step, steps: Math.max(2, heldSteps(g.keys, step)), velocity: accent * (0.9 + rng() * 0.2), notes: [note], nudge: jitter(0.005) });
      }
    }

    // Pad: the whole bar, a little longer so chords overlap instead of gapping.
    events.push({ instrument: "pad", step: 0, steps: 16, velocity: 0.8, notes: voicing, nudge: 0 });

    // Lead motif: bars 0-1 state it, bars 4-5 answer it with a variation.
    if (section.motif) {
      const phraseBar = sectionBar % 4;
      const answer = sectionBar >= 4;
      if (phraseBar < 2) {
        const table = this.leadTable();
        const offset = phraseBar * 16;
        const count = section.motif.length;
        section.motif.forEach((note, index) => {
          if (note.step < offset || note.step >= offset + 16) return;
          const lift = answer && index >= count - 2 ? (index === count - 1 ? -2 : 1) : 0;
          const degree = Math.max(0, Math.min(table.length - 1, note.degree + lift));
          const step = note.step - offset;
          const midi = this.fitToChord(itemAt(table, degree), chord, step % 4 === 0);
          events.push({ instrument: "lead", step, steps: note.steps, velocity: note.velocity, notes: [midi], nudge: jitter(0.004) });
        });
      }
    }

    events.sort((a, b) => a.step - b.step);
    const plan: BarPlan = { bar: this.bar, section: section.kind, sectionBar, chord: chord.name, events };
    this.bar += 1;
    this.barInSection += 1;
    return plan;
  }
}

/** Seconds from the start of a bar to a step, with swing on the off-beats. */
export function stepOffset(step: number, stepSeconds: number, swing: number): number {
  return step * stepSeconds + (step % 2 === 1 ? swing * stepSeconds : 0);
}

// ---------------------------------------------------------------------------
// Player (Web Audio)
// ---------------------------------------------------------------------------

export interface MusicPlayerOptions {
  readonly seed?: number;
  /** Output level of the whole music bus. */
  readonly level?: number;
  /** Used to disconnect finished songs; offline renders can omit it. */
  readonly setTimeout?: (handler: () => void, ms: number) => unknown;
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

  constructor(ctx: BaseAudioContext, player: { input: AudioNode; reverb: AudioNode; delay: AudioNode }, state: MusicState, startTime: number, seed: number, fadeIn: number) {
    this.ctx = ctx;
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
    this.clapFilter = filter(ctx, "bandpass", 1250, 0.9);
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
    const duration = event.steps * this.stepSeconds;
    switch (event.instrument) {
      case "kick": this.kick(time, event.velocity); break;
      case "snare": this.snare(time, event.velocity); break;
      case "clap": this.clap(time, event.velocity); break;
      case "hat": this.noiseHit(this.hatFilter, time, 0.08, 0.12 * event.velocity, 0.001, 0.014); break;
      case "open": this.noiseHit(this.hatFilter, time, 0.45, 0.075 * event.velocity, 0.002, 0.075); break;
      case "shaker": this.noiseHit(this.shakerFilter, time, 0.12, 0.09 * event.velocity, 0.012, 0.022); break;
      case "crash": this.noiseHit(this.crashFilter, time, 2.6, 0.08 * event.velocity, 0.003, 0.55); break;
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
    source.buffer = sharedNoiseBuffer(ctx);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(peak, time + attack);
    envelope.gain.setTargetAtTime(0, time + attack, decay);
    source.connect(envelope).connect(destination);
    source.start(time, this.rng() * (1.5 - seconds - 0.01), seconds);
  }

  private kick(time: number, velocity: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const envelope = ctx.createGain();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(54, time + 0.08);
    osc.frequency.exponentialRampToValueAtTime(44, time + 0.3);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(0.9 * velocity, time + 0.003);
    envelope.gain.setTargetAtTime(0, time + 0.03, 0.085);
    osc.connect(envelope).connect(this.drums);
    osc.start(time);
    osc.stop(time + 0.55);
    this.noiseHit(this.clickFilter, time, 0.02, 0.1 * velocity, 0.0008, 0.004);
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
    this.noiseHit(this.snareFilter, time, 0.35, 0.34 * velocity, 0.001, 0.06);
    this.body(time, 200, 168, 0.2 * velocity, 0.045);
  }

  private clap(time: number, velocity: number): void {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = sharedNoiseBuffer(ctx);
    const envelope = ctx.createGain();
    const peak = 0.42 * velocity;
    envelope.gain.setValueAtTime(0, time);
    // Three quick slaps then a short tail: what makes a clap read as hands.
    [0, 0.011, 0.023].forEach((offset, index) => {
      envelope.gain.setValueAtTime(peak * (index === 2 ? 1 : 0.75), time + offset);
      envelope.gain.setTargetAtTime(peak * 0.12, time + offset + 0.001, 0.0035);
    });
    envelope.gain.setValueAtTime(peak * 0.6, time + 0.034);
    envelope.gain.setTargetAtTime(0, time + 0.035, 0.05);
    source.connect(envelope).connect(this.clapFilter);
    source.start(time, this.rng() * 1.1, 0.34);
    this.body(time, 210, 180, 0.08 * velocity, 0.03);
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
    envelope.gain.linearRampToValueAtTime(0.5 * velocity, time + 0.006);
    envelope.gain.setTargetAtTime(0.38 * velocity, time + 0.01, 0.25);
    envelope.gain.setTargetAtTime(0, end, 0.03);
    envelope.connect(this.pump);
    // A pure sine for the weight, and a filtered saw so phone speakers, which
    // cannot reproduce the fundamental, still hear the bass line.
    const sub = ctx.createOscillator();
    sub.frequency.value = frequency;
    const subLevel = gain(ctx, 0.62);
    sub.connect(subLevel).connect(envelope);
    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = frequency;
    const tone = filter(ctx, "lowpass", 900, 2.5);
    tone.frequency.setValueAtTime(700 + 800 * velocity, time);
    tone.frequency.setTargetAtTime(240, time + 0.005, 0.07);
    const sawLevel = gain(ctx, 0.32);
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
    const level = 0.1 * this.style.keysLevel * velocity / Math.sqrt(Math.max(1, notes.length / 2));
    const brightness = this.style.brightness * (0.75 + 0.6 * velocity);
    for (const midi of notes) {
      const frequency = midiToHz(midi) * Math.pow(2, (this.rng() - 0.5) * 0.004);
      const carrier = ctx.createOscillator();
      carrier.frequency.value = frequency;
      const modulator = ctx.createOscillator();
      modulator.frequency.value = frequency;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(frequency * 1.3 * brightness, time);
      depth.gain.setTargetAtTime(frequency * 0.16 * brightness, time, 0.2);
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
    const level = 0.03 * this.style.padLevel * velocity;
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
    if (this.leadPan.pan) this.leadPan.pan.setValueAtTime(0.22 * this.leadSide, time);
    if (this.style.lead.timbre === "marimba") {
      // A marimba bar: the fundamental plus its bright fourth partial, which
      // dies away almost at once.
      const partials: [number, number, number][] = [[1, 0.15, 0.32], [3.93, 0.045, 0.03]];
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
    envelope.gain.linearRampToValueAtTime(0.07 * velocity, time + 0.004);
    envelope.gain.setTargetAtTime(0.025 * velocity, time + 0.006, 0.18);
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

  constructor(ctx: BaseAudioContext, destination: AudioNode, options: MusicPlayerOptions = {}) {
    this.ctx = ctx;
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
    this.output = gain(ctx, options.level ?? 0.3);
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
