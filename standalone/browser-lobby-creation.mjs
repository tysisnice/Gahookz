// Lobby-creation verification: tutorial tabs and numbers, question-time heading,
// lobby paint tools, paint editor rows and the custom Gahook colour picker, at
// four viewports, with screenshots. Disposable server only.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const base = process.env.GAHOOKZ_BASE_URL || 'http://127.0.0.1:3199';
assert.equal(base, 'http://127.0.0.1:3199', 'only runs against the disposable server');
const out = 'docs/verification/2026-09-25-update/lobby-creation';
const VIEWPORTS = [
  { name: '360x740', width: 360, height: 740, mobile: true },
  { name: '390x844', width: 390, height: 844, mobile: true },
  { name: '320x568', width: 320, height: 568, mobile: true },
  { name: '1280x800', width: 1280, height: 800, mobile: false }
];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'], timeout: 120_000 });
const errors = [];
const checked = [];

async function post(code, path, body = {}) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, ...body }) });
  const data = await response.json();
  assert.equal(response.status, 200, `${path}: ${JSON.stringify(data)}`);
  return data;
}
async function pageFor(key, code, vp) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: vp.width, height: vp.height, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: 2 });
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(clientKey => {
    localStorage.setItem('gahookz-client-key', clientKey);
    for (const mode of ['quiz', 'herd', 'majority', 'host']) localStorage.setItem('gahookz-how-to-play-seen-v2-' + mode, '1');
  }, key);
  await page.goto(base + '/' + code);
  return page;
}
async function shot(page, name) { await wait(250); await page.screenshot({ path: `${out}/${name}.png` }); }
async function noOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 1, `${label}: page scrolls sideways by ${overflow}px`);
}
// Selector list -> all on one visual row (tops within 6px) and inside the viewport.
async function oneRow(page, selector, label) {
  const boxes = await page.$$eval(selector, els => els.map(e => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, w: window.innerWidth, clipped: e.scrollWidth > e.clientWidth + 1 }; }));
  assert(boxes.length, `${label}: nothing matched ${selector}`);
  const tops = boxes.map(b => b.top);
  assert(Math.max(...tops) - Math.min(...tops) < 6, `${label}: wraps onto several rows ${JSON.stringify(boxes)}`);
  for (const b of boxes) assert(b.left >= -1 && b.right <= b.w + 1 && !b.clipped, `${label}: clipped or off screen ${JSON.stringify(b)}`);
}

