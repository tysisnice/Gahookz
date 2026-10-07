// Captures the live-game screens (host, player) at phone and desktop sizes.
// Run: npm run test:disposable -- node docs/verification/2026-09-25-update/ui-game/capture-shots.mjs
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const base = process.env.GAHOOKZ_BASE_URL || 'http://127.0.0.1:3199';
assert.equal(base, 'http://127.0.0.1:3199');
const out = 'docs/verification/2026-09-25-update/ui-game';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const code = 'UIGM';
const keys = ['host', 'a', 'b', 'c'].map((n) => code + '-' + n);
const names = ['Tysisnice', 'Alpha', 'Bravo', 'Charlie'];

async function post(path, body = {}) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, ...body }) });
  const data = await response.json();
  assert.equal(data.ok, true, path + ': ' + JSON.stringify(data));
  return data;
}

await post('/api/room', { playerKey: keys[0], intent: 'host' });
await post('/api/host/settings', { playerKey: keys[0], gameMode: 'majority', roundPreset: 'quick', approveQuestions: false });
for (const [i, key] of keys.entries()) await post('/api/player/join', { playerKey: key, name: names[i], avatarId: ['star', 'fox', 'panda', 'banana'][i] });
await post('/api/host/lock-setup', { playerKey: keys[0] });
for (const [i, key] of keys.entries()) {
  await post('/api/question', { playerKey: key, text: i === 0 ? 'Who would lose a staring contest to a statue?' : 'Which of these ridiculous long-winded hypothetical scenarios would most likely end with everyone laughing at the table?', answers: [{ text: 'Pizza', predicted: true }, { text: 'Hot chips' }, { text: 'Chocolate' }, { text: 'Cheese' }] });
  await post('/api/player/ready', { playerKey: key, ready: true });
}
await post('/api/host/start', { playerKey: keys[0] });
await post('/api/host/skip', { playerKey: keys[0] });
await wait(300);
// Alpha and Bravo answer; Tysisnice (host) and Charlie have not.
await post('/api/answer', { playerKey: keys[1], answerId: 'red' });
await post('/api/answer', { playerKey: keys[2], answerId: 'blue' });

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'], timeout: 120000 });
async function shoot(key, label, viewport, mobile) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ ...viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((k) => {
    localStorage.setItem('gahookz-client-key', k);
    for (const m of ['quiz', 'herd', 'majority', 'host']) localStorage.setItem('gahookz-how-to-play-seen-v2-' + m, '1');
  }, key);
  await page.goto(base + '/' + code);
  await page.waitForSelector('.question-copy h1', { timeout: 20000 });
  await wait(600);
  if (label.includes('longest')) await page.evaluate(() => { document.querySelector('.question-copy h1').textContent = 'Who is most likely to win a staring contest against a statue today?'; });
  const info = await page.evaluate(() => ({
    h1Lines: Math.round(document.querySelector('.question-copy h1').getBoundingClientRect().height / parseFloat(getComputedStyle(document.querySelector('.question-copy h1')).lineHeight)),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    tileAvatars: document.querySelectorAll('.answer-tile .answer-choice-player').length,
    answeredRow: document.querySelectorAll('.answered-player').length
  }));
  console.log(label, JSON.stringify(info));
  await page.screenshot({ path: `${out}/${label}.png` });
  await context.close();
}
for (const [vp, tag, mobile] of [[{ width: 390, height: 844 }, '390x844', true], [{ width: 1280, height: 800 }, '1280x800', false]]) {
  await shoot(keys[0], 'host-' + tag, vp, mobile);
  await shoot(keys[1], 'player-' + tag, vp, mobile);
}
await shoot(keys[3], 'player360-longest', { width: 360, height: 800 }, true);
await browser.close();
