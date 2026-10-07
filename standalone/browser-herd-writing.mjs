// Herd answer-writing verification (U18, U19): per-player progress in the player
// cards, the compact "Upload image / Draw image" row under each answer box,
// drafts that survive switching between answers and live updates, the Back
// button closing the drawing dialog, and the image in the voting tile and the
// reveal without naming the author. Disposable server only; writes screenshots
// to docs/verification/2026-09-25-update/herd-writing/.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';

const base = process.env.GAHOOKZ_BASE_URL || 'http://127.0.0.1:3199';
assert.equal(base, 'http://127.0.0.1:3199', 'only runs against the disposable server');
const out = 'docs/verification/2026-09-25-update/herd-writing';
fs.mkdirSync(out, { recursive: true });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gahookz-herd-writing-'));
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
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(clientKey => {
    localStorage.setItem('gahookz-client-key', clientKey);
    for (const mode of ['quiz', 'herd', 'majority', 'host']) localStorage.setItem('gahookz-how-to-play-seen-v2-' + mode, '1');
  }, key);
  await page.goto(base + '/' + code);
  return page;
}
async function shot(page, name, options = {}) { await wait(300); await page.screenshot({ path: `${out}/${name}.png`, ...options }); }
async function noOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 1, `${label}: page scrolls sideways by ${overflow}px`);
}

