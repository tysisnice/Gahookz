// Herd report verification: image-only answers, chat during Herd writing and the
// report flow. Disposable server only; writes screenshots to
// docs/verification/2026-09-25-update/herd-report/.
// (Helpers copied from browser-herd-writing.mjs.)
//
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';

const base = process.env.GAHOOKZ_BASE_URL || 'http://127.0.0.1:3199';
assert.equal(base, 'http://127.0.0.1:3199', 'only runs against the disposable server');
const out = 'docs/verification/2026-09-25-update/herd-report';
fs.mkdirSync(out, { recursive: true });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gahookz-herd-report-'));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
const hostKey = code + '-host';
const NAMES = ['Pixel Pat', 'Doodle Dee', 'Scribble Sam', 'Sketch Sky', 'Crayon Cal'];
const keys = NAMES.map((_name, index) => code + '-p' + index);

// A small cartoon face as a real PNG, so the upload path is exercised with a
// genuine file and the pictures look like something in the screenshots.
function facePng(hue, width = 240, height = 160) {
  const hsl = (h, s, l) => {
    const a = s * Math.min(l, 1 - l);
    const f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return [f(0), f(8), f(4)].map(v => Math.round(v * 255));
  };
  const background = hsl(hue, 0.7, 0.86);
  const face = hsl((hue + 40) % 360, 0.9, 0.6);
  const ink = [40, 30, 50];
  const raw = Buffer.alloc((width * 3 + 1) * height);
  const cx = width / 2, cy = height / 2, radius = height * 0.4;
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x += 1) {
      const dx = x - cx, dy = y - cy;
      const distance = Math.hypot(dx, dy);
      let pixel = distance < radius ? face : background;
      if (distance > radius - 3 && distance < radius + 1) pixel = ink;
      const eye = [-radius * 0.38, radius * 0.38].some(ex => Math.hypot(dx - ex, dy + radius * 0.25) < radius * 0.11);
      const smile = dy > radius * 0.15 && Math.abs(Math.hypot(dx, dy - radius * 0.05) - radius * 0.5) < 2.5 && dy > radius * 0.2;
      if (eye || smile) pixel = ink;
      raw.set(pixel, y * (width * 3 + 1) + 1 + x * 3);
    }
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
const pngDataUrl = hue => 'data:image/png;base64,' + facePng(hue).toString('base64');
const pngFile = hue => { const file = path.join(scratch, 'face-' + hue + '.png'); fs.writeFileSync(file, facePng(hue)); return file; };

