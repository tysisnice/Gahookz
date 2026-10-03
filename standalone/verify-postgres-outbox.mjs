// Disposable PostgreSQL, no host TCP ports, credentials or production config.
//
// Starts postgres:16-alpine with no network and a unix socket in a temporary
// directory, exercises the real account repository against it, and removes the
// container and the directory however the run ends. Run it under the shared
// verification lock; it touches no other container.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
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
const dockerLogs = () => {
  const result = spawnSync('docker', ['logs', name], { encoding: 'utf8' });
  return String(result.stdout || '') + String(result.stderr || '');
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const databaseUrl = 'postgresql://postgres@localhost/postgres?host=' + encodeURIComponent(directory);
const quiet = { warn() {}, log() {} };
const poolErrors = [];
// The probe's own pools see the same idle-connection terminations as the
// server's; an unhandled one would end this process exactly like the bug.
const newPool = () => {
  const created = new Pool({ connectionString: databaseUrl });
  created.on('error', (error) => poolErrors.push(error?.code || error?.message));
  return created;
};

// The image's entrypoint first runs a *temporary* server on this same unix
// socket to initialise the cluster, then shuts it down and starts the real one.
// A connection opened against the temporary server is terminated with 57P01
// when it stops -- which is how the previous version of this probe failed. So
// wait for the entrypoint to report that initialisation is complete and for
// the final server to accept connections, then prove it with a real query.
async function waitForDatabase() {
  const deadline = Date.now() + 120_000;
  let logs = '';
  while (Date.now() < deadline) {
    logs = dockerLogs();
    const afterInit = logs.split('PostgreSQL init process complete; ready for start up.')[1] || '';
    if (/database system is ready to accept connections/.test(afterInit)) {
      const probe = newPool();
      try {
        await probe.query('SELECT 1');
        return;
      } catch {
        // Still starting; try again.
      } finally {
        await probe.end().catch(() => {});
      }
    }
    await delay(250);
  }
  throw new Error('Disposable PostgreSQL did not become ready within 120 s:\n' + logs.slice(-2000));
}

let service, pool, box;
try {
  docker(['run', '-d', '--name', name, '--network', 'none', '--mount', 'type=bind,source=' + directory + ',target=/var/run/postgresql', '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine']);
  await waitForDatabase();
  console.log('Disposable PostgreSQL ready (after its init server stopped).');

  service = await createAccountService({ databaseUrl, environment: 'production', databaseSsl: false, autoMigrate: true, googleClientId: '', googleClientSecret: '', logger: quiet });
  assert.equal(service.persistence, 'postgres');
  pool = newPool();
  const ledger = (await pool.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map((row) => row.version);
  assert.deepEqual(ledger, ['001_accounts', '002_account_profiles'], 'both migrations are applied and recorded');
  const again = await createAccountService({ databaseUrl, environment: 'production', databaseSsl: false, autoMigrate: true, googleClientId: '', googleClientSecret: '', logger: quiet });
  await again.close();
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n, 2, 'a second start applies nothing twice');
  console.log('Numbered migrations 001 and 002 applied once, recorded in schema_migrations, idempotent on restart.');

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

  // An idle pooled connection terminated by the server (57P01) must not end
  // the process; the next query reconnects.
  await pool.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND backend_type = 'client backend'");
  await delay(300);
  const survivor = await service.recordMatch({ ...event, matchId: randomUUID() });
  assert.equal(survivor, true, 'the account pool reconnects after its idle connections were terminated');
  console.log('Idle connections terminated by the server (57P01): process kept running, pool reconnected.');

  // Saved profile, saved custom Gahooks and deletion on the real schema.
  const profileTarget = randomUUID();
  await pool.query('INSERT INTO accounts (id, display_name) VALUES ($1,$2)', [profileTarget, 'Profile']);
  await pool.query("INSERT INTO account_identities (provider, provider_subject, account_id) VALUES ('dev', $1, $2)", ['probe-' + profileTarget, profileTarget]);
  await pool.query("INSERT INTO account_sessions (token_hash, account_id, expires_at) VALUES ($1, $2, now() + interval '1 day')", ['a'.repeat(64), profileTarget]);
  await pool.query("INSERT INTO account_entitlements (account_id, entitlement_key, quantity) VALUES ($1, 'custom_gahook_slot', 1)", [profileTarget]);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await service.saveProfile(profileTarget, { playerName: 'Probe Player', avatarId: 'frog', avatarImageDataUrl: png, gahookForm: 'koala' });
  await service.saveCustomGahook(profileTarget, 2, { name: 'Third slot', frames: [png] });
  assert.equal(await service.recordMatch({ ...event, matchId: randomUUID(), accountId: profileTarget }), true);
  const saved = (await pool.query('SELECT player_name, gahook_form, char_length(avatar_image) AS image FROM account_profiles WHERE account_id=$1', [profileTarget])).rows[0];
  assert.equal(saved.player_name, 'Probe Player');
  assert.equal(saved.gahook_form, 'koala');
  assert.equal(Number(saved.image), png.length);
  const deletion = await service.deleteAccount(profileTarget);
  assert.equal(deletion.deleted, true);
  const remaining = (await pool.query(`SELECT
    (SELECT count(*) FROM accounts WHERE id=$1) + (SELECT count(*) FROM account_identities WHERE account_id=$1) +
    (SELECT count(*) FROM account_sessions WHERE account_id=$1) + (SELECT count(*) FROM career_stats WHERE account_id=$1) +
    (SELECT count(*) FROM account_entitlements WHERE account_id=$1) + (SELECT count(*) FROM account_custom_gahooks WHERE account_id=$1) +
    (SELECT count(*) FROM account_match_results WHERE account_id=$1) + (SELECT count(*) FROM account_profiles WHERE account_id=$1) AS n`, [profileTarget])).rows[0].n;
  assert.equal(Number(remaining), 0, 'deletion cascades through every account table');
  assert.equal(await service.recordMatch({ ...event, matchId: randomUUID(), accountId: profileTarget }), false, 'a late result for a deleted account is dropped, not retried for ever');
  console.log('Saved profile and third-slot Gahook (entitlement) stored; account deletion cascaded through all eight tables.');

  await service.close(); service = null; await pool.end(); pool = null;
  const journalPath = path.join(directory, 'career.journal');
  let now = Date.now();
  const deliver = async (result) => {
    service ||= await createAccountService({ databaseUrl, environment: 'production', databaseSsl: false, autoMigrate: false, googleClientId: '', googleClientSecret: '', logger: quiet });
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
  pool = newPool();
  stats = await pool.query('SELECT games_played FROM career_stats WHERE account_id=$1', [accountId]);
  assert.equal(Number(stats.rows[0].games_played), 3);
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
  console.log('Pool connection errors observed and handled by the probe: ' + poolErrors.length + '.');
} finally {
  box?.stop();
  try { docker(['unpause', name]); } catch {}
  await service?.close().catch(() => {}); await pool?.end().catch(() => {});
  try {
    returnSocketDirectory();
    docker(['rm', '-f', name]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

// The image's entrypoint chowns the socket directory to its postgres user
// (uid 70) and sets the sticky bit, after which this user can delete neither
// the socket files nor the directory. Hand it back before removing the
// container: through the running container, or else through a second
// disposable container that removes itself.
function returnSocketDirectory() {
  const owner = process.getuid() + ':' + process.getgid();
  try {
    docker(['exec', name, 'chown', '-R', owner, '/var/run/postgresql']);
    return;
  } catch {}
  try {
    docker(['run', '--rm', '--name', name + '-cleanup', '--network', 'none', '--mount', 'type=bind,source=' + directory + ',target=/socket', '--entrypoint', 'chown', 'postgres:16-alpine', '-R', owner, '/socket']);
  } catch {}
}
console.log('Disposable PostgreSQL container and temporary data removed.');
