import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const image = process.argv[2];
if (!image?.startsWith('gahookz:review-')) throw new Error('Supply an isolated review image tag.');
const volume = 'gahookz-review-journal-' + randomUUID();
const docker = (args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
docker(['volume', 'create', volume]);
const prefix = `import assert from 'node:assert/strict'; import fs from 'node:fs'; import {createCareerOutbox} from './standalone/server/career-outbox.mjs'; assert.equal(process.getuid(),1000); assert.throws(()=>fs.writeFileSync('/app/readonly-check','x'),{code:'EROFS'}); `;
function run(code) {
  process.stdout.write(docker(['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--mount', 'type=volume,source=' + volume + ',target=/app/data', '--entrypoint', 'node', image, '--input-type=module', '-e', prefix + code]));
}
try {
  run(`const box=createCareerOutbox({journalPath:'/app/data/career.journal',deliver:async()=>{throw Error('synthetic outage')},timers:{setTimeout:()=>0,clearTimeout:()=>{}}}); assert.equal(box.accept({matchId:'synthetic-match',accountId:'synthetic-account'}).ok,true); await box.flush(); assert.equal(box.status().queued,1); box.compact(); box.stop(); console.log('Read-only non-root image: durable journal acceptance and compaction passed.');`);
  run(`const seen=[]; const box=createCareerOutbox({journalPath:'/app/data/career.journal',now:()=>Date.now()+600000,deliver:async(event)=>seen.push(event.matchId)}); box.start(); await box.flush(); assert.deepEqual(seen,['synthetic-match']); box.stop(); console.log('Replacement container replayed the accepted result from its persistent volume.');`);
} finally { docker(['volume', 'rm', volume]); }
console.log('Disposable journal volume removed.');
