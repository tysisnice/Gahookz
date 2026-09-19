// Own exactly one disposable listener; never reuse a pre-existing service.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error('Usage: node standalone/test-disposable.mjs command [args]');
const probe = net.createServer();
await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(3199, '127.0.0.1', resolve); });
await new Promise((resolve) => probe.close(resolve));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gahookz-disposable-'));
const env = Object.fromEntries(['PATH', 'HOME', 'LANG', 'DISPLAY', 'XDG_RUNTIME_DIR'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
Object.assign(env, {
  HOST: '127.0.0.1', PORT: '3199', NODE_ENV: 'development',
  GAHOOKZ_BASE_URL: 'http://127.0.0.1:3199', GAHOOKZ_TEST_BASE_URL: 'http://127.0.0.1:3199',
  GAHOOKZ_CAREER_JOURNAL: path.join(scratch, 'career.journal'), GAHOOKZ_DRAIN_TIMEOUT_MS: '0',
  GAHOOKZ_INSTANCE_ID: 'disposable-review', GAHOOKZ_EXPIRY_TEST_PORT: '3199',
  // The shared smoke suite runs twenty-five scripts against one lifetime, and
  // each leaves its rooms behind for the rest of the run. At the production cap
  // of 32 the suite ran out of room slots partway through and later scripts
  // failed to create a room at all -- a property of the harness, not of the
  // server. The cap is raised to its configurable maximum here so the suite
  // measures what it is meant to. Production is untouched: it reads the same
  // variable and is not given one, so it keeps the default 32.
  GAHOOKZ_MAX_ACTIVE_ROOMS: '64'
});
// Tuning knobs a load run needs to set on the server it is measuring. Only
// these two, only when the caller set them explicitly, and after the defaults
// above so an explicit value wins. This is what lets a before/after be
// measured on one build rather than compared across two.
for (const key of ['GAHOOKZ_BROADCAST_FLOOR_MS', 'GAHOOKZ_MAX_ACTIVE_ROOMS']) {
  if (process.env[key] !== undefined) env[key] = process.env[key];
}
const server = spawn(process.execPath, ['--import', 'tsx', 'standalone/server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (data) => { serverLog += data; });
server.stderr.on('data', (data) => { serverLog += data; });
const exited = once(server, 'exit');
try {
  let healthy = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(serverLog);
    try {
      const health = await fetch(env.GAHOOKZ_BASE_URL + '/api/health').then((r) => r.json());
      if (health.instance !== env.GAHOOKZ_INSTANCE_ID) throw new Error('Unexpected listener');
      healthy = true; break;
    } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  if (!healthy) throw new Error('Disposable server did not start: ' + serverLog);
  const child = spawn(command, args, { env, stdio: 'inherit' });
  const [code] = await once(child, 'exit');
  process.exitCode = code ?? 1;
} finally {
  server.kill('SIGTERM');
  const timer = setTimeout(() => server.kill('SIGKILL'), 5000);
  await exited;
  clearTimeout(timer);
  process.stdout.write(serverLog);
  fs.rmSync(scratch, { recursive: true, force: true });
  console.log('Disposable server stopped (owned PID ' + server.pid + ').');
}
