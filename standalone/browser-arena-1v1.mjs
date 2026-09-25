// Real-browser verification for ARENA-1V1-PLAN.md and the 2026-09-25 update.
//
// "Feel is the acceptance criterion", so a green unit test is not enough: this
// plays an actual duel in two separate browser contexts (tabs in one profile
// share a device credential, which would make them the same player) and checks
// the things a player would notice -- the Gahooked button animation, the
// escalating presses near the win, the mini Gahooks, and whether the Gahook
// button renders the character properly.
//
// 2026-09-25: the lead to win is six and no point costs three presses (A1),
// and a third player's Gahooks reach a duelist as tappable minis anywhere
// below the score, which Gahook the sender back (A2). Bo plays on a phone-size
// viewport so those checks and screenshots are taken where they matter.
//
// Never point this at production or beta: it creates and mutates real rooms.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer';

const base = process.env.GAHOOKZ_BASE_URL || 'http://127.0.0.1:3199';
assert.equal(base, 'http://127.0.0.1:3199', 'arena checks only run against the disposable server');

const out = 'docs/verification/2026-09-25-update/arena';
fs.mkdirSync(out, { recursive: true });
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

async function pageFor(key, code, viewport = { width: 900, height: 900 }) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(viewport);
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
  // Cy is the crowd: not in the duel, Gahooking one of the duelists from the
  // lobby. Driven through the API, because what matters is what Bo sees.
  const cKey = code + '-c';
  await post(code, '/api/player/join', { playerKey: cKey, name: 'Cy', avatarId: 'frog' });
  await post(code, '/api/player/gahook-form', { playerKey: cKey, gahookForm: 'croc' });
  // Player ids come from the room, not the join reply, so they are read back
  // by name rather than assumed from a response shape.
  const roster = (await post(code, '/api/state', { playerKey: hostKey, role: 'host' })).data.players || [];
  const aId = roster.find(player => player.name === 'Ada')?.id;
  const bId = roster.find(player => player.name === 'Bo')?.id;
  const cId = roster.find(player => player.name === 'Cy')?.id;
  assert(aId && bId && cId, 'all three players should have joined, saw ' + JSON.stringify(roster.map(p => p.name)));

  const pageA = await pageFor(aKey, code);
  const phone = { width: 390, height: 844 };
  const pageB = await pageFor(bKey, code, phone);

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
      arenaStillUsable: Boolean(document.querySelector('.arena-target')),
      // Opponent-tap minis stay decorative and in the top band; only Gahooks
      // thrown by other players land over the tap zone.
      lowestCentre: Math.max(...cards.map(card => { const box = card.getBoundingClientRect(); return (box.top + box.height / 2) / innerHeight; }))
    };
  });
  assert(mini.count >= 1, 'the opponent should receive a mini Gahook when a press lands');
  assert(mini.fullScreen <= baselineOverlays, `a press must not add a full-screen Gahook overlay during a duel (baseline ${baselineOverlays}, now ${mini.fullScreen})`);
  assert.equal(mini.inert, true, 'mini Gahooks must not intercept taps');
  assert.equal(mini.hidden, true, 'mini Gahooks are decorative and should be aria-hidden');
  assert.equal(mini.arenaStillUsable, true, 'the opponent should still have a tap target while being mini Gahooked');
  assert(mini.lowestCentre < 0.5, `opponent-tap minis should stay in the top band, saw a centre at ${Math.round(mini.lowestCentre * 100)}% of the screen`);
  checked.push('item 3: an opponent press lands as an inert mini Gahook in the top band, not a full-screen overlay, and the arena stays playable');

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
  // A2 (2026-09-25) - Gahooks thrown at a duelist are tappable minis
  // -------------------------------------------------------------------
  const cyGahooksBo = async () => {
    const result = await post(code, '/api/player/poke', { playerKey: cKey, playerId: bId });
    assert.equal(result.data.ok, true, 'Cy should be able to Gahook a duelist: ' + JSON.stringify(result.data));
    return result.data.pokeId;
  };
  // Where every live thrown mini sits, and where the score ends, on Bo's phone.
  const thrownMinis = () => pageB.evaluate(() => {
    const score = document.querySelector('.arena-overlay .arena-score').getBoundingClientRect();
    return {
      scoreBottom: score.bottom,
      width: innerWidth,
      height: innerHeight,
      minis: [...document.querySelectorAll('button.arena-thrown-mini')].map(node => {
        const box = node.getBoundingClientRect();
        return { label: node.getAttribute('aria-label'), left: box.left, right: box.right, top: box.top, bottom: box.bottom, centreY: (box.top + box.height / 2) / innerHeight, animation: getComputedStyle(node).animationName };
      })
    };
  });
  const cyState = async () => (await post(code, '/api/state', { playerKey: cKey, role: 'player' })).data;
  const fullScreenBefore = await pageB.$$eval('.poke-overlay', nodes => nodes.length);

  await cyGahooksBo();
  await pageB.waitForSelector('button.arena-thrown-mini', { timeout: 6000 });
  await wait(250); // past the pop-in, so the box measured is the resting one
  let layout = await thrownMinis();
  assert.equal(layout.minis[0].label, 'Gahook Cy back', `a thrown mini should be a button labelled for its sender, saw "${layout.minis[0].label}"`);
  assert.equal(await pageB.$$eval('.poke-overlay', nodes => nodes.length), fullScreenBefore, 'a thrown Gahook must not add a full-screen overlay during a duel');
  checked.push('A2: a Gahook from a third player reaches the duelist as a mini button labelled "Gahook Cy back", not a full-screen overlay');

  // Placement: anywhere below the score, the lower half included, and always
  // fully on screen. Sampled over real throws rather than a forced position.
  const samples = [];
  let lowerHalf = null;
  for (let throwIndex = 0; throwIndex < 10 && !lowerHalf; throwIndex += 1) {
    if (throwIndex) {
      await cyGahooksBo();
      await wait(320);
    }
    layout = await thrownMinis();
    assert(layout.minis.length <= 4, `thrown minis should stay capped at four, saw ${layout.minis.length}`);
    for (const item of layout.minis) {
      samples.push(item);
      assert(item.left >= 0 && item.right <= layout.width && item.top >= 0 && item.bottom <= layout.height, `a thrown mini left the screen: ${JSON.stringify(item)}`);
      assert(item.top >= layout.scoreBottom - 1, `a thrown mini covered the score (mini top ${Math.round(item.top)}, score bottom ${Math.round(layout.scoreBottom)})`);
      if (item.centreY > 0.5) lowerHalf = item;
    }
  }
  assert(lowerHalf, `a thrown mini should be able to land in the lower half, centres seen: ${samples.map(item => Math.round(item.centreY * 100) + '%').join(', ')}`);
  await pageB.screenshot({ path: `${out}/arena-thrown-minis-390x844.png` });
  checked.push(`A2: over ${samples.length} sightings every thrown mini stayed on screen and below the score, and one landed ${Math.round(lowerHalf.centreY * 100)}% of the way down the phone`);

  // The layer lets taps through: where no mini covers the target, a real
  // click on the target still presses it.
  async function clickUncoveredTarget(page, key) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const point = await page.evaluate(() => {
        const target = document.querySelector('.arena-target');
        if (!target) return null;
        const box = target.getBoundingClientRect();
        const x = box.left + box.width / 2, y = box.top + box.height / 2;
        return target.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
      });
      if (point) {
        const before = (await duelState(code, key)).ownPresses;
        await page.mouse.click(point.x, point.y);
        await wait(250);
        return { before, after: (await duelState(code, key)).ownPresses };
      }
      await wait(200);
    }
    throw new Error('the arena target stayed covered for four seconds');
  }
  if (!(await pageB.$('button.arena-thrown-mini'))) {
    await cyGahooksBo();
    await pageB.waitForSelector('button.arena-thrown-mini', { timeout: 6000 });
  }
  const through = await clickUncoveredTarget(pageB, bKey);
  assert.equal(through.after, through.before + 1, `a click on an uncovered target should press it while minis are showing, presses ${through.before} -> ${through.after}`);
  checked.push('A2: with thrown minis on screen, a real click on the uncovered arena target still presses it');

  // Tapping a mini Gahooks Cy back, instantly, without counting as an arena
  // press and without taking focus away from the target.
  // The newest mini, found by the id of the Gahook that made it, so a cap
  // replacing the oldest card cannot make the test click the wrong one.
  async function freshMini() {
    const pokeId = await cyGahooksBo();
    const selector = `button.arena-thrown-mini[data-poke-id="${pokeId}"]`;
    await pageB.waitForSelector(selector, { timeout: 6000 });
    await wait(250);
    return pageB.$eval(selector, node => {
      const box = node.getBoundingClientRect();
      const x = box.left + box.width / 2, y = box.top + box.height / 2;
      return { selector: `button.arena-thrown-mini[data-poke-id="${node.dataset.pokeId}"]`, x, y, onTop: node.contains(document.elementFromPoint(x, y)) };
    });
  }
  await pageB.evaluate(() => document.querySelector('.arena-target')?.focus());
  const pressesBeforeMini = (await duelState(code, bKey)).ownPresses;
  const cyPokeBefore = (await cyState()).ownPoke?.id || '';
  const hit = await freshMini();
  assert.equal(hit.onTop, true, 'the newest thrown mini should sit above the playfield');
  await pageB.mouse.click(hit.x, hit.y);
  const feedback = await pageB.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(resolve));
    const node = document.querySelector('.arena-thrown-mini.is-sent');
    return { text: node?.textContent || '', inert: node ? getComputedStyle(node).pointerEvents === 'none' : false, focus: document.activeElement?.className || document.activeElement?.tagName };
  });
  assert.equal(feedback.text, 'Gahooked back!', 'tapping a mini should say "Gahooked back!" straight away');
  assert.equal(feedback.inert, true, 'the confirmation must let the next tap through');
  assert(/arena-target/.test(feedback.focus), `tapping a mini must leave focus on the arena target, focus is on "${feedback.focus}"`);
  let cy = await cyState();
  for (let poll = 0; poll < 20 && (cy.ownPoke?.id || '') === cyPokeBefore; poll += 1) {
    await wait(100);
    cy = await cyState();
  }
  assert.equal(cy.ownPoke?.senderPlayerId, bId, 'tapping the mini should Gahook Cy back: ' + JSON.stringify(cy.ownPoke));
  assert.equal(cy.ownPoke?.from, 'Bo');
  assert.equal((await duelState(code, bKey)).ownPresses, pressesBeforeMini, 'tapping a mini must not count as an arena press');
  await pageB.screenshot({ path: `${out}/arena-gahooked-back-390x844.png` });
  checked.push('A2: tapping a mini shows "Gahooked back!" at once, the server records the Gahook on Cy from Bo, no arena press is counted and focus stays on the target');

  // Keyboard: a mini is reachable and works with Enter, and focus returns to
  // the target afterwards rather than falling to the page.
  const keyed = await freshMini();
  const cyPokeBeforeKey = (await cyState()).ownPoke?.id || '';
  await pageB.$eval(keyed.selector, node => node.focus());
  await pageB.keyboard.press('Enter');
  await wait(60);
  const afterKey = await pageB.evaluate(() => document.activeElement?.className || document.activeElement?.tagName);
  assert(/arena-target/.test(afterKey), `after Enter on a mini, focus should return to the target, saw "${afterKey}"`);
  cy = await cyState();
  for (let poll = 0; poll < 20 && (cy.ownPoke?.id || '') === cyPokeBeforeKey; poll += 1) {
    await wait(100);
    cy = await cyState();
  }
  assert.notEqual(cy.ownPoke?.id || '', cyPokeBeforeKey, 'Enter on a mini should Gahook Cy back too');
  checked.push('A2: a mini works from the keyboard and hands focus back to the arena target');

  // Reduced effects: still a tappable button, just without the bounce.
  await pageB.evaluate(() => document.documentElement.classList.add('gahookz-reduced-effects'));
  await freshMini();
  layout = await thrownMinis();
  assert(layout.minis.length && layout.minis.every(item => item.animation === 'arena-thrown-still'), `reduced effects should hold minis still, saw ${layout.minis.map(item => item.animation).join(', ')}`);
  await pageB.evaluate(() => document.documentElement.classList.remove('gahookz-reduced-effects'));
  checked.push('A2: with reduced effects the minis are still buttons but hold still instead of bouncing');

  // 320px: the narrowest phone still keeps every card whole.
  await pageB.setViewport({ width: 320, height: 640 });
  await wait(200);
  await freshMini();
  layout = await thrownMinis();
  for (const item of layout.minis) assert(item.left >= 0 && item.right <= 320 && item.bottom <= 640, `a thrown mini left a 320px screen: ${JSON.stringify(item)}`);
  checked.push(`A2: at 320x640 all ${layout.minis.length} thrown minis stay fully on screen`);
  await pageB.setViewport(phone);
  await wait(200);

  // A sender who has left: the mini still shows, and tapping it does nothing
  // harmful -- it says so and gets out of the way.
  const lastFromCy = await freshMini();
  const kick = await post(code, '/api/host/kick', { playerKey: hostKey, playerId: cId });
  assert.equal(kick.data.ok, true, JSON.stringify(kick.data));
  await pageB.mouse.click(lastFromCy.x, lastFromCy.y);
  await pageB.waitForSelector('.arena-thrown-mini.is-failed', { timeout: 3000 });
  assert.equal(await pageB.$eval('.arena-thrown-mini.is-failed', node => node.textContent), "Can't Gahook back");
  assert.equal((await duelState(code, bKey)).status, 'active', 'a failed Gahook back must not disturb the duel');
  checked.push('A2: tapping a mini from a player who has left says "Can\'t Gahook back" and the duel carries on');

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

  // Drive Ada to a five-point lead -- one short of the six that wins -- from
  // whatever the state actually is, rather than from a running tally: the
  // checks above also pressed the button, and arithmetic that assumes
  // otherwise is the kind that silently stops testing anything. The closing
  // rule is then asserted from a known position.
  let state = await duelState(code, aKey);
  assert.equal(state.leadToWin, 6, 'the lead to win should be six');
  let guard = 0;
  while ((state.hits[aId] - state.hits[bId]) < 5 && guard < 50) {
    await tap(pageA);
    state = await duelState(code, aKey);
    guard += 1;
  }
  assert.equal(state.hits[aId] - state.hits[bId], 5, `Ada should be five points clear, saw ${JSON.stringify(state.hits)}`);
  // More presses than points is the escalation itself: without it these would
  // be equal, because every press would have scored.
  assert(state.ownPresses > state.hits[aId], `escalation should make presses exceed points, saw ${state.ownPresses} presses for ${state.hits[aId]} points`);
  checked.push(`item 2: reaching a five-point lead took ${state.ownPresses} presses for ${state.hits[aId]} points, so the last points cost more than one press each`);

  // At a lead of five the winning point costs two presses -- not three, as it
  // did before 2026-09-25 -- and only the second of them scores. The presses already banked are read from the server rather
  // than assumed to be zero -- earlier checks in this file also pressed the
  // button, and a test that assumes a clean slate here would quietly stop
  // testing the rule it is named after.
  const pointsBeforeClose = state.hits[aId];
  assert.equal(state.pressesRequired, 2, `at a five-point lead the winning point should cost two presses, saw ${state.pressesRequired}`);
  // A part-paid point is visible only once a press has been made toward it.
  if (state.pressesDone === 0) {
    await tap(pageA);
    state = await duelState(code, aKey);
    assert.equal(state.hits[aId], pointsBeforeClose, 'the first of the two closing presses must not score');
  }
  const alreadyPaid = state.pressesDone;
  const remaining = state.pressesRequired - alreadyPaid;
  assert.equal(remaining, 1, `one closing press should be owed, saw ${remaining}`);

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
  assert.equal(pips.total, 2, `closing out a win should show two presses, saw ${pips.total}`);
  assert(pips.paid >= 1, `the presses already made should be shown as paid, saw ${pips.paid}`);
  assert(/MORE TO WIN/.test(pips.instruction), `the instruction should say what is left, saw "${pips.instruction}"`);
  assert(/presses left/.test(pips.label || ''), 'the charge indicator needs an accessible label');
  checked.push(`item 2: at a five-point lead the UI shows ${pips.paid}/${pips.total} presses and says "${pips.instruction.trim()}"`);

  // The final press takes the point, and with it the match.
  await tap(pageA);
  state = await duelState(code, aKey);
  assert.equal(state.hits[aId], pointsBeforeClose + 1, 'the second of the two presses should take the winning point');
  assert.equal(state.winnerId, aId, 'a six-point lead should win the match');
  assert.equal(state.hits[aId] - state.hits[bId], 6);
  checked.push('item 2: the winning point cost two presses, not three, and a six-point lead won, enforced server-side');

  await pageA.screenshot({ path: `${out}/arena-winner.png` });
  await pageB.screenshot({ path: `${out}/arena-loser.png` });

  assert.deepEqual(errors, [], 'the browser reported page errors: ' + errors.join(' | '));
  console.log(JSON.stringify({ ok: true, baseUrl: base, checked }, null, 2));
} finally {
  await browser.close();
}
