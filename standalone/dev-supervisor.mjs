// When the development server may be relaunched, and when the watcher should
// give up and let Docker replace the container.
//
// This exists because of a real outage. `dev.mjs` only relaunched the server
// when it exited with a non-zero code *and* not on SIGTERM:
//
//     if (!shuttingDown && code !== 0 && signal !== "SIGTERM") { restart }
//
// The server drains and exits **cleanly** when it is asked to stop, so a
// SIGTERM aimed at the server alone — `pkill -f server.js` while stopping a
// test server is the way this happens, which is why CLAUDE.md forbids it —
// left `code === 0`, matched no restart branch, and killed the development
// site. The watcher stayed alive, so the container kept reporting "Up" and
// `restart: unless-stopped` never fired. dev.gahookz.com was down for eight
// days and 107,477 failed health checks before anyone noticed.
//
// So the rule is now simply: if a server we were tracking goes away and we did
// not ask it to, start another one. The only thing left to decide is how fast
// to retry and when to stop trying, which is what this module answers. It is
// pure — no spawning, no timers, no I/O — so the policy is testable without
// starting a server.

/** First retry delay. Short, because the common case is a one-off kill. */
export const RESTART_BASE_DELAY_MS = 500;
/** Ceiling on the backoff, so a broken build still retries twice a minute. */
export const RESTART_MAX_DELAY_MS = 5000;
/** A server that ran this long counts as healthy; the failure streak resets. */
export const RESTART_STABLE_MS = 10000;
/** Consecutive quick failures before the watcher stops trying. */
export const RESTART_GIVE_UP_AFTER = 8;

/**
 * Track consecutive failures to decide what to do after each exit.
 *
 * Giving up matters as much as retrying: a watcher that stays alive retrying
 * forever is what let the container lie about being healthy. Exiting hands the
 * problem to the container's restart policy, which can rebuild from a clean
 * process, and makes the failure visible in `docker ps`.
 */
export function createRestartPolicy(options = {}) {
  const baseDelayMs = options.baseDelayMs ?? RESTART_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? RESTART_MAX_DELAY_MS;
  const stableAfterMs = options.stableAfterMs ?? RESTART_STABLE_MS;
  const giveUpAfter = options.giveUpAfter ?? RESTART_GIVE_UP_AFTER;
  let failures = 0;

  return {
    /**
     * One tracked server exited without being asked to.
     *
     * @param {{ upForMs: number }} exit how long it had been running
     * @returns {{ action: "restart", delayMs: number, failures: number }
     *          | { action: "give-up", failures: number }}
     */
    exited({ upForMs = 0 } = {}) {
      if (upForMs >= stableAfterMs) failures = 0;
      failures += 1;
      if (failures > giveUpAfter) return { action: "give-up", failures };
      const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (failures - 1));
      return { action: "restart", delayMs, failures };
    },
    /** Consecutive quick failures so far. */
    get failures() {
      return failures;
    }
  };
}

/** How an exit reads in a log line: a signal if there was one, else the code. */
export function describeExit(code, signal) {
  if (signal) return "signal " + signal;
  return "code " + (code ?? "unknown");
}
