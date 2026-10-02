// Gahookz background music, part one: the composer.
//
// Pure TypeScript with no Web Audio, so node:test can check the music itself:
// that every chord parses, voicings move smoothly, lead notes fit the chord,
// sections vary, and the same seed always writes the same song. The player
// that turns these bars into sound is client/music.ts.
//
// A style (one per game state) is a tempo, a swing amount, a handful of chord
// progressions and some sixteen-step groove patterns. The composer strings
// them into sections (a two-bar intro, eight-bar A and B sections, four-bar
// breaks) and adds fills, crashes, risers and short lead motifs, choosing
// with a seeded random generator so no two sessions play the same song.

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
