// Host media moderation, watched in a real browser.
//
// The server-side rules are covered by smoke-player-media.mjs. What only a
// browser can show is the host screen itself: the Banned Players panel is
// printed on the screen the whole room is watching, and the client used to put
// the kicked player's picture there optimistically -- so the host pressed Kick
// on a profile picture and immediately saw it again, in a panel that stays.
//
// Disposable server only. Screenshots go to the current run's folder.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import puppeteer from 'puppeteer';

const base = process.env.GAHOOKZ_BASE_URL || 'http://127.0.0.1:3199';
assert.equal(base, 'http://127.0.0.1:3199', 'only runs against the disposable server');
const out = 'docs/verification/2026-10-23-player-media';
fs.mkdirSync(out, { recursive: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
const hostKey = code + '-host';

// A real PNG, so the upload path is exercised with a genuine file rather than
// a string that merely matches the data-url pattern.
function flatPng(rgb, width = 96, height = 96) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x += 1) raw.set(rgb, y * (width * 3 + 1) + 1 + x * 3);
  }
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const pngDataUrl = (rgb) => 'data:image/png;base64,' + flatPng(rgb).toString('base64');

async function post(pathname, body = {}) {
  const response = await fetch(base + pathname, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, ...body })
  });
  const data = await response.json();
  assert.equal(data.ok, true, pathname + ': ' + JSON.stringify(data).slice(0, 300));
  return data;
}
const state = async (role, playerKey) => (await (await fetch(base + '/api/state', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code, role, playerKey })
})).json());

const checks = [];
const note = (message) => { checks.push(message); console.log('  ok  ' + message); };

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'], timeout: 120_000 });
const errors = [];

// Every picture the host screen is currently showing, by source.
const picturesOn = (page, selector) => page.evaluate((scope) =>
  [...document.querySelectorAll(scope + ' img')]
    .filter((image) => image.getClientRects().length)
    .map((image) => image.getAttribute('src') || ''), selector);

const cardFor = (page, name) => page.evaluateHandle((playerName) =>
  [...document.querySelectorAll('.player-card')].find((card) => card.querySelector('h2')?.textContent.trim() === playerName) || null, name);

// The per-player controls live behind a <details> menu. Opening it and then
// clicking by coordinates is unreliable here -- the menu closes on an outside
// click -- so the menu is opened and the button dispatched in the page.
async function runMenuAction(page, name, label) {
  const found = await page.evaluate((playerName, text) => {
    const card = [...document.querySelectorAll('.player-card')].find((item) => item.querySelector('h2')?.textContent.trim() === playerName);
    if (!card) return 'no card';
    const menu = card.querySelector('details.player-action-menu');
    if (!menu) return 'no menu';
    menu.open = true;
    const button = [...menu.querySelectorAll('button')].find((item) => item.textContent.trim().startsWith(text));
    if (!button) return 'no button: ' + [...menu.querySelectorAll('button')].map((item) => item.textContent.trim()).join(' / ');
    if (button.disabled) return 'button disabled';
    button.click();
    return 'ok';
  }, name, label);
  assert.equal(found, 'ok', 'could not run "' + label + '" on ' + name + "'s card: " + found);
}

try {
  await post('/api/room', { playerKey: hostKey, intent: 'host' });
  await post('/api/player/join', { playerKey: code + '-villain', name: 'Villain', avatarId: 'fox', avatarImageDataUrl: pngDataUrl([220, 40, 40]) });
  await post('/api/player/join', { playerKey: code + '-vandal', name: 'Vandal', avatarId: 'owl', avatarImageDataUrl: pngDataUrl([40, 60, 220]) });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('pageerror', (error) => { errors.push(error.message); console.log('PAGEERROR', error.message); });
  await page.evaluateOnNewDocument((key) => {
    localStorage.setItem('gahookz-client-key', key);
    for (const mode of ['quiz', 'herd', 'majority', 'host']) localStorage.setItem('gahookz-how-to-play-seen-v2-' + mode, '1');
  }, hostKey);
  await page.goto(base + '/' + code);
  await page.waitForSelector('.player-card h2');
  await wait(500);

  // Anti-vacuity: the host screen really is showing both uploaded pictures, so
  // a later assertion that none are on screen means something.
  const shown = await picturesOn(page, '.player-card');
  const uploads = shown.filter((src) => src.includes('/media/'));
  assert.equal(uploads.length, 2, 'the host screen should be showing both uploaded pictures, found: ' + JSON.stringify(shown));
  note('the host screen shows a player-uploaded profile picture');
  await page.screenshot({ path: out + '/01-host-lobby-with-uploads.png' });

  // ---- Kick -------------------------------------------------------------
  // Poll from the moment of the click, so the optimistic frame the client
  // renders before the server answers is included rather than skipped.
  await runMenuAction(page, 'Villain', 'Kick');
  let leaked = null;
  let sawPanel = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const banned = await picturesOn(page, '.banned-player-list');
    if (await page.$('.banned-player-list article')) sawPanel = true;
    const upload = banned.find((src) => src.includes('/media/'));
    if (upload && !leaked) leaked = upload;
    await wait(50);
  }
  // Without this the poll above would pass simply by never finding a panel.
  assert.ok(sawPanel, 'the Banned Players panel never appeared, so the picture check proved nothing');
  assert.equal(leaked, null, 'the picture the host kicked somebody for was printed back into the Banned Players panel: ' + leaked);
  note('kicking a player never puts their uploaded picture in the banned panel');

  await page.waitForFunction(() => document.querySelectorAll('.banned-player-list article').length === 1);
  const bannedText = await page.$eval('.banned-player-list', (node) => node.textContent);
  assert.ok(bannedText.includes('Villain'), 'the host still needs to recognise who to unban, got: ' + bannedText);
  note('the banned panel still names the removed player, so the host can unban them');
  await page.screenshot({ path: out + '/02-banned-panel-no-upload.png' });

  // ---- Randomize name & pfp ---------------------------------------------
  const beforeName = await page.$$eval('.player-card h2', (nodes) => nodes.map((node) => node.textContent.trim()));
  assert.ok(beforeName.includes('Vandal'), 'the second player should still be in the lobby');
  await runMenuAction(page, 'Vandal', 'Randomize name & pfp');
  await page.waitForFunction(() => ![...document.querySelectorAll('.player-card h2')].some((node) => node.textContent.trim() === 'Vandal'), { timeout: 10_000 });
  await wait(400);

  const afterCards = await picturesOn(page, '.player-card');
  assert.equal(afterCards.filter((src) => src.includes('/media/')).length, 0,
    'randomizing a name and picture left an uploaded picture on the host screen: ' + JSON.stringify(afterCards));
  note('"Randomize name & pfp" removes the uploaded picture from the host screen');

  const anywhere = await picturesOn(page, 'body');
  assert.equal(anywhere.filter((src) => src.includes('/media/')).length, 0,
    'a moderated picture is still on screen somewhere: ' + JSON.stringify(anywhere.filter((src) => src.includes('/media/'))));
  note('no moderated picture is left anywhere on the host screen');
  await page.screenshot({ path: out + '/03-after-randomize.png' });

  // And the bytes are gone, not merely unreferenced.
  const snapshot = await state('host', hostKey);
  assert.equal(JSON.stringify(snapshot).includes('/media/'), false, 'the snapshot still carries a moderated picture');
  note('the host snapshot carries no moderated media at all');

  assert.deepEqual(errors, [], 'the page threw: ' + errors.join('; '));
  note('no page errors while moderating');

  console.log('\nbrowser player-media: ' + checks.length + ' checks passed');
} finally {
  await browser.close();
}
