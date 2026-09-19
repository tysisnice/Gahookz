// Disposable PostgreSQL, no host TCP ports, credentials or production config.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { createAccountService } from './server/accounts.mjs';
import { createCareerOutbox } from './server/career-outbox.mjs';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gahookz-pg-review-'));
fs.chmodSync(directory, 0o777);
const name = 'gahookz-review-pg-' + randomUUID();
const docker = (args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const databaseUrl = 'postgresql://postgres@localhost/postgres?host=' + encodeURIComponent(directory);
let service, pool, box;
try {
  docker(['run', '-d', '--name', name, '--network', 'none', '--mount', 'type=bind,source=' + directory + ',target=/var/run/postgresql', '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine']);
  for (let tries = 0; tries < 100; tries++) {
    try { docker(['exec', name, 'pg_isready', '-U', 'postgres']); break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  service = await createAccountService({ databaseUrl, environment: 'production', databaseSsl: false, autoMigrate: true, googleClientId: '', googleClientSecret: '' });
  assert.equal(service.persistence, 'postgres');
  pool = new Pool({ connectionString: databaseUrl });
  const accountId = randomUUID();
  const secondId = randomUUID();
  for (const id of [accountId, secondId]) await pool.query('INSERT INTO accounts (id, display_name) VALUES ($1,$2)', [id, 'Synthetic']);
  const event = { matchId: randomUUID(), accountId, roomCode: 'TEST', gameMode: 'quiz', score: 700, placement: 1, playerCount: 2, statDelta: { gamesPlayed: 1, totalScore: 700 } };
  assert.equal(await service.recordMatch(event), true);
  assert.equal(await service.recordMatch(event), false);
  let stats = await pool.query('SELECT games_played,total_score FROM career_stats WHERE account_id=$1', [accountId]);
  assert.equal(Number(stats.rows[0].games_played), 1);
  assert.equal(Number(stats.rows[0].total_score), 700);
  console.log('Real PostgreSQL migration and duplicate-result transaction passed.');
  await service.close(); service = null; await pool.end(); pool = null;
  const journalPath = path.join(directory, 'career.journal');
  let now = Date.now();
  const deliver = async (result) => {
    service ||= await createAccountService({ databaseUrl, environment: 'production', databaseSsl: false, autoMigrate: false, googleClientId: '', googleClientSecret: '' });
    return service.recordMatch(result);
  };
  box = createCareerOutbox({ journalPath, deliver, now: () => now, timers: { setTimeout: () => 0, clearTimeout: () => {} } });
  docker(['pause', name]);
  const outageEvent = { ...event, matchId: randomUUID() };
  assert.equal(box.accept(outageEvent).ok, true);
  await box.flush();
  assert.equal(box.status().queued, 1);
  box.stop();
  docker(['unpause', name]);
  now += 600_000;
  box = createCareerOutbox({ journalPath, deliver, now: () => now, timers: { setTimeout: () => 0, clearTimeout: () => {} } });
  box.start(); await box.flush();
  assert.equal(box.status().delivered, 1);
  pool = new Pool({ connectionString: databaseUrl });
  stats = await pool.query('SELECT games_played FROM career_stats WHERE account_id=$1', [accountId]);
  assert.equal(Number(stats.rows[0].games_played), 2);
  console.log('Database paused: accepted journal event survived worker recreation and synced once after unpause.');
  await pool.query(`CREATE FUNCTION reject_test_stats() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.account_id = '${secondId}' THEN RAISE EXCEPTION 'synthetic stats failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_test_stats BEFORE INSERT OR UPDATE ON career_stats FOR EACH ROW EXECUTE FUNCTION reject_test_stats()`);
  const partialMatch = randomUUID();
  box.accept({ ...event, matchId: partialMatch });
  box.accept({ ...event, matchId: partialMatch, accountId: secondId });
  await box.flush();
  assert.equal(box.status().queued, 1);
  const partial = await pool.query('SELECT account_id FROM account_match_results WHERE match_id=$1', [partialMatch]);
  assert.equal(partial.rowCount, 1, 'failed aggregate must roll back result insert');
  await pool.query('DROP TRIGGER reject_test_stats ON career_stats; DROP FUNCTION reject_test_stats()');
  now += 600_000; await box.flush();
  const recovered = await pool.query('SELECT account_id FROM account_match_results WHERE match_id=$1', [partialMatch]);
  assert.equal(recovered.rowCount, 2);
  console.log('Partial multi-account transaction failure rolled back; replay recorded each account once.');
} finally {
  box?.stop();
  try { docker(['unpause', name]); } catch {}
  await service?.close(); await pool?.end();
  try { docker(['rm', '-f', name]); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
console.log('Disposable PostgreSQL container and temporary data removed.');
