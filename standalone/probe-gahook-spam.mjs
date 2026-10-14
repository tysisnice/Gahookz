// Probe: replicate the smoke's host-poke spam sequence and log kinds/timings.
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const dir = process.cwd();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gahookz-probe-'));
const env = { ...process.env, HOST: '127.0.0.1', PORT: '3211', NODE_ENV: 'development',
  GAHOOKZ_BASE_URL: 'http://127.0.0.1:3211', GAHOOKZ_CAREER_JOURNAL: path.join(scratch,'c.journal'),
  GAHOOKZ_DRAIN_TIMEOUT_MS: '0', GAHOOKZ_INSTANCE_ID: 'probe' };
const server = spawn(process.execPath, ['--import','tsx','standalone/server.js'], { cwd: dir, env, stdio:['ignore','pipe','pipe'] });
let log=''; server.stdout.on('data',d=>log+=d); server.stderr.on('data',d=>log+=d);
const BASE='http://127.0.0.1:3211';
async function post(p,b){ const r=await fetch(BASE+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}); return r.json(); }
for(let i=0;i<100;i++){ try{ const h=await post('/api/health',{}); if(h.instance==='probe')break; }catch{} await new Promise(r=>setTimeout(r,100)); }
const room = await post('/api/create',{name:'ProbeHost'});
const hostKey = room.hostKey; const code = room.code;
const target = await post('/api/join',{code,name:'Target'});
const sender = await post('/api/join',{code,name:'Sender'});
await post('/api/host/start',{code,playerKey:hostKey});
let snap = (await post('/api/state',{code,role:'host',playerKey:hostKey}));
console.log('phase', snap.phase);
const targetId = snap.players.find(p=>p.name==='Target').id;
// replicate: one player round-poke on target first (as the smoke does)
const q = await post('/api/question',{code,playerKey:sender.key,text:'Q?',answers:[{text:'a',correct:true},{text:'b',correct:false}]});
await post('/api/player/ready',{code,playerKey:target.key,ready:true});
await post('/api/player/ready',{code,playerKey:sender.key,ready:true});
await post('/api/host/start',{code,playerKey:hostKey});
snap = (await post('/api/state',{code,role:'host',playerKey:hostKey}));
console.log('phase2', snap.phase);
const rp = await post('/api/player/round-poke',{code,playerKey:sender.key,playerId:targetId});
console.log('round-poke kind', rp.kind, rp.error||'');
await new Promise(r=>setTimeout(r,1250));
const t0=Date.now(); let n=0; let kinds={};
while(Date.now()-t0 < 6200){
  const r = await post('/api/host/poke',{code,playerKey:hostKey,playerId:targetId});
  n++; const k = r.kind || ('ERR:'+r.error); kinds[k]=(kinds[k]||0)+1;
  if(r.kind==='ultimate'){ console.log('ULTIMATE at t=',Date.now()-t0,'poke#',n); break; }
  await new Promise(r=>setTimeout(r,180));
}
console.log('poke count',n,'kinds',JSON.stringify(kinds));
server.kill('SIGTERM');
setTimeout(()=>{server.kill('SIGKILL');process.exit(0)},1500);