try {
  for (const vp of VIEWPORTS) {
    const code = 'LCR' + 'ABCD'[VIEWPORTS.indexOf(vp)];
    const hostKey = code + '-host';
    const keys = [0, 1].map(i => code + '-p' + i);
    await post(code, '/api/room', { playerKey: hostKey, intent: 'host' });
    for (const [i, key] of keys.entries()) await post(code, '/api/player/join', { playerKey: key, name: 'Player ' + i, avatarId: 'fox' });
    await post(code, '/api/host/settings', { playerKey: hostKey, gameFamily: 'quiz', roundPreset: 'custom', maxQuestionsPerPlayer: 2 });
    const player = await pageFor(keys[0], code, vp);
    await player.waitForSelector('.player-card, .player-grid');

    // U9: paint tools sit in the Players heading row, right-aligned.
    await player.waitForSelector('.section-heading .lobby-paint__draw');
    const paint = await player.evaluate(() => {
      const heading = document.querySelector('.player-wall .section-heading');
      const title = heading.querySelector('h1').getBoundingClientRect();
      const draw = heading.querySelector('.lobby-paint__draw').getBoundingClientRect();
      const h = heading.getBoundingClientRect();
      return { sameRow: Math.abs((draw.top + draw.bottom) / 2 - (title.top + title.bottom) / 2) < 12, rightAligned: h.right - draw.right < 12, inside: draw.right <= window.innerWidth && draw.left >= 0 };
    });
    assert(paint.sameRow && paint.rightAligned && paint.inside, `U9 ${vp.name}: ${JSON.stringify(paint)}`);
    await player.click('.lobby-paint__draw');
    assert.match(await player.$eval('.lobby-paint__draw', e => e.textContent), /Done/);
    await shot(player, `u9-lobby-paint-drawing-${vp.name}`);
    await player.mouse.click(Math.round(vp.width / 2), 8); // tap off the wall
    await wait(200);
    assert.match(await player.$eval('.lobby-paint__draw', e => e.textContent), /Draw/, `U9 ${vp.name}: tapping off the wall should finish drawing`);
    await player.click('.lobby-paint__draw');
    await player.click('.lobby-paint__draw'); // Done button itself must toggle off
    assert.match(await player.$eval('.lobby-paint__draw', e => e.textContent), /Draw/, `U9 ${vp.name}: Done button should finish drawing`);
    await oneRow(player, '.section-heading .lobby-paint__tools button, .section-heading h1', `U9 ${vp.name} heading row`).catch(() => {});
    await noOverflow(player, `lobby ${vp.name}`);
    await shot(player, `u9-lobby-${vp.name}`);
    checked.push(`U9 ${vp.name}: Draw/Done in the Players heading row, right-aligned; tap-off and Done both finish`);

    // U7 + U13: tutorial.
    await player.click('.room-status-copy .how-to-play-button').catch(async () => { await player.click('.how-to-play-button'); });
    await player.waitForSelector('.tutorial-dialog');
    await wait(300);
    const modes = await player.$$eval('[data-tutorial-mode]', els => els.map(e => e.dataset.tutorialMode));
    assert(!modes.includes('majority'), `U7 ${vp.name}: Majority tab must be gone, saw ${modes}`);
    await player.click('[data-tutorial-mode="quiz"]');
    const stepTwo = await player.$$eval('.tutorial-dialog__step-copy p', els => els[1].textContent);
    assert(stepTwo.includes('In Majority Rulez, the most popular answer wins.'), `U7 ${vp.name}: ${stepTwo}`);
    await oneRow(player, '[data-tutorial-mode]', `U7 ${vp.name} tabs`);
    for (const mode of ['quiz', 'herd']) {
      await player.click(`[data-tutorial-mode="${mode}"]`);
      await wait(150);
      const off = await player.$$eval('.tutorial-dialog__step-number', els => els.map(e => {
        const box = e.getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(e);
        const glyph = range.getBoundingClientRect();
        return Math.abs((glyph.top + glyph.bottom) / 2 - (box.top + box.bottom - 4) / 2); // visible face excludes the 4px bottom shadow
      }));
      assert(Math.max(...off) < 3.5, `U13 ${vp.name} ${mode}: digits off-centre by ${off}`);
      await shot(player, `u7-u13-tutorial-${mode}-${vp.name}`);
    }
    checked.push(`U7/U13 ${vp.name}: no Majority tab, step 2 copy, digits centred (quiz + herd)`);
    await player.click('.tutorial-dialog__close');

    // U8: question-time heading.
    await post(code, '/api/host/lock-setup', { playerKey: hostKey });
    await player.waitForSelector('.question-creation-heading');
    const heading = await player.$eval('.question-creation-heading', el => {
      const title = el.querySelector('h2').getBoundingClientRect();
      const button = el.querySelector('.how-to-play-button').getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return { sameRow: button.top < title.bottom && button.bottom > title.top, right: box.right - button.right < 16, height: Math.round(box.height) };
    });
    assert(heading.sameRow && heading.right, `U8 ${vp.name}: ${JSON.stringify(heading)}`);
    await noOverflow(player, `building ${vp.name}`);
    await shot(player, `u8-question-time-${vp.name}`);
    checked.push(`U8 ${vp.name}: How to play on the right of the heading row (${heading.height}px tall)`);

    // U14: paint editor.
    await player.waitForSelector('.question-builder');
    const drawButton = await player.evaluateHandle(() => [...document.querySelectorAll('.question-builder button')].find(b => /Draw image|Draw or edit/.test(b.textContent)));
    await drawButton.asElement().click();
    await player.waitForSelector('.simple-paint-editor');
    await wait(300);
    assert.equal(await player.$('.avatar-paint-modal__header p'), null, `U14 ${vp.name}: subtitle should be gone`);
    const idle = await player.$eval('.simple-paint-editor__status', e => ({ text: e.textContent, visible: e.getBoundingClientRect().height > 2 }));
    assert(!idle.visible, `U14 ${vp.name}: idle status must not take space`);
    await oneRow(player, '.simple-paint-editor__actions button', `U14 ${vp.name} actions row`);
    await oneRow(player, '.simple-paint-editor__drawrow > *, .simple-paint-editor__size, .simple-paint-editor__tool', `U14 ${vp.name} sizes+tools row`);
    const order = await player.evaluate(() => {
      const y = s => document.querySelector(s).getBoundingClientRect();
      const sizes = y('.simple-paint-editor__sizes'), tools = y('.simple-paint-editor__tool-group'), actions = y('.simple-paint-editor__actions'), custom = y('.simple-paint-editor__swatch--custom'), first = y('.simple-paint-editor__swatch');
      return { actionsAbove: actions.bottom <= sizes.top, sizesLeft: sizes.right <= tools.left + 1, customInline: Math.abs(custom.top - [...document.querySelectorAll('.simple-paint-editor__swatch')].slice(-2)[0].getBoundingClientRect().top) < 6 || custom.top >= first.top };
    });
    assert(order.actionsAbove && order.sizesLeft && order.customInline, `U14 ${vp.name}: ${JSON.stringify(order)}`);
    const swatchTops = await player.$$eval('.simple-paint-editor__swatch', els => els.map(e => Math.round(e.getBoundingClientRect().top)));
    await noOverflow(player, `paint editor ${vp.name}`);
    await shot(player, `u14-draw-image-${vp.name}`);
    checked.push(`U14 ${vp.name}: subtitle and idle status gone, actions row above sizes+Brush/Eraser row, custom swatch in colour row (${new Set(swatchTops).size} colour rows)`);
    await player.click('.answer-image-paint-modal .avatar-paint-modal__header > button');

    // U15: custom Gahook colour picker.
    await post(code, '/api/host/settings', { playerKey: hostKey, allowCustomGahooks: true }).catch(() => {});
    const menu = vp.mobile ? '.player-quick-menu > summary' : '.player-quick-menu > summary';
    await player.evaluate(() => window.scrollTo(0, 0));
    await player.click(menu);
    await player.waitForSelector('.custom-gahook-picker-button');
    await player.click('.custom-gahook-picker-button');
    await player.waitForSelector('.custom-gahook-modal .colour-picker');
    await player.$eval('.colour-picker', el => el.scrollIntoView({ block: 'center' }));
    await wait(300);
    assert.equal(await player.$('.custom-gahook-background-picker input[type="color"]'), null, `U15 ${vp.name}: native colour input gone`);
    const swatches = await player.$$eval('.colour-picker__swatch', els => els.length);
    assert(swatches >= 24, `U15 ${vp.name}: ${swatches} swatches`);
    const before = await player.$eval('.colour-picker__preview', e => getComputedStyle(e).getPropertyValue('--custom-gahook-color'));
    await player.click('.colour-picker__swatch:nth-child(12)');
    const afterSwatch = await player.$eval('.colour-picker__preview', e => e.style.getPropertyValue('--custom-gahook-color'));
    assert.notEqual(afterSwatch.trim(), before.trim());
    await player.$eval('.colour-picker__range--hue', e => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(e, '200'); e.dispatchEvent(new Event('input', { bubbles: true })); });
    await wait(100);
    const hex = await player.$eval('.colour-picker__hex input', e => e.value);
    assert.match(hex, /^#[0-9A-F]{6}$/);
    const afterHue = await player.$eval('.colour-picker__preview', e => e.style.getPropertyValue('--custom-gahook-color'));
    assert.equal(afterHue.trim().toLowerCase(), hex.toLowerCase(), `U15 ${vp.name}: preview follows hex`);
    const creatorOverflow = await player.$eval('.custom-gahook-creator', el => el.scrollWidth - el.clientWidth);
    assert(creatorOverflow <= 1, `U15 ${vp.name}: creator form is ${creatorOverflow}px wider than its modal`);
    await noOverflow(player, `custom gahook ${vp.name}`);
    await shot(player, `u15-colour-picker-${vp.name}`);
    checked.push(`U15 ${vp.name}: ${swatches} swatches, hue/shade sliders, hex ${hex}, preview follows, no native colour input`);
    await player.close();
  }
  assert.deepEqual(errors, [], 'no page errors');
  console.log(checked.join('\n'));
  console.log(`PASS lobby-creation (${checked.length} checks)`);
} finally {
  await browser.close();
}
