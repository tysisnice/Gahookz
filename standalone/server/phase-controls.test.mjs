import test from 'node:test';
import assert from 'node:assert/strict';
import { PAUSABLE_PHASES, SKIPPABLE_PHASES, pauseDecision, skipDecision } from './phase-controls.mjs';

// Every phase a room can actually be in. Kept literal on purpose: if a new
// phase is added to server.js and not considered here, this file is where the
// omission should be noticed.
const ALL_PHASES = ['lobby', 'building', 'herd-writing', 'reading', 'answering', 'reveal', 'finished'];

test('skip advances each live phase to its real successor', () => {
  assert.deepEqual(skipDecision('reading'), { ok: true, action: 'begin-answering' });
  assert.deepEqual(skipDecision('answering'), { ok: true, action: 'reveal' });
  assert.deepEqual(skipDecision('reveal'), { ok: true, action: 'next-question' });
});

test('skip ends the Herd writing phase instead of silently doing nothing', () => {
  // The defect: herd-writing matched no branch, so the host pressed Skip and
  // the room answered ok while staying exactly where it was.
  const decision = skipDecision('herd-writing');
  assert.equal(decision.ok, true);
  assert.equal(decision.action, 'force-start');
  assert.deepEqual(skipDecision('building'), { ok: true, action: 'force-start' });
});

test('skip refuses phases with nothing after them, and says so', () => {
  for (const phase of ['lobby', 'finished']) {
    const decision = skipDecision(phase);
    assert.equal(decision.ok, false, phase + ' should not be skippable');
    assert.equal(decision.action, 'none');
    assert.match(decision.error, /\S/);
  }
});

test('every phase gets a skip answer, and the exported list matches it', () => {
  const skippable = ALL_PHASES.filter((phase) => skipDecision(phase).ok);
  assert.deepEqual([...SKIPPABLE_PHASES].sort(), skippable.sort());
});

test('pause is allowed in exactly the phases that run a countdown', () => {
  for (const phase of PAUSABLE_PHASES) {
    assert.deepEqual(pauseDecision(phase), { ok: true }, phase + ' runs a timer');
  }
  const pausable = ALL_PHASES.filter((phase) => pauseDecision(phase).ok);
  assert.deepEqual(pausable.sort(), [...PAUSABLE_PHASES].sort());
});

test('a refused pause explains the phase the host is actually looking at', () => {
  // A Herd host waiting on answer writing was told to wait for "a question",
  // which is not what is on their screen.
  assert.match(pauseDecision('herd-writing').error, /Skip/);
  assert.match(pauseDecision('building').error, /Skip/);
  assert.match(pauseDecision('lobby').error, /paused during a question/);
});
