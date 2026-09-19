import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer';
const base = process.env.GAHOOKZ_BASE_URL || 'http://127.0.0.1:3199';
assert.equal(base, 'http://127.0.0.1:3199');
const out = 'docs/verification/2026-09-19-desktop-ui';
const errors = [];
const browser = await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const wait = ms => new Promise(r=>setTimeout(r,ms));
async function post(code,path,body={}) {
  const r = await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code,...body})});
  const data=await r.json(); assert.equal(r.status,200,`${path}: ${JSON.stringify(data)}`); return data;
}
async function pageFor(key,code) {
  const context=await browser.createBrowserContext(); const page=await context.newPage();
  await page.setViewport({width:1440,height:1000});
  page.on('pageerror',e=>errors.push(e.message));
  await page.evaluateOnNewDocument(key=>{
    localStorage.setItem('gahookz-client-key',key);
    for(const mode of ['quiz','herd','majority','host']) localStorage.setItem('gahookz-how-to-play-seen-v2-'+mode,'1');
  },key);
  await page.goto(base+'/'+code); await page.waitForSelector('.host-topbar'); return page;
}
async function capture(page,name) { await wait(250); await page.screenshot({path:`${out}/${name}.png`,fullPage:true}); }
async function fits(page) { assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'page overflows'); }
try {
 for(const mode of ['quiz','herd']) {
  const code=mode==='quiz'?'DXQA':'DXHA', hostKey=code+'-host', keys=Array.from({length:3},(_,i)=>code+'-p'+i);
  await post(code,'/api/room',{playerKey:hostKey,intent:'host'});
  for(const [i,key] of keys.entries()) await post(code,'/api/player/join',{playerKey:key,name:'Player '+i,avatarId:'fox'});
  const host=await pageFor(hostKey,code), player=await pageFor(keys[0],code);
  const state=()=>post(code,'/api/state',{playerKey:hostKey,role:'host'});
  await post(code,'/api/host/settings',{playerKey:hostKey,gameFamily:mode,roundPreset:'custom',maxQuestionsPerPlayer:1});
  if(mode==='quiz') {
   await player.bringToFront(); await wait(400);
   await player.click('.lobby-paint__draw');
   const canvas=await player.$('.lobby-paint__canvas'); const rect=await canvas.boundingBox();
   await player.mouse.move(rect.x+40,rect.y+60); await player.mouse.down();
   await player.mouse.move(rect.x+130,rect.y+100,{steps:8}); await player.mouse.up(); await wait(300);
   assert((await state()).whiteboardStrokes.length>0,'browser painting round trips');
   await player.click('.lobby-paint__draw');
   await player.click('.player-quick-menu > summary');
   assert.equal(await player.$$eval('.custom-gahook-picker-button',a=>a.length),2);
   await player.click('.custom-gahook-picker-button'); await player.waitForSelector('.custom-gahook-modal');
   assert(await player.evaluate(()=>document.querySelector('.custom-gahook-frame-tabs').getBoundingClientRect().top>=document.querySelector('.simple-paint-editor canvas').getBoundingClientRect().bottom),'poses below canvas');
   await capture(player,'custom-gahook-creator');
   await player.evaluate(()=>[...document.querySelectorAll('.custom-gahook-modal button')].find(b=>b.textContent.includes('Cancel')).click());
   await player.click('.player-quick-menu > summary');
   await player.evaluate(()=>[...document.querySelectorAll('.player-quick-menu button')].find(b=>b.textContent==='Settings').click());
   await player.waitForSelector('.player-settings-modal');
   assert((await player.$$('[role="switch"]')).length>=2); await capture(player,'player-settings');
   await player.keyboard.press('Escape');
   console.log('PASS browser paint, two custom slots, poses below canvas, player settings switches');
  }
  // All three tutorial modes must use the same desktop shell and centered digits.
  await wait(500); await player.bringToFront(); await player.click('.room-status-copy .how-to-play-button'); await player.waitForSelector('.tutorial-dialog');
  const widths=[];
  for(const tutorial of ['quiz','majority','herd']) {
   await player.click(`[data-tutorial-mode="${tutorial}"]`);
   widths.push(await player.$eval('.tutorial-dialog',e=>e.getBoundingClientRect().width));
   assert(await player.$eval('.tutorial-dialog__step-number',e=>getComputedStyle(e).justifyContent==='center'));
  }
  assert.equal(new Set(widths).size,1); await capture(player,mode+'-tutorial');
  await player.click('.tutorial-dialog__close');
  await post(code,'/api/host/lock-setup',{playerKey:hostKey});
  await player.waitForSelector('.question-builder');
  for(const width of [1440,1024,820]) {
   await player.setViewport({width,height:1000}); await fits(player);
   const sizes=await player.evaluate(()=>({question:document.querySelector('.host-control-panel').getBoundingClientRect().width,card:document.querySelector('.player-card').getBoundingClientRect().width}));
   assert(sizes.question>=sizes.card-2,JSON.stringify(sizes));
   await capture(player,mode+'-writing-'+width);
  }
  await player.setViewport({width:1440,height:1000});
  for(const [i,key] of keys.entries()) {
   await post(code,'/api/question',{playerKey:key,text:'What would Player '+i+' choose?',answers:mode==='herd'?[]:[{text:'Yes',correct:true},{text:'No',correct:false}]});
   await post(code,'/api/player/ready',{playerKey:key,ready:true});
  }
  await post(code,'/api/host/start',{playerKey:hostKey});
  if(mode==='herd') {
   await player.waitForSelector('.herd-answer-writer');
   assert.equal(await player.$$eval('.herd-writing-roster .player-card',a=>a.length),3);
   assert(await player.$('.herd-answer-workspace .herd-preparation-progress'));
   await player.$$eval('.herd-answer-writer input',inputs=>inputs.forEach((input,i)=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Browser answer '+i);
    input.dispatchEvent(new Event('input',{bubbles:true}));
   }));
   await player.click('.herd-submit-all');
   await player.waitForFunction(()=>document.querySelector('.ready-button')?.classList.contains('is-ready'));
   const own=await post(code,'/api/state',{playerKey:keys[0],role:'player'});
   assert(own.ownHerdAssignments.every(a=>a.submitted)); assert(own.ownPlayer.ready);
   await capture(player,'herd-answer-workshop');
   // Setup phases are untimed; the HTTP host-control smoke verifies their explicit pause refusal.
   await post(code,'/api/host/skip',{playerKey:hostKey});
  }
  await host.waitForSelector('.phase-reading');
  for(const phase of ['reading','answering','reveal']) {
   await host.waitForSelector('.phase-'+phase);
   await host.click('.pause-game-button');
   await wait(180); assert((await state()).paused,phase+' paused');
   await host.click('.pause-game-button'); await wait(180); assert(!(await state()).paused);
   if(phase==='answering') {
    await player.waitForSelector('.answer-grid button:not(:disabled)');
    await player.click('.answer-grid button:not(:disabled)');
    await wait(200); assert((await state()).answerCount>=1);
    const labels=await player.$$eval('.leaderboard-gahook',a=>a.map(e=>e.textContent)); assert(labels.every(t=>t==='Gahook'));
   }
   await capture(player,mode+'-'+phase);
   if(phase==='reveal') {
    await player.waitForSelector('.reveal-vote-panel');
    const widths=await player.evaluate(()=>['.reveal-vote-panel','.game-leaderboard-panel'].map(s=>document.querySelector(s).getBoundingClientRect().width));
    assert(Math.abs(widths[0]-widths[1])<=2,JSON.stringify(widths));
    await capture(player,mode+'-results');
   }
   await host.click('.host-skip-phase-button');
  }
  for(let i=0;i<20&&(await state()).phase!=='finished';i++) await post(code,'/api/host/skip',{playerKey:hostKey});
  await player.waitForSelector('.finale-winner-stage');
  await player.evaluate(()=>document.documentElement.classList.add('gahookz-reduced-effects'));
  const snap=await state();
  await post(code,'/api/host/poke',{playerKey:hostKey,playerId:snap.leaderboard[0].id,finalKind:'congrats'});
  await wait(200);
  assert(await player.$$eval('.final-gahook-card',a=>a.every(e=>getComputedStyle(e,'::after').display==='none')));
  assert.equal(await player.$('.previous-game-summary'),null);
  await capture(player,mode+'-finale-reduced');
  await post(code,'/api/host/reset',{playerKey:hostKey});
  await player.waitForSelector('.previous-game-summary'); await capture(player,mode+'-previous-game');
  // Twelve banners exercise the wider grid without twelve browser processes.
  for(let i=3;i<12;i++) await post(code,'/api/player/join',{playerKey:code+'-p'+i,name:'Player '+i,avatarId:'bee'});
  await post(code,'/api/host/lock-setup',{playerKey:hostKey}); await player.waitForSelector('.question-builder');
  await player.waitForFunction(()=>document.querySelectorAll('.player-card').length===12);
  await fits(player); await capture(player,mode+'-12-players');
  const sizes=await player.evaluate(()=>({question:document.querySelector('.host-control-panel').getBoundingClientRect().width,card:document.querySelector('.player-card').getBoundingClientRect().width}));
  assert(sizes.question>=sizes.card-2,JSON.stringify(sizes));
  await host.browserContext().close(); await player.browserContext().close();
  console.log('PASS',mode,'3 and 12 players; 1440/1024/820px; tutorial, writing, browser answer, pause/skip, reveal, reduced finale and lobby summary');
 }
 assert.deepEqual(errors,[]); console.log('PASS no browser exceptions');
} catch(error) { for(const [i,page] of (await browser.pages()).entries()) await page.screenshot({path:`${out}/failure-${Date.now()}-${i}.png`,fullPage:true}).catch(()=>{}); throw error; }
finally { await browser.close(); }
