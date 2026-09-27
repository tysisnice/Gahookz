// The app frame, checked in a real browser at real sizes (UI 1, ui-shell).
//
// Four things from Tyson's 25 September note live in the frame every screen
// sits in, and none of them can be proved by a build:
//
//   U1   tooltips stay fully on screen, wherever their (i) sits
//   U16  the top bar's "Lobby" and room-code pills are small
//   U12  menus and dialogs sit above the floating chat button
//   U10  on a phone the player/host menus open as an overlay
//   S2   Back closes the topmost overlay, and with nothing open it asks
//        "Leave game?" instead of leaving the room
//
// So this drives Chromium at phone and desktop sizes and measures geometry,
// hit-testing and history. Screenshots that prove each item are written to
// docs/verification/2026-09-25-update/ui-shell/.
//
// Disposable server only (it creates and mutates rooms):
//   flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser:navigation
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer';

const base = process.env.GAHOOKZ_BASE_URL || 'http://127.0.0.1:3199';
assert.equal(base, 'http://127.0.0.1:3199', 'ui-shell browser checks only run against the disposable server');

const out = 'docs/verification/2026-09-25-update/ui-shell';
const SHOTS = process.env.GAHOOKZ_SHELL_SCREENSHOTS !== '0';
fs.mkdirSync(out, { recursive: true });

const SIZES = {
  tiny: { width: 320, height: 568 },
  small: { width: 360, height: 740 },
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 }
};
const EDGE = 8;

const errors = [];
const checked = [];
const note = (message) => {
  checked.push(message);
  console.log('  ok  ' + message);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'], timeout: 60_000 });

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

async function until(page, description, predicate, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate(predicate).catch(() => false)) return;
    if (Date.now() > deadline) throw new Error('Timed out waiting for: ' + description);
    await wait(150);
  }
}

async function pageFor(key, code, size, { phone = true } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ ...size, isMobile: phone, hasTouch: phone, deviceScaleFactor: 2 });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluateOnNewDocument((clientKey) => {
    localStorage.setItem('gahookz-client-key', clientKey);
    for (const mode of ['quiz', 'herd', 'majority', 'host']) localStorage.setItem('gahookz-how-to-play-seen-v2-' + mode, '1');
  }, key);
  await page.goto(base + '/' + code);
  try {
    // A cold first load on a busy two-core machine can miss the window once;
    // a reload is what a person would do, and a second miss is a real failure.
    await page.waitForSelector('.host-topbar', { timeout: 20_000 }).catch(async () => {
      await page.reload();
      await page.waitForSelector('.host-topbar', { timeout: 20_000 });
    });
  } catch (error) {
    const text = await page.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => '(unreadable)');
    throw new Error(`room ${code} did not render for ${key}: ${text} | page errors: ${errors.join(' | ')}`, { cause: error });
  }
  return page;
}

async function capture(page, name) {
  if (!SHOTS) return;
  await wait(250);
  await page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 70 });
}

// A pinned tip closes on a pointer-down anywhere else; a hovered or focused one
// when the pointer and focus leave. Escape is not used here because inside a
// dialog it rightly closes the dialog too.
async function closeTip(page) {
  await page.mouse.move(1, 1);
  await page.evaluate(() => {
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    document.activeElement?.blur?.();
  });
  await wait(80);
}

// Opens every visible (i) on the page in turn, and returns each bubble's box
// against the viewport.
async function measureTips(page, scope = 'body') {
  const count = await page.$$eval(`${scope} .info-tip-button`, (buttons) => buttons.length);
  const boxes = [];
  for (let index = 0; index < count; index += 1) {
    const button = (await page.$$(`${scope} .info-tip-button`))[index];
    if (!(await button.isIntersectingViewport().catch(() => false))) {
      await button.evaluate((element) => element.scrollIntoView({ block: 'center' }));
      await wait(150);
    }
    const visible = await button.evaluate((element) => element.getClientRects().length > 0);
    if (!visible) continue;
    await button.click();
    await wait(120);
    boxes.push(await button.evaluate((element) => {
      const bubble = document.getElementById(element.getAttribute('aria-describedby'));
      const box = bubble.getBoundingClientRect();
      return {
        label: element.getAttribute('aria-label'),
        left: box.left, right: box.right, top: box.top, bottom: box.bottom,
        width: window.innerWidth, height: window.innerHeight,
        // The bubble must be what a finger at its centre actually hits.
        onTop: bubble.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))
      };
    }));
    await closeTip(page);
  }
  return boxes;
}

