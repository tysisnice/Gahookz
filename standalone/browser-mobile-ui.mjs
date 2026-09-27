// Real-viewport verification for MOBILE-UI-PLAN.md.
//
// A passing build proves the JSX parses. It proves nothing at all about
// whether a chat bubble is sitting on top of somebody's player banner at
// 360x800, which is the entire content of that plan. So this drives a real
// Chromium at real phone sizes and measures geometry.
//
// Never point this at production or beta: it creates and mutates real rooms.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const base = process.env.GAHOOKZ_BASE_URL || 'http://127.0.0.1:3199';
assert.equal(base, 'http://127.0.0.1:3199', 'mobile UI checks only run against the disposable server');

const out = 'docs/verification/2026-09-19-mobile-ui';
const PHONE = { width: 360, height: 800 };          // a common small Android portrait
const LANDSCAPE = { width: 740, height: 360 };      // the short-landscape case the plan calls out
const DESKTOP = { width: 1440, height: 1000 };

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
  const data = await response.json();
  assert.equal(response.status, 200, `${path}: ${JSON.stringify(data)}`);
  return data;
}

async function pageFor(key, code, viewport = PHONE, { seenTutorials = true } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ ...viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument((clientKey, dismiss) => {
    localStorage.setItem('gahookz-client-key', clientKey);
    if (dismiss) for (const mode of ['quiz', 'herd', 'majority', 'host']) localStorage.setItem('gahookz-how-to-play-seen-v2-' + mode, '1');
  }, key, seenTutorials);
  await page.goto(base + '/' + code);
  return page;
}

async function capture(page, name, dir = out) {
  await wait(250);
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: false });
}
// Evidence for checks added with the 2026-09-25 lobby-setup work.
const setupOut = 'docs/verification/2026-09-25-update/lobby-setup';

// Nothing on a phone may push the document sideways.
async function fits(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 2, `${label}: page overflows horizontally by ${overflow}px`);
}

