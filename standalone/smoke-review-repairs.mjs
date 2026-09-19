import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = process.env.GAHOOKZ_BASE_URL || 'http://127.0.0.1:3199';
assert.equal(base, 'http://127.0.0.1:3199');
let code;
const host = randomUUID();
const keys = [randomUUID(), randomUUID()];
async function post(route, body = {}) {
  const response = await fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, playerKey: host, ...body }) });
  assert.notEqual(response.status, 500, route + ' must not throw');
  return response.json();
}
const ok = async (route, body) => { const result = await post(route, body); assert.equal(result.ok, true, route + ': ' + result.error); return result; };
const state = (key = host) => post('/api/state', { playerKey: key, role: key === host ? 'host' : 'player' });
code = (await ok('/api/room', { password: 'synthetic-test-password' })).code;
for (const [index, playerKey] of keys.entries()) await ok('/api/player/join', { playerKey, password: 'synthetic-test-password', name: 'Repair ' + index });
const publicId = (await state()).players[0].id;
assert.equal((await post('/api/question/suggest', { playerKey: 'forged', playerId: publicId })).ok, false);
assert.equal((await post('/api/question/suggest', { playerKey: keys[0] })).ok, false, 'lobby suggestions are locked');
await ok('/api/host/settings', { roundPreset: 'quick' });
await ok('/api/host/lock-setup');
assert.equal((await post('/api/question/suggest', { playerKey: 'forged', playerId: publicId })).ok, false);
for (const playerKey of keys) await ok('/api/question', { playerKey, text: 'Which option is intended?', answers: [{ text: 'First', correct: true }, { text: 'Second' }] });
await ok('/api/host/reset');
await ok('/api/host/settings', { gameMode: 'majority' });
await ok('/api/host/lock-setup');
await ok('/api/host/force-start');
assert.equal((await state()).currentQuestion.mode, 'majority');
assert.equal((await post('/api/question/suggest', { playerKey: keys[0] })).ok, false, 'live suggestions are locked');
for (const phase of ['reading', 'answering', 'reveal']) {
  assert.equal((await state()).phase, phase);
  await ok('/api/host/pause', { paused: true });
  assert.equal((await state()).paused, true);
  await ok('/api/host/pause', { paused: false });
  assert.equal((await state()).paused, false);
  if (phase === 'answering') {
    const vote = await ok('/api/answer', { playerKey: keys[0], answerId: 'blue' });
    assert.equal(vote.pendingResult, true, 'Majority must defer scoring');
    assert.equal((await state()).players.find((p) => p.id === publicId).score, 0);
  }
  if (phase !== 'reveal') await ok('/api/host/skip');
  if (phase === 'answering') {
    const reveal = await state();
    assert.equal(reveal.currentQuestion.correctAnswerId, 'blue');
    assert.ok(reveal.players.find((p) => p.id === publicId).score > 0);
  }
}
// Reset keeps unplayed questions; return to Classic scores their original key.
await ok('/api/host/reset');
await ok('/api/host/settings', { gameMode: 'quiz' });
await ok('/api/host/lock-setup');
await ok('/api/host/force-start');
// Force-start fills the played author's empty slot, then shuffles the rounds.
// Find the retained fixture instead of assuming it precedes generated content.
for (let round = 0; round < 2 && (await state()).currentQuestion.text !== 'Which option is intended?'; round++) {
  await ok('/api/host/skip'); await ok('/api/host/skip'); await ok('/api/host/skip');
}
assert.equal((await state()).currentQuestion.text, 'Which option is intended?', 'unplayed authored question survives the scoring round-trip');
await ok('/api/host/skip');
const classic = await ok('/api/answer', { playerKey: keys[0], answerId: 'red' });
assert.equal(classic.correct, true);
assert.ok(classic.points > 0);
// Unkeyed Majority opinions must remain editable and cannot be autofilled away.
await ok('/api/host/reset');
await ok('/api/host/settings', { gameMode: 'majority' });
await ok('/api/host/lock-setup');
const own = await state(keys[0]);
for (const q of own.ownQuestions || []) await ok('/api/host/remove-content', { kind: 'question', targetId: q.id });
await ok('/api/question', { playerKey: keys[0], text: 'A fresh opinion with no key?', answers: [{ text: 'First' }, { text: 'Second' }], __factCheck: { answerText: 'Injected', explanation: 'Forged' }, templateId: 'EDU-NEW-01' });
await ok('/api/host/reset');
await ok('/api/host/settings', { gameMode: 'quiz' });
await ok('/api/host/lock-setup');
const opinion = (await state(keys[0])).ownQuestions.find((q) => q.text.startsWith('A fresh'));
assert.ok(opinion.needsIntendedAnswer);
assert.equal((await post('/api/host/force-start')).ok, false);
await ok('/api/question/edit', { playerKey: keys[0], questionId: opinion.id, text: opinion.text, answers: [{ text: 'First' }, { text: 'Second', correct: true }] });
await ok('/api/host/force-start');
console.log('Review repairs HTTP: authorization, all timed pause/resume phases, both scoring directions, missing Classic key, and edit passed.');