try {
  // ---- Room: host + five players, Herd, one prompt each --------------------
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
  let snap = await state('host', hostKey);
  assert.equal(snap.phase, 'herd-writing');

  // ---- Layout of the compact picker at three phone sizes -------------------
  for (const vp of [{ name: '390x844', width: 390, height: 844 }, { name: '360x740', width: 360, height: 740 }, { name: '320x568', width: 320, height: 568 }]) {
    const page = await pageFor(keys[0], { ...vp, mobile: true });
    await page.waitForSelector('.herd-answer-writer .image-source-actions');
    const rows = await page.$$eval('.herd-answer-writer', writers => writers.map(writer => {
      const input = writer.querySelector('label input').getBoundingClientRect();
      const picker = writer.querySelector('.image-upload-draw-picker').getBoundingClientRect();
      const buttons = [...writer.querySelectorAll('.image-source-actions > button')].map(button => { const b = button.getBoundingClientRect(); return { top: b.top, left: b.left, right: b.right, height: b.height, clipped: button.scrollWidth > button.clientWidth + 1, text: button.textContent.trim() }; });
      return { gap: picker.top - input.bottom, buttons, width: window.innerWidth };
    }));
    assert.equal(rows.length, 4, `${vp.name}: four answer boxes`);
    for (const row of rows) {
      assert.equal(row.buttons.length, 2, `${vp.name}: two source buttons`);
      assert.deepEqual(row.buttons.map(button => button.text), ['Upload image', 'Draw image']);
      assert(Math.abs(row.buttons[0].top - row.buttons[1].top) < 2, `${vp.name}: buttons are not side by side ${JSON.stringify(row.buttons)}`);
      assert(row.buttons[0].right <= row.buttons[1].left + 1, `${vp.name}: buttons overlap`);
      for (const button of row.buttons) assert(button.left >= 0 && button.right <= row.width && !button.clipped && button.height >= 40, `${vp.name}: button clipped, off screen or too short ${JSON.stringify(button)}`);
      assert(row.gap >= 0 && row.gap < 16, `${vp.name}: the picker should sit just under the answer box, gap ${row.gap}px`);
    }
    await noOverflow(page, `writing ${vp.name}`);
    await shot(page, `writing-empty-${vp.name}`);
    await page.browserContext().close();
  }

  // ---- Player 0 writes four answers in the browser -------------------------
  const writer = await pageFor(keys[0], { width: 390, height: 844, mobile: true });
  await writer.waitForSelector('.herd-answer-writer');
  const writerSel = n => `.herd-answer-writer:nth-of-type(${n})`;
  const writers = await writer.$$('.herd-answer-writer');
  assert.equal(writers.length, 4);
  const inputOf = n => `${writerSel(n)} label input`;
  const nthWriter = async n => (await writer.$$('.herd-answer-writer'))[n - 1];

  // 1: type text, then upload a PNG.
  await writer.type(inputOf(1), 'A tiny hat for every pigeon');
  await (await writer.$(`${writerSel(1)} input[type=file]`)).uploadFile(pngFile(20));
  await writer.waitForSelector(`${writerSel(1)} .image-choice-preview img`);
  // 2: draw instead. Back closes the dialog first, then the drawing is made.
  await writer.type(inputOf(2), 'Mild panic');
  await writer.click(`${writerSel(2)} .image-source-actions > button:nth-child(2)`);
  await writer.waitForSelector('.answer-image-paint-modal .simple-paint-editor__canvas-shell');
  await writer.goBack();
  await writer.waitForFunction(() => !document.querySelector('.answer-image-paint-modal'), { timeout: 5000 });
  assert(await writer.$('.herd-answer-writer'), 'Back from the drawing dialog must stay on the writing screen');
  assert.equal(await writer.$eval(inputOf(2), input => input.value), 'Mild panic', 'Back must not lose the draft');
  await writer.click(`${writerSel(2)} .image-source-actions > button:nth-child(2)`);
  await writer.waitForSelector('.answer-image-paint-modal .simple-paint-editor__canvas-shell');
  const shell = await (await writer.$('.answer-image-paint-modal .simple-paint-editor__canvas-shell')).boundingBox();
  await shot(writer, 'drawing-dialog-390x844');
  await writer.mouse.move(shell.x + shell.width * 0.2, shell.y + shell.height * 0.7);
  await writer.mouse.down();
  await writer.mouse.move(shell.x + shell.width * 0.5, shell.y + shell.height * 0.2, { steps: 12 });
  await writer.mouse.move(shell.x + shell.width * 0.8, shell.y + shell.height * 0.7, { steps: 12 });
  await writer.mouse.up();
  await writer.click('.answer-image-paint-modal .simple-paint-editor__export button');
  await writer.waitForFunction(() => !document.querySelector('.answer-image-paint-modal'), { timeout: 5000 });
  await writer.waitForSelector(`${writerSel(2)} .image-choice-preview img`);
  // 3: text only. 4: text, an image, then removed again.
  await writer.type(inputOf(3), 'Only the left sock');
  await writer.type(inputOf(4), 'Quietly judging you');
  await (await writer.$(`${writerSel(4)} input[type=file]`)).uploadFile(pngFile(200));
  await writer.waitForSelector(`${writerSel(4)} .image-choice-preview img`);
  await writer.click(`${writerSel(4)} .image-choice-preview > button`);
  await writer.waitForFunction(selector => !document.querySelector(selector), {}, `${writerSel(4)} .image-choice-preview img`);

  // Drafts survive a live update: another player saves answers meanwhile,
  // which broadcasts a fresh snapshot to this page.
  const other = await state('player', keys[1]);
  await post('/api/herd/answer', { playerKey: keys[1], questionId: other.ownHerdAssignments[0].questionId, text: 'Somebody else is typing', imageDataUrl: pngDataUrl(300) });
  await wait(700);
  assert.equal(await writer.$eval(inputOf(1), input => input.value), 'A tiny hat for every pigeon', 'text draft survives a live update');
  assert(await writer.$(`${writerSel(1)} .image-choice-preview img`), 'image draft survives a live update');
  assert(await writer.$(`${writerSel(2)} .image-choice-preview img`), 'drawn draft survives a live update');
  assert.equal(await writer.$(`${writerSel(4)} .image-choice-preview img`), null, 'a removed image stays removed');
  const previews = await writer.$$eval('.image-upload-draw-picker.is-compact .image-choice-preview', nodes => nodes.map(node => { const b = node.getBoundingClientRect(); return { w: b.width, h: b.height, right: b.right, vw: window.innerWidth }; }));
  for (const preview of previews) assert(preview.h <= 100 && preview.w <= 330 && preview.right <= preview.vw, `the preview is a small thumbnail: ${JSON.stringify(preview)}`);
  assert.equal(await writer.$eval(`${writerSel(1)} .image-source-actions > button:first-child`, node => node.textContent.trim()), 'Replace image');
  await noOverflow(writer, 'writing with images');
  await (await nthWriter(1)).evaluate(node => node.scrollIntoView({ block: 'start' }));
  await shot(writer, 'writing-image-attached-390x844');
  await (await nthWriter(2)).evaluate(node => node.scrollIntoView({ block: 'start' }));
  await shot(writer, 'writing-drawing-attached-390x844');

  // ---- Submit: progress in the player card, images stored server-side -------
  await writer.click('.herd-submit-all');
  await writer.waitForFunction(() => document.querySelectorAll('.herd-answer-writer.is-submitted').length === 4, { timeout: 15000 });
  const own = await state('player', keys[0]);
  const stored = own.ownHerdAssignments.map(item => item.imageDataUrl);
  assert(stored[0].startsWith('/media/') && stored[1].startsWith('/media/'), 'uploaded and drawn images are stored as media URLs');
  assert.equal(stored[2], '', 'a text-only answer has no image');
  assert.equal(stored[3], '', 'a removed image is cleared on the server');
  for (const url of stored.slice(0, 2)) assert.equal((await fetch(base + url)).status, 200);
  await writer.evaluate(() => window.scrollTo(0, 0));
  const progress = await writer.$$eval('.player-card', cards => cards.map(card => card.textContent.replace(/\s+/g, ' ').trim()));
  assert(progress.some(text => /4\/4 answered|Done/.test(text)), 'player cards show per-player progress: ' + JSON.stringify(progress));
  assert.equal(await writer.$('.herd-preparation-progress'), null, 'the separate progress card is gone');

  // The other four players finish through the API, every answer with a picture.
  const hues = [0, 60, 120, 180, 240, 280, 320, 30];
  let hueIndex = 0;
  for (const key of keys.slice(1)) {
    const view = await state('player', key);
    for (const assignment of view.ownHerdAssignments) {
      await post('/api/herd/answer', { playerKey: key, questionId: assignment.questionId, text: 'Answer ' + (hueIndex + 1) + (hueIndex % 3 === 0 ? ' with a rather long caption to check wrapping' : ''), imageDataUrl: hueIndex % 4 === 3 ? '' : pngDataUrl(hues[hueIndex % hues.length]) });
      hueIndex += 1;
    }
  }
  for (const key of keys) await post('/api/player/ready', { playerKey: key, ready: true });

  // ---- Host review on a desktop screen --------------------------------------
  const host = await pageFor(hostKey, { width: 1280, height: 800 });
  await host.waitForSelector('.herd-review-grid');
  await host.waitForSelector('.herd-review-image');
  await shot(host, 'host-review-1280x800');

  // ---- Voting ---------------------------------------------------------------
  await post('/api/host/start', { playerKey: hostKey });
  await post('/api/host/skip', { playerKey: hostKey });
  snap = await state('host', hostKey);
  assert.equal(snap.phase, 'answering');
  // A viewer who is not an author of any answer in this question, so every tile is votable.
  const viewerIndex = keys.findIndex((_key, index) => index > 0);
  const voterKey = keys[viewerIndex];
  const voter = await pageFor(voterKey, { width: 390, height: 844, mobile: true });
  await voter.waitForSelector('.answer-tile');
  await voter.waitForSelector('.answer-tile-image');
  const voting = await voter.$$eval('.answer-grid .answer-tile', tiles => tiles.map(tile => {
    const image = tile.querySelector('img.answer-tile-image');
    const b = tile.getBoundingClientRect();
    return { hasImage: Boolean(image), loaded: image ? image.complete && image.naturalWidth > 0 : null, alt: image?.alt || '', right: b.right, left: b.left, width: window.innerWidth, imageHeight: image ? image.getBoundingClientRect().height : 0, author: Boolean(tile.querySelector('.herd-answer-author')) };
  }));
  assert(voting.some(tile => tile.hasImage), 'at least one voting tile carries an image');
  for (const tile of voting) {
    assert(tile.left >= 0 && tile.right <= tile.width, 'tile inside the phone width ' + JSON.stringify(tile));
    assert(!tile.hasImage || (tile.loaded && tile.imageHeight <= 125), 'image loaded and bounded ' + JSON.stringify(tile));
    assert.equal(tile.author, false, 'no author shown while voting');
    for (const name of NAMES) assert(!tile.alt.includes(name), 'alt text must not name the author');
  }
  assert.deepEqual([...new Set(voting.filter(tile => tile.hasImage).map(tile => tile.alt))], ['Picture sent with this answer']);
  await noOverflow(voter, 'voting');
  await voter.$eval('.answer-grid', node => node.scrollIntoView({ block: 'center' }));
  await shot(voter, 'voting-tile-image-390x844');
  await shot(voter, 'voting-full-390x844', { fullPage: true });
  await shot(host, 'party-voting-1280x800');
  const hostTiles = await host.$$eval('.answer-grid .answer-tile-image', images => images.map(image => ({ loaded: image.complete && image.naturalWidth > 0, height: image.getBoundingClientRect().height })));
  assert(hostTiles.length >= 1 && hostTiles.every(image => image.loaded && image.height <= 195), 'party screen tiles show bounded images ' + JSON.stringify(hostTiles));

  // ---- Reveal ---------------------------------------------------------------
  const ownView = await state('player', voterKey);
  const choice = ownView.currentQuestion.answers.find(answer => !answer.ownAnswer);
  for (const key of keys) {
    const view = await state('player', key);
    const pick = view.currentQuestion.answers.find(answer => !answer.ownAnswer && answer.id === choice.id) || view.currentQuestion.answers.find(answer => !answer.ownAnswer);
    await post('/api/answer', { playerKey: key, answerId: pick.id });
  }
  await post('/api/host/skip', { playerKey: hostKey });
  snap = await state('host', hostKey);
  assert.equal(snap.phase, 'reveal');
  await voter.waitForSelector('.herd-reveal-breakdown .answer-tile-image');
  const reveal = await voter.$$eval('.herd-reveal-breakdown .answer-tile', tiles => tiles.map(tile => {
    const image = tile.querySelector('img.answer-tile-image');
    const b = tile.getBoundingClientRect();
    return { hasImage: Boolean(image), loaded: image ? image.complete && image.naturalWidth > 0 : null, alt: image?.alt || '', left: b.left, right: b.right, width: window.innerWidth, author: tile.querySelector('.herd-answer-author')?.textContent || '' };
  }));
  assert(reveal.some(tile => tile.hasImage && tile.loaded), 'the reveal shows the images');
  assert(reveal.every(tile => tile.author.includes(' by ') || /by /.test(tile.author)), 'the reveal names every author');
  for (const tile of reveal) {
    assert(tile.left >= 0 && tile.right <= tile.width, 'reveal tile inside the phone width');
    for (const name of NAMES) assert(!tile.alt.includes(name), 'the alt text never names the author, even at the reveal');
  }
  await noOverflow(voter, 'reveal');
  await voter.$eval('.herd-reveal-breakdown', node => node.scrollIntoView({ block: 'start' }));
  await shot(voter, 'reveal-image-390x844');
  await shot(voter, 'reveal-full-390x844', { fullPage: true });
  await host.waitForSelector('.herd-reveal-breakdown .answer-tile-image');
  await host.$eval('.herd-reveal-breakdown', node => node.scrollIntoView({ block: 'start' }));
  await shot(host, 'reveal-1280x800');

  assert.deepEqual(errors, [], 'no page errors: ' + errors.join(' | '));
  console.log(JSON.stringify({ ok: true, code, writing: 'compact picker side by side at 390, 360 and 320', stored: stored.map(url => Boolean(url)), votingTilesWithImages: voting.filter(tile => tile.hasImage).length, revealTilesWithImages: reveal.filter(tile => tile.hasImage).length }, null, 2));
} finally {
  await browser.close();
  fs.rmSync(scratch, { recursive: true, force: true });
}
