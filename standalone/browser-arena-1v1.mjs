// Real-browser verification for ARENA-1V1-PLAN.md.
//
// "Feel is the acceptance criterion", so a green unit test is not enough: this
// plays an actual duel in two separate browser contexts (tabs in one profile
// share a device credential, which would make them the same player) and checks
// the things a player would notice -- the Gahooked button animation, the
// escalating presses near the win, the mini Gahooks, and whether the Gahook
// button renders the character properly.
//
// Never point this at production or beta: it creates and mutates real rooms.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const base = process.env.GAHOOKZ_BASE_URL || 'http://127.0.0.1:3199';
assert.equal(base, 'http://127.0.0.1:3199', 'arena checks only run against the disposable server');

const out = 'docs/verification/2026-09-19-arena-1v1';
const errors = [];
const checked = [];
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function post(code, path, body = {}) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, ...body })
  });
  return { status: response.status, data: await response.json() };
}

async function pageFor(key, code) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 900, height: 900 });
  page.on('pageerror', error => errors.push(`${key}: ${error.message}`));
  await page.evaluateOnNewDocument(clientKey => {
    localStorage.setItem('gahookz-client-key', clientKey);
    for (const mode of ['quiz', 'herd', 'majority', 'host']) localStorage.setItem('gahookz-how-to-play-seen-v2-' + mode, '1');
  }, key);
  await page.goto(base + '/' + code);
  await page.waitForSelector('.player-card');
  return page;
}

// The duel as the server sees it. DOM is checked separately; scoring is read
// from the authority so a client-side projection bug cannot fake a pass.
async function duelState(code, key) {
  const { data } = await post(code, '/api/state', { playerKey: key, role: 'player' });
  return data.gahookDuel;
}

