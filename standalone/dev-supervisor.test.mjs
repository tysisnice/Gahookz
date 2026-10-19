// The development watcher's restart policy. See dev-supervisor.mjs for the
// outage that made this necessary: a clean exit was treated as "do not
// restart", so one stray SIGTERM took dev.gahookz.com down for eight days
// while the container still reported itself as up.

import test from "node:test";
import assert from "node:assert/strict";
import {
  RESTART_BASE_DELAY_MS,
  RESTART_GIVE_UP_AFTER,
  RESTART_MAX_DELAY_MS,
  createRestartPolicy,
  describeExit
} from "./dev-supervisor.mjs";

test("a server that goes away is restarted, however it went", () => {
  const policy = createRestartPolicy();
  const decision = policy.exited({ upForMs: 60000 });
  assert.equal(decision.action, "restart", "A long-running server that exits must be replaced");
  assert.equal(decision.delayMs, RESTART_BASE_DELAY_MS);
  assert.equal(decision.failures, 1);
});

test("the backoff grows with each quick failure and stops at the ceiling", () => {
  const policy = createRestartPolicy();
  const delays = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    delays.push(policy.exited({ upForMs: 20 }).delayMs);
  }
  assert.deepEqual(delays, [500, 1000, 2000, 4000, RESTART_MAX_DELAY_MS, RESTART_MAX_DELAY_MS],
    "Doubling delay, capped, so a server that cannot start does not spin");
});

test("a server that stayed up clears the failure streak", () => {
  const policy = createRestartPolicy();
  policy.exited({ upForMs: 20 });
  policy.exited({ upForMs: 20 });
  assert.equal(policy.failures, 2);
  const afterStable = policy.exited({ upForMs: 30000 });
  assert.equal(afterStable.failures, 1, "A healthy run means the next failure starts the count again");
  assert.equal(afterStable.delayMs, RESTART_BASE_DELAY_MS, "and gets the short retry, not the long one");
});

test("the watcher gives up rather than pretend to be healthy", () => {
  const policy = createRestartPolicy();
  for (let attempt = 0; attempt < RESTART_GIVE_UP_AFTER; attempt += 1) {
    assert.equal(policy.exited({ upForMs: 20 }).action, "restart");
  }
  const decision = policy.exited({ upForMs: 20 });
  assert.equal(decision.action, "give-up",
    "After the streak the watcher must exit so the container restart policy takes over");
  assert.equal(decision.failures, RESTART_GIVE_UP_AFTER + 1);
});

test("the policy is configurable so a caller can be strict or patient", () => {
  const policy = createRestartPolicy({ baseDelayMs: 100, maxDelayMs: 150, stableAfterMs: 5, giveUpAfter: 1 });
  assert.equal(policy.exited({ upForMs: 0 }).delayMs, 100);
  assert.equal(policy.exited({ upForMs: 0 }).action, "give-up");
});

test("an exit reads as its signal when it had one, and its code otherwise", () => {
  assert.equal(describeExit(null, "SIGTERM"), "signal SIGTERM");
  assert.equal(describeExit(0, null), "code 0");
  assert.equal(describeExit(1, undefined), "code 1");
  assert.equal(describeExit(null, null), "code unknown");
});
