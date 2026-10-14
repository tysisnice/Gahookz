// Probe: replicate the smoke's live-phase host-poke spam sequence with the
// real API shape (/api/room + client code, /api/player/join, /api/host/start)
// and log HOSTPOKE claim results and SPAMDBG spam-window state.
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const dir = process.cwd();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gahookz-probe-'));
const env = { ...process.env, HOST: '127.0.0.1', PORT: '3211', NODE_ENV: 'development',
  GAHOOKZ_BASE_URL: 'http://127.0.0.1:3211', GAHOOKZ_CAREER_JOURNAL: path.join(scratch,'c.journal'),
  GAHOOKZ_DRAIN_TIMEOUT_MS: '0', GAHOOKZ_INSTANCE_ID: 'probe', GAHOOKZ_DEBUG_SPAM: '1' };
const server = spawn(process.execPath, ['--import','tsx','standalone/server.js'], { cwd: dir, env, stdio:['ignore','pipe','pipe'] });
let log=''; server.stdout.on('data',d=>log+=d); server.stderr.on('data',d=>log+=d);
const BASE='http://127.0.0.1:3211';
async function post(p,b){ const r=await fetch(BASE+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}); return r.json(); }
for(let i=0;i<100;i++){ try{ const h=await post('/api/health',{}); if(h.instance==='probe')break; }catch{} await new Promise(r=>setTimeout(r,100)); }
const LETTERS='ABCDEFGHJKLMNPQRSTUVWXYZ';
const code='P'+Array.from({length:3},()=>LETTERS[Math.floor(Math.random()*22)]).join('');
const key=(l)=>l+'-'+Math.random().toString(36).slice(2)+Date.now().toString(36);
const hostKey=key('host'), targetKey=key('target'), senderKey=key('sender');
let r = await post('/api/room',{code,playerKey:hostKey});
console.log('room create ok:',r.ok, r.error||'');
r = await post('/api/player/join',{code,playerKey:hostKey,name:'Host Hank',avatarId:'owl'});
console.log('host join ok:',r.ok, r.error||'');
await post('/api/host/settings',{code,playerKey:hostKey,maxQuestionsPerPlayer:1});
await post('/api/player/join',{code,playerKey:targetKey,name:'Target Terry',avatarId:'zap'});
await post('/api/player/join',{code,playerKey:senderKey,name:'Sender Sam',avatarId:'frog'});
await post('/api/player/gahook-form',{code,playerKey:senderKey,gahookForm:'croc'});
r = await post('/api/host/lock-setup',{code,playerKey:hostKey});
console.log('lock-setup ok:',r.ok, r.error||'');
// Every connected player needs their questions submitted and ready status.
for (const [who,key] of [['host',hostKey],['target',targetKey],['sender',senderKey]]) {
  r = await post('/api/question',{code,playerKey:key,text:`Probe question from ${who}?`,answers:[{text:'a',correct:true},{text:'b',correct:false}]});
  console.log(`question(${who}) ok:`,r.ok, r.error||'');
  r = await post('/api/player/ready',{code,playerKey:key,ready:true});
  console.log(`ready(${who}) ok:`,r.ok, r.error||'');
}
r = await post('/api/host/start',{code,playerKey:hostKey});
console.log('host start ok:',r.ok, r.error||'');
let snap = await post('/api/state',{code,role:'host',playerKey:hostKey});
console.log('phase after start:',snap.phase);
const targetId = (snap.players||[]).find(p=>p.name==='Target Terry')?.id;
console.log('targetId:',targetId);
const t0=Date.now(); let n=0; let kinds={};
while(Date.now()-t0 < 6200){
  const res = await post('/api/host/poke',{code,playerKey:hostKey,playerId:targetId});
  n++; const k = res.kind || ('ERR:'+(res.error||'?')); kinds[k]=(kinds[k]||0)+1;
  if(res.kind==='ultimate'){ console.log('ULTIMATE at t=',Date.now()-t0,'poke#',n); break; }
  await new Promise(rr=>setTimeout(rr,180));
}
console.log('poke count',n,'kinds',JSON.stringify(kinds));
console.log('--- server log (HOSTPOKE/SPAMDBG) ---');
console.log(log.split('\n').filter(l=>l.includes('HOSTPOKE')||l.includes('SPAMDBG')).join('\n'));
server.kill('SIGTERM');
setTimeout(()=>{server.kill('SIGKILL');process.exit(0)},1500);
