// Probe: does the time-threshold Ultimate work in a NON-claim-gated phase?
// Spam host pokes during "lobby" (before host/start) for >5s. Lobby is in
// allowPhases but NOT in LIVE_GAME_PHASES, so no question-wide claim applies.
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const dir = process.cwd();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gahookz-probe-'));
const env = { ...process.env, HOST: '127.0.0.1', PORT: '3212', NODE_ENV: 'development',
  GAHOOKZ_BASE_URL: 'http://127.0.0.1:3212', GAHOOKZ_CAREER_JOURNAL: path.join(scratch,'c.journal'),
  GAHOOKZ_DRAIN_TIMEOUT_MS: '0', GAHOOKZ_INSTANCE_ID: 'probe-lobby' };
const server = spawn(process.execPath, ['--import','tsx','standalone/server.js'], { cwd: dir, env, stdio:['ignore','pipe','pipe'] });
let log=''; server.stdout.on('data',d=>log+=d); server.stderr.on('data',d=>log+=d);
const BASE='http://127.0.0.1:3212';
async function post(p,b){ const r=await fetch(BASE+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}); return r.json(); }
for(let i=0;i<100;i++){ try{ const h=await post('/api/health',{}); if(h.instance==='probe-lobby')break; }catch{} await new Promise(r=>setTimeout(r,100)); }
const LETTERS='ABCDEFGHJKLMNPQRSTUVWXYZ';
const code='L'+Array.from({length:3},()=>LETTERS[Math.floor(Math.random()*22)]).join('');
const key=(l)=>l+'-'+Math.random().toString(36).slice(2)+Date.now().toString(36);
const hostKey=key('host'), targetKey=key('target');
await post('/api/room',{code,playerKey:hostKey});
await post('/api/player/join',{code,playerKey:hostKey,name:'Host Hank',avatarId:'owl'});
await post('/api/player/join',{code,playerKey:targetKey,name:'Target Terry',avatarId:'zap'});
let snap = await post('/api/state',{code,role:'host',playerKey:hostKey});
console.log('phase before spam:',snap.phase);
const targetId = (snap.players||[]).find(p=>p.name==='Target Terry')?.id;
const t0=Date.now(); let n=0; let kinds={}; let ultimateAt=null;
while(Date.now()-t0 < 6200){
  const res = await post('/api/host/poke',{code,playerKey:hostKey,playerId:targetId});
  n++; const k = res.kind || ('ERR:'+(res.error||'?')); kinds[k]=(kinds[k]||0)+1;
  if(res.kind==='ultimate'){ ultimateAt=Date.now()-t0; console.log('ULTIMATE at t=',ultimateAt,'poke#',n); break; }
  await new Promise(rr=>setTimeout(rr,180));
}
console.log('poke count',n,'kinds',JSON.stringify(kinds));
console.log('ultimate triggered in lobby phase:', ultimateAt!==null);
server.kill('SIGTERM');
setTimeout(()=>{server.kill('SIGKILL');process.exit(0)},1500);