try {
  const code = 'ARNA';
  const hostKey = code + '-host';
  const aKey = code + '-a';
  const bKey = code + '-b';
  await post(code, '/api/room', { playerKey: hostKey, intent: 'host' });
  // The Classic Monkey is the default form and the character item 6 names.
  await post(code, '/api/player/join', { playerKey: aKey, name: 'Ada', avatarId: 'fox' });
  await post(code, '/api/player/join', { playerKey: bKey, name: 'Bo', avatarId: 'owl' });
  // Player ids come from the room, not the join reply, so they are read back
  // by name rather than assumed from a response shape.
  const roster = (await post(code, '/api/state', { playerKey: hostKey, role: 'host' })).data.players || [];
  const aId = roster.find(player => player.name === 'Ada')?.id;
  const bId = roster.find(player => player.name === 'Bo')?.id;
  assert(aId && bId, 'both players should have joined, saw ' + JSON.stringify(roster.map(p => p.name)));

  const pageA = await pageFor(aKey, code);
  const pageB = await pageFor(bKey, code);

  // -------------------------------------------------------------------
  // Item 4 - challenge from the player banner menu
  // -------------------------------------------------------------------
  const bannerChallenge = await pageA.evaluate(() => {
    const buttons = [...document.querySelectorAll('.player-card button')];
    return buttons.some(button => button.textContent.includes('Challenge to 1v1'));
  });
  assert.equal(bannerChallenge, true, 'a player banner should offer Challenge to 1v1');
  checked.push('item 4: player banners offer "Challenge to 1v1"');

  // Start the duel through the documented endpoints and accept it.
  const challenge = await post(code, '/api/player/duel-challenge', { playerKey: aKey, playerId: bId });
  assert.equal(challenge.data.ok, true, JSON.stringify(challenge.data));
  const accept = await post(code, '/api/player/duel-accept', { playerKey: bKey, duelId: challenge.data.duelId });
  assert.equal(accept.data.ok, true, JSON.stringify(accept.data));

  // Wait out the GO countdown, then both overlays should be live.
  await pageA.waitForSelector('.arena-overlay', { timeout: 15000 });
  await pageB.waitForSelector('.arena-overlay', { timeout: 15000 });
  await pageA.waitForSelector('.arena-target', { timeout: 15000 });
  await pageB.waitForSelector('.arena-target', { timeout: 15000 });
  checked.push('a duel opened in two separate browser contexts and both players got a tap target');

  // -------------------------------------------------------------------
  // Item 6 - the Gahook button renders every character, monkey included
  // -------------------------------------------------------------------
  const buttonArt = await pageA.evaluate(() => {
    const host = document.querySelector('.arena-target > span');
    const art = host.querySelector('.poke-monkey, .poke-animal, .custom-gahook-visual');
    if (!art) return null;
    const hostBox = host.getBoundingClientRect();
    const artBox = art.getBoundingClientRect();
    return {
      className: art.getAttribute('class'),
      artWidth: Math.round(artBox.width),
      artHeight: Math.round(artBox.height),
      hostWidth: Math.round(hostBox.width),
      overflows: artBox.width > hostBox.width + 1 || artBox.height > hostBox.height + 1
    };
  });
  assert.notEqual(buttonArt, null, 'the Gahook button should render a character');
  assert(buttonArt.className.includes('poke-monkey'), `expected the default Classic Monkey in the button, saw ${buttonArt.className}`);
  assert.equal(buttonArt.overflows, false, `the ${buttonArt.className} overflows its ${buttonArt.hostWidth}px button window at ${buttonArt.artWidth}x${buttonArt.artHeight}`);
  checked.push(`item 6: the Classic Monkey renders at ${buttonArt.artWidth}x${buttonArt.artHeight} inside its ${buttonArt.hostWidth}px button window instead of overflowing it`);

  // The challenge Bo accepted was itself announced with a full-screen overlay,
  // and it may still be fading. The requirement for item 3 is that a *press*
  // adds no full-screen overlay, so the pre-existing count is the baseline.
  const baselineOverlays = await pageB.$$eval('.poke-overlay', nodes => nodes.length);

  // -------------------------------------------------------------------
  // Item 1 - a Gahooked button animation that does not wait for the server
  // -------------------------------------------------------------------
  const ghost = await pageA.evaluate(async () => {
    const button = document.querySelector('.arena-target');
    const before = document.querySelectorAll('.arena-target-ghost').length;
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, isPrimary: true }));
    // Read on the very next frame: this must be optimistic, not a round trip.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const node = document.querySelector('.arena-target-ghost');
    return {
      before,
      appeared: Boolean(node),
      animation: node ? getComputedStyle(node).animationName : '',
      durationMs: node ? Math.round(parseFloat(getComputedStyle(node).animationDuration) * 1000) : 0,
      inert: node ? getComputedStyle(node).pointerEvents === 'none' : false,
      hidden: node ? node.getAttribute('aria-hidden') === 'true' : false
    };
  });
  assert.equal(ghost.appeared, true, 'pressing the Gahook button should leave a Gahooked button behind immediately');
  assert.equal(ghost.durationMs, 200, `the tap animation should be 0.2s, saw ${ghost.durationMs}ms`);
  assert.equal(ghost.inert, true, 'the Gahooked button must not intercept the next tap');
  assert.equal(ghost.hidden, true, 'the Gahooked button is decorative and should be aria-hidden');
  checked.push(`item 1: a ${ghost.durationMs}ms Gahooked-button animation fires within one frame of the press, inert and aria-hidden`);

  // -------------------------------------------------------------------
  // Item 3 - each press lands on the opponent as a mini Gahook
  // -------------------------------------------------------------------
  // A tapped by Ada above; Bo should have received the small treatment rather
  // than a full-screen jump scare, which mid-duel would blank out the arena.
  await pageB.waitForSelector('.arena-mini-gahook', { timeout: 6000 });
  const mini = await pageB.evaluate(() => {
    const cards = [...document.querySelectorAll('.arena-mini-gahook')];
    const layer = document.querySelector('.arena-mini-layer');
    return {
      count: cards.length,
      inert: layer ? getComputedStyle(layer).pointerEvents === 'none' : false,
      hidden: layer ? layer.getAttribute('aria-hidden') === 'true' : false,
      // The full-screen treatment must NOT be what arrived.
      fullScreen: document.querySelectorAll('.poke-overlay').length,
      arenaStillUsable: Boolean(document.querySelector('.arena-target'))
    };
  });
  assert(mini.count >= 1, 'the opponent should receive a mini Gahook when a press lands');
  assert(mini.fullScreen <= baselineOverlays, `a press must not add a full-screen Gahook overlay during a duel (baseline ${baselineOverlays}, now ${mini.fullScreen})`);
  assert.equal(mini.inert, true, 'mini Gahooks must not intercept taps');
  assert.equal(mini.hidden, true, 'mini Gahooks are decorative and should be aria-hidden');
  assert.equal(mini.arenaStillUsable, true, 'the opponent should still have a tap target while being mini Gahooked');
  checked.push('item 3: an opponent press lands as an inert mini Gahook, not a full-screen overlay, and the arena stays playable');

  // Volume control: these fire on every press, so they must expire rather than
  // accumulate. Tap several times quickly and confirm the layer stays small.
  for (let index = 0; index < 6; index += 1) {
    await pageA.evaluate(() => {
      const button = document.querySelector('.arena-target');
      if (button) button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, isPrimary: true }));
    });
    await wait(60);
  }
  await wait(400);
  const capped = await pageB.$$eval('.arena-mini-gahook', nodes => nodes.length);
  assert(capped <= 3, `mini Gahooks must stay capped during a storm of presses, saw ${capped}`);
  checked.push(`item 3: six rapid presses left at most ${capped} mini Gahooks on screen, not one per press`);

  // It must also clear itself, or it would pile up over a 45 second match.
  await wait(500);
  assert.equal(await pageA.$$eval('.arena-target-ghost', nodes => nodes.length), 0, 'the Gahooked button should clean itself up');
  checked.push('item 1: the Gahooked button clears itself rather than accumulating');

  // -------------------------------------------------------------------
  // Item 2 - escalating presses near the win, enforced by the server
  // -------------------------------------------------------------------
  async function tap(page) {
    await page.evaluate(() => {
      const button = document.querySelector('.arena-target');
      if (button) button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, isPrimary: true }));
    });
    await wait(220);
  }

  // Drive Ada to a four-point lead from whatever the state actually is, rather
  // than from a running tally -- the checks above also pressed the button, and
  // arithmetic that assumes otherwise is the kind that silently stops testing
  // anything. The closing rule is then asserted from a known position.
  let state = await duelState(code, aKey);
  let guard = 0;
  while ((state.hits[aId] - state.hits[bId]) < 4 && guard < 40) {
    await tap(pageA);
    state = await duelState(code, aKey);
    guard += 1;
  }
  assert.equal(state.hits[aId] - state.hits[bId], 4, `Ada should be four points clear, saw ${JSON.stringify(state.hits)}`);
  // More presses than points is the escalation itself: without it these would
  // be equal, because every press would have scored.
  assert(state.ownPresses > state.hits[aId], `escalation should make presses exceed points, saw ${state.ownPresses} presses for ${state.hits[aId]} points`);
  checked.push(`item 2: reaching a four-point lead took ${state.ownPresses} presses for ${state.hits[aId]} points, so the last points cost more than one press each`);

  // At a lead of four the last point costs three presses, and only the last of
  // them scores. The presses already banked are read from the server rather
  // than assumed to be zero -- earlier checks in this file also pressed the
  // button, and a test that assumes a clean slate here would quietly stop
  // testing the rule it is named after.
  const pointsBeforeClose = state.hits[aId];
  assert.equal(state.pressesRequired, 3, `at a four-point lead a point should cost three presses, saw ${state.pressesRequired}`);
  const alreadyPaid = state.pressesDone;
  const remaining = state.pressesRequired - alreadyPaid;
  assert(remaining >= 1 && remaining <= 3, `remaining presses should be 1..3, saw ${remaining}`);

  // Every press except the last must leave the score exactly where it was.
  for (let index = 0; index < remaining - 1; index += 1) {
    await tap(pageA);
    state = await duelState(code, aKey);
    assert.equal(state.hits[aId], pointsBeforeClose, `press ${index + 1} of ${remaining} must not score`);
    assert.equal(state.status, 'active', 'the duel should still be running');
  }

  // With at least one press paid, the UI must explain why the rope is not
  // moving -- otherwise the mechanic is indistinguishable from a dropped tap.
  const pips = await pageA.evaluate(() => {
    const charge = document.querySelector('.arena-charge');
    if (!charge) return null;
    return {
      total: charge.querySelectorAll('i').length,
      paid: charge.querySelectorAll('i.is-paid').length,
      label: charge.getAttribute('aria-label'),
      instruction: document.querySelector('.arena-instruction')?.textContent || ''
    };
  });
  assert.notEqual(pips, null, 'the remaining presses must be shown, or a non-scoring tap reads as a dropped input');
  assert.equal(pips.total, 3, `closing out a win should show three presses, saw ${pips.total}`);
  assert(pips.paid >= 1, `the presses already made should be shown as paid, saw ${pips.paid}`);
  assert(/MORE TO WIN/.test(pips.instruction), `the instruction should say what is left, saw "${pips.instruction}"`);
  assert(/presses left/.test(pips.label || ''), 'the charge indicator needs an accessible label');
  checked.push(`item 2: at a four-point lead the UI shows ${pips.paid}/${pips.total} presses and says "${pips.instruction.trim()}"`);

  // The final press takes the point, and with it the match.
  await tap(pageA);
  state = await duelState(code, aKey);
  assert.equal(state.hits[aId], pointsBeforeClose + 1, 'the last of the three presses should take the winning point');
  assert.equal(state.winnerId, aId, 'a five-point lead should win the match');
  checked.push(`item 2: the closing point cost three presses, ${remaining} of them still owed when the check began, enforced server-side`);

  await pageA.screenshot({ path: `${out}/arena-winner.png` });
  await pageB.screenshot({ path: `${out}/arena-loser.png` });

  assert.deepEqual(errors, [], 'the browser reported page errors: ' + errors.join(' | '));
  console.log(JSON.stringify({ ok: true, baseUrl: base, checked }, null, 2));
} finally {
  await browser.close();
}
