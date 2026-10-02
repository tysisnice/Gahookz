import assert from "node:assert/strict";
import test from "node:test";

import {
  Composer,
  MUSIC_STATES,
  MUSIC_STYLES,
  type BarPlan,
  chordPitchClasses,
  createRng,
  isMusicState,
  midiToHz,
  parseChord,
  stepOffset,
  voiceChord
} from "./music-composer.ts";

function bars(state: (typeof MUSIC_STATES)[number], count: number, seed = 1234): BarPlan[] {
  const composer = new Composer(MUSIC_STYLES[state], createRng(seed));
  return Array.from({ length: count }, () => composer.nextBar());
}

test("every style names real chords and well-formed sixteen-step patterns", () => {
  for (const state of MUSIC_STATES) {
    const style = MUSIC_STYLES[state];
    assert.equal(style.state, state);
    assert.ok(style.bpm >= 70 && style.bpm <= 128, state + " tempo should stay in a chill party range");
    for (const progression of style.progressions) for (const name of progression) assert.doesNotThrow(() => parseChord(name), name);
    const grooves = [...style.grooves.A, ...style.grooves.B, style.grooves.break, style.grooves.intro];
    for (const groove of grooves) {
      for (const [part, pattern] of Object.entries(groove)) {
        assert.ok(pattern === "" || pattern.length === 16, `${state} ${part} pattern "${pattern}" must be 16 steps`);
        const allowed = part === "bass" ? /^[ROFTSANrofsan.-]*$/ : part === "keys" ? /^[Xxa.-]*$/ : /^[1-9.]*$/;
        assert.match(pattern, allowed, `${state} ${part} uses an unknown symbol`);
      }
    }
  }
  assert.ok(isMusicState("lobby") && !isMusicState("off") && !isMusicState(undefined));
});

test("chords parse to the expected colours", () => {
  assert.deepEqual(parseChord("Cmaj9"), { name: "Cmaj9", root: 0, quality: "maj9" });
  assert.deepEqual(chordPitchClasses(parseChord("Cmaj9")).sort((a, b) => a - b), [2, 4, 7, 11]);
  assert.equal(parseChord("F#m9").root, 6);
  assert.equal(parseChord("Bb13").root, 10);
  assert.throws(() => parseChord("H7"));
  assert.throws(() => parseChord("Cdim"));
  assert.ok(Math.abs(midiToHz(69) - 440) < 1e-9);
  assert.ok(Math.abs(midiToHz(57) - 220) < 1e-9);
});

test("voicings stay in the keys register and move smoothly", () => {
  const progression = ["Am9", "D9", "Gmaj9", "Cmaj9", "Fmaj9", "Em9", "Dm9", "G13"].map(parseChord);
  let previous: number[] | null = null;
  for (const chord of progression) {
    const voicing = voiceChord(chord, previous, 55, 76);
    assert.equal(voicing.length, 4);
    assert.equal(new Set(voicing).size, 4, "no doubled notes");
    for (const note of voicing) assert.ok(note >= 55 && note <= 76, "note " + note + " outside the register");
    assert.deepEqual(voicing.map((note) => note % 12).sort((a, b) => a - b), chordPitchClasses(chord).sort((a, b) => a - b));
    if (previous) {
      const movement = voicing.reduce((sum, note, index) => sum + Math.abs(note - (previous?.[index] ?? note)), 0);
      assert.ok(movement <= 12, `${chord.name} moved ${movement} semitones from the previous chord`);
    }
    previous = voicing;
  }
});

test("the composer is deterministic for a seed and varies with it", () => {
  const a = JSON.stringify(bars("lobby", 48, 7));
  const b = JSON.stringify(bars("lobby", 48, 7));
  const c = JSON.stringify(bars("lobby", 48, 8));
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("every event is playable", () => {
  for (const state of MUSIC_STATES) {
    for (const plan of bars(state, 160, 99)) {
      assert.ok(plan.events.length > 0, "every bar has at least a pad");
      for (const event of plan.events) {
        assert.ok(Number.isInteger(event.step) && event.step >= 0 && event.step < 16, "step");
        assert.ok(event.steps > 0 && event.steps <= 16, "length");
        assert.ok(event.velocity > 0 && event.velocity <= 1, `${state} ${event.instrument} velocity ${event.velocity}`);
        assert.ok(Math.abs(event.nudge) < 0.02, "humanising stays subtle");
        for (const note of event.notes) assert.ok(Number.isFinite(note) && note >= 30 && note <= 96, `${event.instrument} note ${note}`);
        if (["bass", "keys", "pad", "lead"].includes(event.instrument)) assert.ok(event.notes.length > 0, event.instrument + " needs notes");
      }
    }
  }
});

test("a song opens with a short intro and then moves between sections", () => {
  for (const state of MUSIC_STATES) {
    const plans = bars(state, 200, 31);
    assert.equal(plans[0]?.section, "intro");
    assert.equal(plans[1]?.section, "intro");
    assert.notEqual(plans[2]?.section, "intro");
    const kinds = new Set(plans.map((plan) => plan.section));
    assert.ok(kinds.has("A") && kinds.has("B") && kinds.has("break"), `${state} should reach A, B and break sections, got ${[...kinds].join(",")}`);
    const chords = new Set(plans.map((plan) => plan.chord));
    assert.ok(chords.size >= 6, `${state} should use several chords, got ${chords.size}`);
  }
});

test("the lobby does not loop the same bar for minutes", () => {
  // 120 bars of the lobby groove is about five minutes at 100 bpm.
  const plans = bars("lobby", 120, 5);
  const signatures = new Set(plans.map((plan) => plan.chord + ":" + plan.events.map((event) => event.instrument + event.step + ":" + event.notes.join(".")).join("|")));
  assert.ok(signatures.size >= 40, `only ${signatures.size} distinct bars in five minutes`);
  assert.ok(plans.some((plan) => plan.events.some((event) => event.instrument === "lead")), "a lead motif should appear");
  assert.ok(plans.some((plan) => plan.events.some((event) => event.instrument === "riser" || event.instrument === "crash")), "sections should be marked by fills");
});

test("lead notes on the beat belong to the chord underneath", () => {
  for (const state of MUSIC_STATES) {
    for (const plan of bars(state, 200, 11)) {
      const chord = parseChord(plan.chord);
      const tones = new Set([...chordPitchClasses(chord), chord.root]);
      for (const event of plan.events) {
        if (event.instrument !== "lead" || event.step % 4 !== 0) continue;
        const note = event.notes[0] ?? 0;
        assert.ok(tones.has(note % 12), `${state}: ${note} on beat ${event.step / 4 + 1} clashes with ${plan.chord}`);
      }
    }
  }
});

test("swing delays only the off-beat sixteenths and keeps order", () => {
  const stepSeconds = 0.15;
  let last = -1;
  for (let step = 0; step < 16; step += 1) {
    const time = stepOffset(step, stepSeconds, 0.3);
    assert.ok(time > last);
    last = time;
    if (step % 2 === 0) assert.ok(Math.abs(time - step * stepSeconds) < 1e-12);
  }
});
