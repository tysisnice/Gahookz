// Drill: the development watcher must replace a server that goes away.
//
// Reproduces the 2026-10-10 outage. The server child is sent SIGTERM on its
// own — what `pkill -f server.js` does to a dev container, and the reason
// CLAUDE.md forbids that command — and the drill then asks whether the site
// comes back. Before `dev-supervisor.mjs` it never did: the server drained and
// exited cleanly, the watcher's "restart only on a non-zero code" rule skipped
// it, and the container went on reporting itself up for eight days.
//
//     node standalone/drill-dev-restart.mjs
//
// Uses 127.0.0.1:3197 by default (GAHOOKZ_DRILL_PORT to change it) so it never
// touches the real 3101/3102/3103 or the test harness's 3199. It stops exactly
// the processes it started, by PID.

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.GAHOOKZ_DRILL_PORT || 3197);
const healthUrl = `http://127.0.0.1:${port}/api/health`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function healthy() {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitFor(predicate, { attempts = 40, everyMs = 500 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await predicate()) return true;
    await sleep(everyMs);
  }
  return false;
}

// The watcher does not publish its child's PID, so read the kernel's list.
async function serverChildOf(pid) {
  try {
    const children = await readFile(`/proc/${pid}/task/${pid}/children`, "utf8");
    for (const child of children.trim().split(/\s+/).filter(Boolean)) {
      const command = await readFile(`/proc/${child}/cmdline`, "utf8").catch(() => "");
      if (command.includes("server.js")) return Number(child);
    }
  } catch {
    return 0;
  }
  return 0;
}

function fail(watcher, message) {
  console.error("DRILL FAILED: " + message);
  if (watcher?.pid) watcher.kill("SIGTERM");
  process.exitCode = 1;
}

const watcher = spawn(process.execPath, [path.join(rootDir, "standalone", "dev.mjs")], {
  cwd: rootDir,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) }
});
const watcherLog = [];
watcher.stdout.on("data", (chunk) => watcherLog.push(String(chunk)));
watcher.stderr.on("data", (chunk) => watcherLog.push(String(chunk)));

try {
  if (!(await waitFor(healthy))) {
    fail(watcher, "the watcher never served a healthy server on " + healthUrl);
  } else {
    const firstChild = await serverChildOf(watcher.pid);
    if (!firstChild) {
      fail(watcher, "could not find the server child of watcher " + watcher.pid);
    } else {
      // Exactly the outage: the server alone, not the watcher.
      process.kill(firstChild, "SIGTERM");
      const stopped = await waitFor(async () => !(await healthy()), { attempts: 20, everyMs: 250 });
      if (!stopped) fail(watcher, "the server kept serving after SIGTERM, so the drill proves nothing");

      const recovered = await waitFor(healthy, { attempts: 30 });
      const secondChild = await serverChildOf(watcher.pid);
      if (!recovered) {
        fail(watcher, "the site did not come back after the server was killed — this is the 2026-10-10 outage");
      } else if (!secondChild || secondChild === firstChild) {
        fail(watcher, "the site answered but no new server child was started");
      } else {
        console.log(JSON.stringify({
          ok: true,
          port,
          watcher: watcher.pid,
          killedServer: firstChild,
          replacementServer: secondChild,
          watcherSurvived: true,
          note: "A cleanly exiting server is replaced, so a stray SIGTERM cannot take the development site down."
        }, null, 2));
      }
    }
  }
} finally {
  if (watcher.pid) watcher.kill("SIGTERM");
  await sleep(500);
  if (process.exitCode === 1) console.error("--- watcher output ---\n" + watcherLog.join(""));
}