try {
  const code = 'MBUI';
  const hostKey = code + '-host';
  const playerKeys = Array.from({ length: 8 }, (_, index) => code + '-p' + index);
  await post(code, '/api/room', { playerKey: hostKey, intent: 'host' });
  for (const [index, key] of playerKeys.entries()) {
    await post(code, '/api/player/join', { playerKey: key, name: 'Player ' + index, avatarId: 'fox' });
  }

  // ---------------------------------------------------------------------
  // Item 1 - the lobby ends above the chat bubble, not underneath it
  // ---------------------------------------------------------------------
  const player = await pageFor(playerKeys[0], code);
  await player.waitForSelector('.player-card');
  await fits(player, 'lobby at 360x800');

  // Scroll all the way down: this is the state the screenshot was taken in.
  await player.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(400);

  const overlap = await player.evaluate(() => {
    const fab = document.querySelector('.social-chat-fab');
    if (!fab) return { missing: true };
    const bubble = fab.getBoundingClientRect();
    const covered = [...document.querySelectorAll('.player-card')]
      .map(card => card.getBoundingClientRect())
      .filter(card => card.bottom > bubble.top && card.top < bubble.bottom && card.right > bubble.left && card.left < bubble.right)
      .length;
    return { missing: false, covered, bubbleHeight: Math.round(bubble.height), scrolledToBottom: Math.abs(window.scrollY + window.innerHeight - document.body.scrollHeight) < 4 };
  });
  assert.equal(overlap.missing, false, 'the minimized chat bubble should be present in the lobby');
  assert.equal(overlap.scrolledToBottom, true, 'the check is only meaningful scrolled fully down');
  assert.equal(overlap.covered, 0, `scrolled to the bottom, ${overlap.covered} player banner(s) sit under the chat bubble`);
  await capture(player, 'lobby-360-scrolled-bottom');
  checked.push('lobby scrolled fully down leaves every player banner clear of the chat bubble');

  // The reserved space must not become a dead zone for the lobby paint layer:
  // the canvas is inset:0 against .player-wall, so it has to cover the padding.
  const paintCoversPadding = await player.evaluate(() => {
    const wall = document.querySelector('.player-wall');
    const canvas = document.querySelector('.lobby-paint__canvas');
    if (!wall || !canvas) return null;
    return Math.abs(wall.getBoundingClientRect().bottom - canvas.getBoundingClientRect().bottom) < 2;
  });
  assert.notEqual(paintCoversPadding, null, 'the lobby paint surface should exist on the player wall');
  assert.equal(paintCoversPadding, true, 'the paint canvas should cover the reserved bottom padding, not stop above it');
  checked.push('lobby paint canvas still covers the full wall including the new bottom padding');

  // ---------------------------------------------------------------------
  // Item 2 - all three game-mode tutorial buttons on one row, unclipped
  // ---------------------------------------------------------------------
  await player.click('.room-status-copy .how-to-play-button');
  await player.waitForSelector('.tutorial-dialog');
  await wait(300);
  const tabs = await player.evaluate(() => {
    const wanted = ['quiz', 'majority', 'herd'];
    const found = wanted.map(mode => {
      const tab = document.querySelector(`[data-tutorial-mode="${mode}"]`);
      const box = tab.getBoundingClientRect();
      return { mode, top: Math.round(box.top), right: box.right, left: box.left, clipped: tab.scrollWidth > tab.clientWidth + 1, height: Math.round(box.height) };
    });
    return { found, viewport: window.innerWidth };
  });
  // Sub-pixel layout means two tabs on the same row can report tops a pixel
  // apart, so "same row" is a tolerance, not an equality. A real wrap moves a
  // tab by a whole tab height (~45px), which this still catches easily.
  const tops = tabs.found.map(tab => tab.top);
  const spread = Math.max(...tops) - Math.min(...tops);
  assert(spread < 5, `Quiz, Majority Rulz and Herd should share one row at 360px, saw a ${spread}px vertical spread: ${JSON.stringify(tabs.found)}`);
  for (const tab of tabs.found) {
    assert.equal(tab.clipped, false, `the ${tab.mode} tab label is clipped`);
    assert(tab.left >= -1 && tab.right <= tabs.viewport + 1, `the ${tab.mode} tab runs off screen`);
    assert(tab.height >= 40, `the ${tab.mode} tab is ${tab.height}px tall, below a 40px touch target`);
  }
  await capture(player, 'tutorial-tabs-360');
  checked.push('all three game-mode tutorial tabs fit one row at 360px without clipping, still >=40px tall');
  await player.click('.tutorial-dialog__close');

  // ---------------------------------------------------------------------
  // Item 3 - the profile picture picker shows three rows without scrolling
  //
  // 2026-09-25 (U4): the picker is no longer a scroll box inside a
  // fixed-height card -- that card clipped its own Join button whenever its
  // viewport guess was wrong. The page scrolls and the Join footer is sticky,
  // so the requirement is measured against the screen: three full rows of
  // pictures above the Join footer on first load, Join fully on screen, and
  // no nested scroll area.
  // ---------------------------------------------------------------------
  async function joinLayout(page) {
    return page.evaluate(() => {
      const submit = document.querySelector('.party-join-form button[type="submit"]');
      const picker = document.querySelector('.party-join-form .avatar-picker > div');
      if (!submit || !picker) return null;
      const join = submit.getBoundingClientRect();
      const choices = [...picker.querySelectorAll('.avatar-choice')];
      const tops = new Set();
      for (const choice of choices) {
        const box = choice.getBoundingClientRect();
        if (box.top >= -1 && box.bottom <= join.top + 1) tops.add(Math.round(box.top));
      }
      const last = choices[choices.length - 1].getBoundingClientRect();
      const overflowY = getComputedStyle(picker).overflowY;
      return {
        rows: tops.size,
        joinVisible: join.top >= -1 && join.bottom <= window.innerHeight + 1,
        lastChoiceVisible: last.top >= -1 && last.bottom <= join.top + 1,
        nestedScroll: overflowY === 'auto' || overflowY === 'scroll'
      };
    });
  }

  const joiner = await pageFor(code + '-newcomer', code, PHONE);
  await joiner.waitForSelector('.party-join-form .avatar-choice');
  await wait(300);
  await fits(joiner, 'join form at 360x800');
  const portrait = await joinLayout(joiner);
  assert.notEqual(portrait, null, 'the join form should show the profile picture picker and a Join button');
  assert(portrait.rows >= 3, `only ${portrait.rows} full rows of profile pictures are visible above Join at 360x800; the plan requires at least 3`);
  assert.equal(portrait.joinVisible, true, 'Join should be fully on screen at 360x800 without scrolling');
  assert.equal(portrait.nestedScroll, false, 'profile pictures should be one grid in the page, not a nested scroll box');
  await capture(joiner, 'profile-picker-360');
  checked.push(`profile picture picker shows ${portrait.rows} full rows above a fully visible Join at 360x800, with no nested scroll box`);

  // The Join footer lifts above an on-screen keyboard. Phone browsers shrink
  // only the visual viewport when the keyboard opens, so a stand-in visual
  // viewport (installed before the app loads, because the app subscribes to
  // it on mount) reports a 300px keyboard, and Join must end above it.
  const typing = await browser.createBrowserContext().then(async (context) => {
    const page = await context.newPage();
    await page.setViewport({ ...PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluateOnNewDocument((clientKey) => {
      localStorage.setItem('gahookz-client-key', clientKey);
      for (const mode of ['quiz', 'herd', 'majority', 'host']) localStorage.setItem('gahookz-how-to-play-seen-v2-' + mode, '1');
      const fake = new EventTarget();
      Object.assign(fake, { height: window.innerHeight, offsetTop: 0, scale: 1, width: window.innerWidth });
      Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake });
      window.__openKeyboard = (px) => { fake.height = window.innerHeight - px; fake.dispatchEvent(new Event('resize')); };
    }, code + '-typist');
    await page.goto(base + '/' + code);
    await page.waitForSelector('.party-join-form .avatar-choice');
    await page.evaluate(() => window.__openKeyboard(300));
    await wait(300);
    const result = await page.evaluate(() => {
      const join = document.querySelector('.party-join-form button[type="submit"]').getBoundingClientRect();
      return { joinBottom: Math.round(join.bottom), keyboardTop: window.innerHeight - 300 };
    });
    await context.close();
    return result;
  });
  assert(typing.joinBottom <= typing.keyboardTop + 1, `with a 300px keyboard open, Join should sit above it; its bottom is at ${typing.joinBottom}px, the keyboard starts at ${typing.keyboardTop}px`);
  checked.push('with an on-screen keyboard open, the sticky Join footer sits above the keyboard');

  // Short landscape: three rows may legitimately not fit, but nothing may be
  // clipped. Join stays on screen at the top and at the bottom of the page,
  // every picture can be scrolled to above it, and at least two rows fit
  // above Join once the picker is scrolled up to the top of the screen.
  await joiner.setViewport({ ...LANDSCAPE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await wait(500);
  await fits(joiner, 'join form at 740x360');
  const landscapeTop = await joinLayout(joiner);
  assert.equal(landscapeTop.joinVisible, true, 'in short landscape Join should be on screen before scrolling');
  await joiner.evaluate(() => {
    const picker = document.querySelector('.party-join-form .avatar-picker');
    window.scrollTo(0, picker.getBoundingClientRect().top + window.scrollY);
  });
  await wait(300);
  const landscapePicker = await joinLayout(joiner);
  await capture(joiner, 'profile-picker-740x360');
  await joiner.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(400);
  const landscapeEnd = await joinLayout(joiner);
  assert.equal(landscapeEnd.joinVisible, true, 'scrolled down in short landscape, the join action should be on screen');
  assert.equal(landscapeEnd.lastChoiceVisible, true, 'every profile picture should be reachable above Join in short landscape');
  assert.equal(landscapeEnd.nestedScroll, false, 'short landscape should scroll the page, not a box inside it');
  assert(landscapePicker.rows >= 2, `short landscape should show at least two rows of profile pictures above Join, saw ${landscapePicker.rows}`);
  checked.push(`short landscape 740x360 keeps Join on screen, shows ${landscapePicker.rows} full rows with the picker scrolled up, and reaches every picture by scrolling the page`);

  // ---------------------------------------------------------------------
  // Item 4 - game setup on the narrowest phone (2026-09-25: U2, U3, U6, U17)
  // Quick / Standard / Custom is one row; Custom uses the number wheel, and
  // the wheel's buttons, keyboard and swipe all reach the server setting.
  // ---------------------------------------------------------------------
  const NARROW = { width: 320, height: 568 };
  const host = await pageFor(hostKey, code, NARROW);
  await host.waitForSelector('.host-control-panel .round-preset-options');
  await wait(300);
  await fits(host, 'host setup at 320x568');
  const band = await host.evaluate(() => document.querySelector('.code-band__text > span')?.textContent);
  assert.equal(band, 'Share Lobby Code', 'the share band should be labelled Share Lobby Code');
  const segments = async () => host.evaluate(() => [...document.querySelectorAll('.round-preset-options [role="radio"]')].map((button) => {
    const box = button.getBoundingClientRect();
    return { text: button.textContent.trim(), top: Math.round(box.top), clipped: button.scrollWidth > button.clientWidth + 1, checked: button.getAttribute('aria-checked') };
  }));
  const quizSegments = await segments();
  assert.equal(quizSegments.length, 3, 'Quiz game length should offer three segments');
  assert(Math.max(...quizSegments.map((segment) => segment.top)) - Math.min(...quizSegments.map((segment) => segment.top)) < 3, `Quick, Standard and Custom should share one row at 320px: ${JSON.stringify(quizSegments)}`);
  assert(quizSegments.every((segment) => !segment.clipped), `no game-length label may be clipped at 320px: ${JSON.stringify(quizSegments)}`);
  const familyCards = await host.evaluate(() => [...document.querySelectorAll('.mode-selector-options > button')].map((button) => {
    const art = button.querySelector('.mode-art').getBoundingClientRect();
    const title = button.querySelector('strong').getBoundingClientRect();
    return { artMiddle: art.top + art.height / 2, titleMiddle: title.top + title.height / 2, description: button.querySelector('small').getBoundingClientRect().top, titleBottom: title.bottom };
  }));
  assert(familyCards.every((card) => Math.abs(card.artMiddle - card.titleMiddle) < 6 && card.description >= card.titleBottom - 1), `each game card should have its icon inline with the title and the description below: ${JSON.stringify(familyCards)}`);

  const hostState = async () => (await post(code, '/api/state', { role: 'host', playerKey: hostKey }));
  await host.click('.round-preset-options [role="radio"]:nth-child(3)');
  await host.waitForSelector('.round-preset-custom .number-wheel [role="spinbutton"]');
  await wait(600);
  const wheel = '.round-preset-custom .number-wheel [role="spinbutton"]';
  await host.focus(wheel);
  await host.keyboard.press('Home');
  await wait(700);
  assert.equal((await hostState()).maxQuestionsPerPlayer, 1, 'Home should jump the wheel to its minimum');
  await host.click('.round-preset-custom .number-wheel__step:last-child');
  await wait(700);
  assert.equal((await hostState()).maxQuestionsPerPlayer, 2, 'the wheel\'s + button should change questions per player on the server');
  await host.focus(wheel);
  await host.keyboard.press('ArrowRight');
  await wait(700);
  assert.equal((await hostState()).maxQuestionsPerPlayer, 3, 'the wheel should step with the arrow keys');
  await host.keyboard.press('End');
  await wait(700);
  assert.equal((await hostState()).maxQuestionsPerPlayer, 5, 'End should jump the wheel to its maximum');
  await fits(host, 'quiz custom wheel at 320x568');
  await capture(host, 'setup-quiz-custom-320', setupOut);

  // Herd: rounds 1-20. A swipe is a touch, a scroll, and a release; the wheel
  // commits the number that settles under the lens.
  await host.click('.mode-selector-options > button:nth-child(2)');
  await wait(700);
  await host.click('.round-preset-options [role="radio"]:nth-child(3)');
  await host.waitForSelector('.herd-round-target .number-wheel');
  await wait(700);
  const herdSegments = await segments();
  assert(herdSegments.map((segment) => segment.text).join('|') === 'Quick|Full room|Custom' && herdSegments[2].checked === 'true', `Herd game length should read Quick, Full room, Custom with Custom selected: ${JSON.stringify(herdSegments)}`);
  await host.evaluate(() => {
    const strip = document.querySelector('.herd-round-target .number-wheel__strip');
    const cell = strip.querySelector('[data-wheel-value="12"]');
    strip.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));
    strip.scrollLeft = cell.offsetLeft - (strip.clientWidth - cell.offsetWidth) / 2;
    strip.dispatchEvent(new Event('scroll'));
    strip.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
  });
  await wait(900);
  assert.equal((await hostState()).herdRoundTarget, 12, 'swiping the Herd rounds wheel to 12 should set 12 rounds on the server');
  const herdWheel = await host.$eval('.herd-round-target [role="spinbutton"]', (node) => ({ now: node.getAttribute('aria-valuenow'), min: node.getAttribute('aria-valuemin'), max: node.getAttribute('aria-valuemax'), text: node.getAttribute('aria-valuetext') }));
  assert.deepEqual(herdWheel, { now: '12', min: '1', max: '20', text: '12 rounds' }, 'the rounds wheel should expose spinbutton semantics');
  await fits(host, 'herd custom wheel at 320x568');
  await capture(host, 'setup-herd-custom-320', setupOut);
  checked.push('at 320x568 the game-length segments share one row unclipped, the game cards put the icon inline with the title, the share band reads Share Lobby Code, and the number wheel sets Quiz questions (+, arrows, End) and Herd rounds (swipe) on the server');
  await host.browserContext().close();

  // ---------------------------------------------------------------------
  // Desktop must be unchanged by all of the above
  // ---------------------------------------------------------------------
  const desktop = await pageFor(playerKeys[1], code, DESKTOP);
  await desktop.waitForSelector('.player-card');
  await fits(desktop, 'lobby at 1440x1000');
  const desktopTabs = await (async () => {
    await desktop.click('.room-status-copy .how-to-play-button');
    await desktop.waitForSelector('.tutorial-dialog');
    await wait(300);
    return desktop.evaluate(() => ['quiz', 'majority', 'herd'].map(mode => {
      const box = document.querySelector(`[data-tutorial-mode="${mode}"]`).getBoundingClientRect();
      return { top: Math.round(box.top), width: Math.round(box.width) };
    }));
  })();
  const desktopTops = desktopTabs.map(tab => tab.top);
  assert(Math.max(...desktopTops) - Math.min(...desktopTops) < 5, `desktop tutorial tabs should still share a row, saw ${JSON.stringify(desktopTabs)}`);
  // The desktop tabs keep their generous sizing: the shrink is phone-only.
  assert(desktopTabs.every(tab => tab.width >= 96), `desktop tutorial tabs should keep their full width, saw ${JSON.stringify(desktopTabs)}`);
  const desktopWallPadding = await desktop.evaluate(() => {
    const wall = document.querySelector('.player-wall');
    return wall ? Math.round(parseFloat(getComputedStyle(wall).paddingBottom)) : null;
  });
  assert(desktopWallPadding !== null && desktopWallPadding < 40, `desktop should not reserve phone-sized chat-bubble space, saw ${desktopWallPadding}px`);
  await capture(desktop, 'desktop-unchanged-1440');
  checked.push('desktop at 1440x1000 keeps full-width tutorial tabs and no phone-sized lobby padding');

  assert.deepEqual(errors, [], 'the browser reported page errors: ' + errors.join(' | '));
  console.log(JSON.stringify({ ok: true, baseUrl: base, viewports: { PHONE, LANDSCAPE, DESKTOP }, checked }, null, 2));
} finally {
  await browser.close();
}