async function post(pathname, body = {}) {
  const response = await fetch(base + pathname, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, ...body }) });
  const data = await response.json();
  assert.equal(data.ok, true, `${pathname}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}
const state = async (role, playerKey) => (await (await fetch(base + '/api/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, role, playerKey }) })).json());

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'], timeout: 120_000 });
const errors = [];
async function pageFor(key, vp) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: vp.width, height: vp.height, isMobile: Boolean(vp.mobile), hasTouch: Boolean(vp.mobile), deviceScaleFactor: vp.mobile ? 2 : 1 });
  page.on('pageerror', error => { errors.push(error.message); console.log('PAGEERROR', error.message); });
  await page.evaluateOnNewDocument(clientKey => {
    localStorage.setItem('gahookz-client-key', clientKey);
    for (const mode of ['quiz', 'herd', 'majority', 'host']) localStorage.setItem('gahookz-how-to-play-seen-v2-' + mode, '1');
  }, key);
  await page.goto(base + '/' + code);
  return page;
}
async function shot(page, name) { await wait(350); await page.screenshot({ path: `${out}/${name}.png` }); }
async function noOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 1, `${label}: page scrolls sideways by ${overflow}px`);
}
// Click the first visible button whose text matches, optionally inside a scope.
async function clickButton(page, text, scope = 'body') {
  const handle = await page.evaluateHandle((needle, scopeSelector) => [...document.querySelectorAll(scopeSelector + ' button')].find(button => button.textContent.trim().startsWith(needle) && button.getClientRects().length), text, scope);
  const element = handle.asElement();
  assert(element, `no button "${text}" in ${scope}`);
  await element.click();
}
const openMenu = page => page.click('details.host-quick-menu > summary');

try {
  await post('/api/room', { playerKey: hostKey, intent: 'host' });
  await post('/api/host/settings', { playerKey: hostKey, gameMode: 'herd', roundPreset: 'custom', maxQuestionsPerPlayer: 5 });
  for (const [index, key] of keys.entries()) await post('/api/player/join', { playerKey: key, name: NAMES[index], avatarId: 'fox' });
  await post('/api/host/lock-setup', { playerKey: hostKey });
  const prompts = ['What is the worst pizza topping?', 'What would a dog say at a job interview?', 'Name a terrible superpower.', 'What is hiding in the fridge?', 'What do penguins talk about at parties?'];
  for (const [index, key] of keys.entries()) {
    await post('/api/question', { playerKey: key, text: prompts[index], answers: [] });
    await post('/api/player/ready', { playerKey: key, ready: true });
  }
  await post('/api/host/start', { playerKey: hostKey });
  assert.equal((await state('host', hostKey)).phase, 'herd-writing');

  // ---- Chat during Herd writing --------------------------------------------
  const player = await pageFor(keys[0], { width: 390, height: 844, mobile: true });
  await player.waitForSelector('.herd-answer-writer');
  await post('/api/room/chat', { playerKey: keys[1], text: 'Doodle Dee: this prompt is wild' });
  await player.waitForSelector('.social-chat-fab');
  await player.click('.social-chat-fab');
  await player.waitForSelector('.social-chat__message');
  await player.type('.waiting-room-social textarea, .waiting-room-social input[type=text]', 'Pixel Pat writing from the phone');
  await player.keyboard.press('Enter');
  await player.waitForFunction(() => [...document.querySelectorAll('.social-chat__message.is-own')].some(node => node.textContent.includes('writing from the phone')), { timeout: 8000 });
  const chatState = await state('host', hostKey);
  assert(chatState.chatMessages.some(message => message.text.includes('writing from the phone')), 'chat sent from the browser during herd-writing reaches the room');
  await noOverflow(player, 'chat during herd-writing');
  await shot(player, '01-chat-during-herd-writing-390x844');

  // ---- Report a chat message: confirm step, reason, note --------------------
  assert.equal(await player.$('.social-chat__message.is-own .report-button'), null, 'no Report on your own message');
  await player.click('.social-chat__message:not(.is-own) .report-button');
  await player.waitForSelector('.report-modal');
  await player.select('.report-modal select', 'harassment');
  await player.type('.report-modal textarea', 'Please look at this');
  await noOverflow(player, 'report dialog');
  await shot(player, '02-report-confirm-390x844');
  assert.equal((await state('host', hostKey)).reports.length, 0, 'nothing is sent before the confirm step');
  await clickButton(player, 'Send report', '.report-modal');
  await player.waitForFunction(() => document.querySelector('#report-title')?.textContent === 'Report sent', { timeout: 8000 });
  await shot(player, '03-report-sent-390x844');
  await clickButton(player, 'Done', '.report-modal');
  await player.waitForFunction(() => !document.querySelector('.report-modal'));
  let reports = (await state('host', hostKey)).reports;
  assert.equal(reports.length, 1);
  assert.deepEqual([reports[0].subjectKind, reports[0].reason, reports[0].note, reports[0].reporterName], ['chat', 'harassment', 'Please look at this', NAMES[0]]);

  // ---- Report a problem from the player menu --------------------------------
  if (await player.$('.social-chat-minimize')) await player.click('.social-chat-minimize');
  await openMenu(player);
  await shot(player, '04-player-menu-390x844');
  await clickButton(player, 'Report a problem', '.quick-menu-backdrop');
  await player.waitForSelector('.report-modal');
  await clickButton(player, 'Cancel', '.report-modal');
  await player.waitForFunction(() => !document.querySelector('.report-modal'));
  assert.equal((await state('host', hostKey)).reports.length, 1, 'Cancel sends nothing');
  await openMenu(player);
  await clickButton(player, 'Report a problem', '.quick-menu-backdrop');
  await player.waitForSelector('.report-modal');
  await clickButton(player, 'Send report', '.report-modal');
  await player.waitForFunction(() => document.querySelector('#report-title')?.textContent === 'Report sent', { timeout: 8000 });
  await clickButton(player, 'Done', '.report-modal');
  assert.equal((await state('host', hostKey)).reports.length, 2);

  // ---- Host sees the reports in the host menu --------------------------------
  const host = await pageFor(hostKey, { width: 390, height: 844, mobile: true });
  await host.waitForSelector('details.host-quick-menu > summary');
  await openMenu(host);
  await host.waitForFunction(() => [...document.querySelectorAll('.quick-menu-backdrop button')].some(button => /^Reports \(2\)/.test(button.textContent.trim())), { timeout: 8000 });
  await clickButton(host, 'Reports (2)', '.quick-menu-backdrop');
  await host.waitForSelector('.host-reports-modal .host-report');
  assert.equal((await host.$$('.host-reports-modal .host-report')).length, 2);
  assert(await host.$eval('.host-reports-modal', node => node.textContent.includes('this prompt is wild')), 'the host list quotes the reported chat message');
  await noOverflow(host, 'host reports');
  await shot(host, '05-host-reports-390x844');
  await clickButton(host, 'Remove message', '.host-reports-modal');
  await host.waitForFunction(() => document.querySelectorAll('.host-reports-modal .host-report').length === 1, { timeout: 8000 });
  assert(!(await state('host', hostKey)).chatMessages.some(message => message.text.includes('this prompt is wild')), 'Remove message deletes the chat message');
  await clickButton(host, 'Dismiss', '.host-reports-modal');
  await host.waitForFunction(() => !document.querySelector('.host-reports-modal .host-report'), { timeout: 8000 });
  assert.equal((await state('host', hostKey)).reports.length, 0);

  // ---- Image-only answers ----------------------------------------------------
  const hues = [0, 120, 240, 40];
  let hueIndex = 0;
  for (const [index, key] of keys.entries()) {
    const view = await state('player', key);
    for (const assignment of view.ownHerdAssignments) {
      // Players 1 and 2 answer with a picture only.
      const imageOnly = index === 1 || index === 2;
      await post('/api/herd/answer', { playerKey: key, questionId: assignment.questionId, text: imageOnly ? '' : 'Plain answer ' + (hueIndex + 1), imageDataUrl: imageOnly ? pngDataUrl(hues[hueIndex % hues.length]) : '' });
      hueIndex += 1;
    }
    await post('/api/player/ready', { playerKey: key, ready: true });
  }
  await post('/api/host/start', { playerKey: hostKey });
  await post('/api/host/skip', { playerKey: hostKey });
  assert.equal((await state('host', hostKey)).phase, 'answering');
  const answering = await state('host', hostKey);
  const imageOnlyChoices = answering.currentQuestion.answers.filter(answer => !answer.text && answer.imageDataUrl);
  assert(imageOnlyChoices.length >= 1, 'the first question has an image-only answer');
  // A voter who wrote none of these answers.
  let voterKey = '';
  for (const key of keys) {
    const view = await state('player', key);
    if (!view.currentQuestion.answers.some(answer => answer.ownAnswer)) { voterKey = key; break; }
  }
  assert(voterKey, 'a voter who wrote none of the answers exists');
  const voter = await pageFor(voterKey, { width: 390, height: 844, mobile: true });
  await voter.waitForSelector('.answer-tile-image');
  const tiles = await voter.$$eval('.answer-grid .answer-tile', nodes => nodes.map(node => ({ text: node.textContent.trim(), image: Boolean(node.querySelector('img.answer-tile-image')), disabled: node.disabled, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, width: window.innerWidth, height: node.getBoundingClientRect().height })));
  assert.equal(tiles.length, 4);
  assert(tiles.some(tile => tile.image && tile.text === ''), 'an image-only answer renders as a tile with no label text: ' + JSON.stringify(tiles));
  for (const tile of tiles) assert(tile.left >= 0 && tile.right <= tile.width && tile.height > 40, 'tile fits ' + JSON.stringify(tile));
  await noOverflow(voter, 'voting');
  await voter.$eval('.answer-grid', node => node.scrollIntoView({ block: 'center' }));
  await shot(voter, '06-image-only-answer-voting-390x844');
  assert.equal(await voter.$('.answer-grid .report-button'), null, 'no Report buttons on voting tiles (they are tap targets)');

  // ---- Reveal: Report beside a revealed answer --------------------------------
  for (const key of keys) {
    const view = await state('player', key);
    const pick = view.currentQuestion.answers.find(answer => !answer.ownAnswer);
    await post('/api/answer', { playerKey: key, answerId: pick.id });
  }
  await post('/api/host/skip', { playerKey: hostKey });
  assert.equal((await state('host', hostKey)).phase, 'reveal');
  await voter.waitForSelector('.herd-reveal-breakdown .report-button');
  await voter.$eval('.herd-reveal-breakdown', node => node.scrollIntoView({ block: 'start' }));
  await shot(voter, '07-reveal-report-390x844');
  await voter.click('.herd-reveal-breakdown .report-button');
  await voter.waitForSelector('.report-modal');
  await clickButton(voter, 'Send report', '.report-modal');
  await voter.waitForFunction(() => document.querySelector('#report-title')?.textContent === 'Report sent', { timeout: 8000 });
  reports = (await state('host', hostKey)).reports;
  assert.equal(reports.length, 1);
  assert.equal(reports[0].subjectKind, 'answer');
  const results = (await state('host', hostKey)).currentQuestion.herdResults.groups;
  assert(results.filter(group => !group.text && group.imageDataUrl).length >= 1, 'results groups carry image-only answers');

  assert.deepEqual(errors, [], 'no page errors: ' + errors.join(' | '));
  console.log(JSON.stringify({ ok: true, code, imageOnlyTiles: tiles.filter(tile => tile.image && !tile.text).length, reports: reports.length }, null, 2));
} finally {
  await browser.close();
  fs.rmSync(scratch, { recursive: true, force: true });
}