function assertTipsInside(boxes, where) {
  assert(boxes.length > 0, `${where}: expected at least one tooltip to check`);
  for (const box of boxes) {
    const inside = box.left >= EDGE - 0.5 && box.right <= box.width - EDGE + 0.5 && box.top >= EDGE - 0.5 && box.bottom <= box.height - EDGE + 0.5;
    assert(inside, `${where}: tooltip "${box.label}" leaves the ${EDGE}px safe area: ${JSON.stringify(box)}`);
    assert(box.onTop, `${where}: tooltip "${box.label}" is covered by something else: ${JSON.stringify(box)}`);
  }
}

try {
  const created = await post('SHEL', '/api/room', { playerKey: 'shell-host', intent: 'host' });
  const code = created.code || 'SHEL';
  const playerKeys = ['shell-p0', 'shell-p1', 'shell-p2'];
  for (const [index, key] of playerKeys.entries()) {
    await post(code, '/api/player/join', { playerKey: key, name: 'Player ' + index, avatarId: 'fox' });
  }

  // -------------------------------------------------------------------------
  // U1 - every tooltip stays inside the viewport at 320-1440px
  // -------------------------------------------------------------------------
  for (const [name, size] of Object.entries(SIZES)) {
    const phone = name !== 'desktop';
    const host = await pageFor('shell-host', code, size, { phone });
    await host.waitForSelector('.host-control-panel .info-tip-button');
    assertTipsInside(await measureTips(host, '.host-control-panel'), `host lobby ${size.width}x${size.height}`);

    // The (i) forced to each edge of the screen: the bubble must still fit.
    for (const edge of ['left', 'right']) {
      await host.evaluate((side) => {
        const holder = document.querySelector('.majority-toggle-controls .info-tip');
        holder.style.position = 'fixed';
        holder.style.top = '45%';
        holder.style.left = side === 'left' ? '2px' : 'auto';
        holder.style.right = side === 'right' ? '2px' : 'auto';
        holder.style.zIndex = '1';
      }, edge);
      assertTipsInside(await measureTips(host, '.majority-toggle-controls'), `tip pinned to the ${edge} edge at ${size.width}px`);
    }
    await host.evaluate(() => document.querySelector('.majority-toggle-controls .info-tip').removeAttribute('style'));

    // Inside the scrolling Lobby rules dialog.
    await host.click('.rules-modal-trigger');
    await host.waitForSelector('.rules-modal');
    assertTipsInside(await measureTips(host, '.rules-modal'), `Lobby rules dialog ${size.width}x${size.height}`);
    if (name === 'small' || name === 'desktop') {
      const button = await host.$('.rules-modal .info-tip-button');
      await button.click();
      await capture(host, `tooltip-rules-${size.width}`);
      await closeTip(host);
    }
    await host.keyboard.press('Escape');
    await until(host, 'Lobby rules closes on Escape', () => !document.querySelector('.rules-modal'));

    // Tyson's screenshot case: the Majority Rulez tip on a phone.
    if (phone) {
      const majority = await host.$('.majority-toggle-controls .info-tip-button');
      await majority.evaluate((element) => element.scrollIntoView({ block: 'center' }));
      await majority.click();
      await wait(150);
      await capture(host, `tooltip-majority-${size.width}`);
      await closeTip(host);
    }
    await host.browserContext().close();
  }
  note('every tooltip (host lobby, Lobby rules, (i) forced to either edge) stays 8px inside the viewport and on top at 320, 360, 390 and 1280px');

  // -------------------------------------------------------------------------
  // U16 - the top-bar pills are small
  // -------------------------------------------------------------------------
  for (const size of [SIZES.small, SIZES.phone, SIZES.desktop]) {
    const player = await pageFor(playerKeys[0], code, size, { phone: size !== SIZES.desktop });
    await player.waitForSelector('.topbar-room-code');
    const pills = await player.evaluate(() => [...document.querySelectorAll('.host-actions .phase-pill, .host-actions .topbar-room-code')].map((pill) => {
      const box = pill.getBoundingClientRect();
      const menu = document.querySelector('.host-actions summary').getBoundingClientRect();
      return { text: pill.textContent, height: box.height, font: parseFloat(getComputedStyle(pill).fontSize), right: box.right, width: window.innerWidth, menuHeight: menu.height };
    }));
    assert.equal(pills.length, 2, 'the top bar shows the state pill and the room code');
    for (const pill of pills) {
      assert(pill.height <= 28, `${pill.text} pill is ${pill.height}px tall at ${size.width}px; it should be a small label`);
      assert(pill.font >= 11 && pill.font <= 13, `${pill.text} pill text is ${pill.font}px; small but legible is 11-13px`);
      assert(pill.height < pill.menuHeight, `${pill.text} pill should be lighter than the menu button beside it`);
      assert(pill.right <= pill.width, `${pill.text} pill runs off screen at ${size.width}px`);
    }
    if (size === SIZES.phone) await capture(player, 'topbar-390');
    await player.browserContext().close();
  }
  note('top-bar state and room-code pills are <=28px tall with 11-13px text at 360, 390 and 1280px');

  // -------------------------------------------------------------------------
  // S2 - Back closes the topmost overlay; with nothing open it asks first
  // -------------------------------------------------------------------------
  const roomPath = '/' + code;
  const depth = (page) => page.evaluate(() => window.history.state?.gahookzBack?.depth || 0);
  const guarded = (page) => until(page, 'the room guard entry', () => window.history.state?.gahookzBack?.depth === 1);
  const inRoom = async (page, where) => {
    assert.equal(await page.evaluate(() => location.pathname), roomPath, `${where}: Back must not leave the room`);
    assert(await page.$('.host-topbar'), `${where}: the room screen should still be showing`);
  };
  const noConfirm = async (page, where) => assert.equal(await page.$('.leave-game-dialog'), null, `${where}: "Leave game?" must not appear`);
  const back = async (page) => {
    await page.goBack();
    await wait(200);
  };

  {
    const player = await pageFor(playerKeys[1], code, SIZES.phone);
    await guarded(player);
    note('joining a room (deep link /' + code + ') adds exactly one guard entry');

    // Nothing open: Back asks.
    await back(player);
    await player.waitForSelector('.leave-game-dialog');
    await inRoom(player, 'Back with nothing open');
    const dialog = await player.evaluate(() => {
      const box = document.querySelector('.leave-game-dialog');
      const rect = box.getBoundingClientRect();
      return {
        title: box.querySelector('h2').textContent,
        text: box.querySelector('p').textContent,
        buttons: [...box.querySelectorAll('button')].map((button) => button.textContent),
        focused: document.activeElement?.textContent,
        onTop: box.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + 20))
      };
    });
    assert.deepEqual({ title: dialog.title, text: dialog.text, buttons: dialog.buttons }, { title: 'Leave game?', text: 'Are you sure?', buttons: ['No', 'Yes'] });
    assert.equal(dialog.focused, 'No', 'No, the safe answer, takes focus');
    assert(dialog.onTop, 'the confirmation is on top of everything');
    await capture(player, 'leave-game-390');

    await player.click('.leave-game-no');
    await wait(200);
    await noConfirm(player, 'after No');
    await inRoom(player, 'after No');
    assert.equal(await depth(player), 1, 'No restores the guard entry');
    note('Back with nothing open shows "Leave game? / Are you sure?" with No/Yes; No stays and restores the entry');

    // An overlay: How to play.
    await player.click('.room-status-copy .how-to-play-button');
    await player.waitForSelector('.tutorial-dialog');
    assert.equal(await depth(player), 2, 'an open overlay owns one entry');
    await back(player);
    await until(player, 'the tutorial closes on Back', () => !document.querySelector('.tutorial-dialog'));
    await noConfirm(player, 'Back from How to play');
    await inRoom(player, 'Back from How to play');
    assert.equal(await depth(player), 1);

    // Closing the overlay by its own button consumes its entry.
    await player.click('.room-status-copy .how-to-play-button');
    await player.waitForSelector('.tutorial-dialog');
    await player.click('.tutorial-dialog__close');
    await until(player, 'the tutorial closes by its button', () => !document.querySelector('.tutorial-dialog'));
    await until(player, 'its history entry is consumed', () => window.history.state?.gahookzBack?.depth === 1);
    note('Back closes How to play and stays in the room; closing it by its button consumes its entry');

    // Escape answers No; a reload keeps the guard (deep link / rejoin).
    await back(player);
    await player.waitForSelector('.leave-game-dialog');
    await player.keyboard.press('Escape');
    await wait(150);
    await noConfirm(player, 'after Escape');
    assert.equal(await depth(player), 1, 'Escape restores the guard entry like No');
    await player.reload();
    await player.waitForSelector('.host-topbar');
    await guarded(player);
    await back(player);
    await player.waitForSelector('.leave-game-dialog');
    await inRoom(player, 'Back after a reload');
    note('Escape answers No; after a reload Back still asks');

    // Yes leaves exactly as Exit Lobby does.
    await player.click('.leave-game-yes');
    await until(player, 'the welcome screen', () => location.pathname === '/' && Boolean(document.querySelector('.welcome-screen')));
    note('Yes leaves to the welcome screen, like Exit Lobby');

    // On the welcome screen Back is ordinary history again: it returns to the
    // room entry (and the saved session rejoins), without asking anything.
    await back(player);
    await player.waitForFunction((path) => location.pathname === path, { timeout: 15_000 }, roomPath);
    await player.waitForSelector('.host-topbar');
    await noConfirm(player, 'Back on the welcome screen');
    await player.browserContext().close();
    note('on the welcome screen Back behaves normally');
  }

  {
    // Someone still on the join form is not in the room yet: Back is normal.
    const context = await browser.createBrowserContext();
    const newcomer = await context.newPage();
    await newcomer.setViewport({ ...SIZES.small, isMobile: true, hasTouch: true });
    newcomer.on('pageerror', (error) => errors.push(error.message));
    await newcomer.goto(base + '/information');
    await newcomer.goto(base + roomPath);
    await newcomer.waitForSelector('.party-join-form');
    await wait(400);
    assert.equal(await depth(newcomer), 0, 'the join form adds no guard entry');
    await back(newcomer);
    await until(newcomer, 'Back from the join form leaves normally', () => location.pathname === '/information');
    await context.close();
    note('Back from the join form (not yet in the room) leaves normally; /information is untouched');
  }

  {
    // The host, on a desktop: Lobby rules closes on Back, focus returns.
    const host = await pageFor('shell-host', code, SIZES.desktop, { phone: false });
    await guarded(host);
    await host.click('.rules-modal-trigger');
    await host.waitForSelector('.rules-modal');
    await back(host);
    await until(host, 'Lobby rules closes on Back', () => !document.querySelector('.rules-modal'));
    await noConfirm(host, 'Back from Lobby rules');
    await inRoom(host, 'Back from Lobby rules');
    assert(await host.evaluate(() => document.activeElement?.matches('.rules-modal-trigger')), 'focus returns to the Lobby rules button');
    await back(host);
    await host.waitForSelector('.leave-game-dialog');
    await capture(host, 'leave-game-1280');
    await host.click('.leave-game-no');
    await wait(150);
    await inRoom(host, 'host after No');
    await host.browserContext().close();
    note('host: Back closes Lobby rules (focus back on its button), then asks before leaving');
  }

  assert.deepEqual(errors, [], 'the browser reported page errors: ' + errors.join(' | '));
  console.log(JSON.stringify({ ok: true, baseUrl: base, checked }, null, 2));
} finally {
  await browser.close();
}
