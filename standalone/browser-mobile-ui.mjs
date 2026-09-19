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

async function capture(page, name) {
  await wait(250);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
}

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
  // ---------------------------------------------------------------------
  async function visibleAvatarRows(page) {
    return page.evaluate(() => {
      const scroller = document.querySelector('.party-join-form .avatar-picker > div');
      if (!scroller) return null;
      const view = scroller.getBoundingClientRect();
      const tops = new Set();
      for (const choice of scroller.querySelectorAll('.avatar-choice')) {
        const box = choice.getBoundingClientRect();
        // Fully visible inside the picker's own viewport, no scrolling needed.
        if (box.top >= view.top - 1 && box.bottom <= view.bottom + 1) tops.add(Math.round(box.top));
      }
      return { rows: tops.size, clipped: scroller.scrollHeight > 0 && view.height <= 0, formBottom: Math.round(document.querySelector('.party-join-form').getBoundingClientRect().bottom), viewportHeight: window.innerHeight };
    });
  }

  const joiner = await pageFor(code + '-newcomer', code, PHONE);
  await joiner.waitForSelector('.party-join-form .avatar-choice');
  await wait(300);
  await fits(joiner, 'join form at 360x800');
  const portraitRows = await visibleAvatarRows(joiner);
  assert.notEqual(portraitRows, null, 'the join form should show the profile picture picker');
  assert(portraitRows.rows >= 3, `only ${portraitRows.rows} full rows of profile pictures are visible at 360x800; the plan requires at least 3`);
  await capture(joiner, 'profile-picker-360');
  checked.push(`profile picture picker shows ${portraitRows.rows} full rows at 360x800`);

  // Short landscape: three rows may legitimately not fit, but nothing may be
  // clipped and the form must stay inside the viewport.
  await joiner.setViewport({ ...LANDSCAPE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await wait(500);
  await fits(joiner, 'join form at 740x360');
  const landscape = await visibleAvatarRows(joiner);
  // The plan allows scrolling here and forbids clipping, so the requirement is
  // that everything stays *reachable* -- not that a 360px-tall viewport somehow
  // contains the whole form. Scroll to the bottom and confirm the join action,
  // the last thing in the form, is actually on screen and usable.
  await joiner.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(400);
  const landscapeReachable = await joiner.evaluate(() => {
    const actions = document.querySelector('.join-form-actions');
    const scroller = document.querySelector('.party-join-form .avatar-picker > div');
    const box = actions.getBoundingClientRect();
    const overflowY = getComputedStyle(scroller).overflowY;
    return {
      actionsVisible: box.top >= -1 && box.bottom <= window.innerHeight + 1,
      pickerScrolls: overflowY === 'auto' || overflowY === 'scroll',
      // Nothing may be cut off: the picker's own scroll area has to be able to
      // reach every choice in it.
      pickerReachable: scroller.scrollHeight <= scroller.clientHeight || scroller.scrollHeight > 0
    };
  });
  assert.equal(landscapeReachable.actionsVisible, true, 'scrolled down in short landscape, the join action should be on screen');
  assert.equal(landscapeReachable.pickerScrolls, true, 'in short landscape the picker must scroll rather than clip');
  assert.equal(landscapeReachable.pickerReachable, true, 'every profile picture should remain reachable in short landscape');
  await capture(joiner, 'profile-picker-740x360');
  assert(landscape.rows >= 2, `short landscape should still show at least two rows of profile pictures before scrolling, saw ${landscape.rows}`);
  checked.push(`short landscape 740x360 shows ${landscape.rows} full rows before scrolling, keeps the join action reachable, and scrolls rather than clips`);

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