// Real waiting-for-progress branch, reached by its timer rather than a helper.
let waiting;
for (let tries = 0; tries < 100; tries++) {
  waiting = await state();
  if (waiting.phaseWaitingForProgress) break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.ok(waiting.phaseWaitingForProgress, 'real phase deadline must reach progress waiting');
await ok('/api/host/pause', { paused: true });
await ok('/api/host/pause', { paused: false });
assert.equal((await state()).phase, waiting.phase);
console.log('Review repairs HTTP: pause/resume while waiting for player progress passed.');

// Current endpoints must match contracts; malformed settings leave all fields unchanged.
const { HealthResponseSchema, HostSettingsResponseSchema } = await import('../packages/contracts/src/index.ts');
assert.equal(HealthResponseSchema.safeParse(await fetch(base + '/api/health').then((r) => r.json())).success, true);
await ok('/api/host/reset');
const prior = await state();
assert.equal((await post('/api/host/settings', { promptStyle: 'education', gahookEffects: 'invalid' })).ok, false);
const after = await state();
assert.equal(after.settingsRevision, prior.settingsRevision);
assert.equal(after.promptStyle, prior.promptStyle);
const settings = await ok('/api/host/settings', { promptStyle: 'educational', allowCustomProfilePictures: false, gameMode: 'majority' });
assert.equal(HostSettingsResponseSchema.safeParse(settings).success, true);
assert.equal((await state()).promptStyle, 'education');
assert.equal((await state()).allowCustomProfiles, false);
await ok('/api/host/lock-setup');
// Unchanged server-owned educational draft gets a Fact check; template-ID forgery does not.
const suggestion = (await ok('/api/question/suggest', { playerKey: keys[0] })).suggestion;
for (const q of (await state(keys[0])).ownQuestions) await ok('/api/host/remove-content', { kind: 'question', targetId: q.id });
await ok('/api/question', { playerKey: keys[0], instanceId: suggestion.instanceId, text: suggestion.text, answers: suggestion.options.map((o) => ({ text: o.text })) });
for (const q of (await state(keys[1])).ownQuestions) await ok('/api/host/remove-content', { kind: 'question', targetId: q.id });
await ok('/api/question', { playerKey: keys[1], text: 'Forged educational content?', templateId: suggestion.templateId, instanceId: suggestion.instanceId, __factCheck: { answerText: 'Injected' }, answers: [{ text: 'One' }, { text: 'Two' }] });
await ok('/api/host/force-start');
for (let round = 0; round < 2; round++) {
  await ok('/api/host/skip'); await ok('/api/host/skip');
  const q = (await state()).currentQuestion;
  if (q.text === suggestion.text) assert.ok(q.majorityResults?.factCheck?.answerText);
  else assert.equal(q.majorityResults?.factCheck, null);
  if (round === 0) await ok('/api/host/skip');
}
await ok('/api/host/reset');
await ok('/api/host/settings', { gameFamily: 'herd' });
await ok('/api/host/kick', { playerId: publicId });
assert.equal((await post('/api/question/suggest', { playerKey: keys[0], playerId: publicId })).ok, false);
console.log('Review repairs HTTP: live contracts, atomic rejection, aliases, draft ownership, factual metadata, and banned actor passed.');
