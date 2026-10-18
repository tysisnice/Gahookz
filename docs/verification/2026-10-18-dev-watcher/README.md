# dev.gahookz.com was dead for six days, and the status command could not see it

- Branch: `agent/dev-supervisor`, merged to `main` 2026-10-18.
- Production touched: **no code deployed**. One container was recreated: the
  **development** service, by name, with `--no-deps`. Production and beta were
  not stopped, replaced or rebuilt.

## What was found

On 2026-10-18 the development site answered nothing: `curl` to
`127.0.0.1:3101` reset the connection. `docker ps` said
`gahookz-prod-gahookz-dev-1  Up 8 days (unhealthy)` with a failing streak of
**107,477** health checks, about six days of them.

Inside the container the server was gone, and its last words were a clean
shutdown:

```
SIGTERM received; refusing new rooms and draining 0 active room(s).
All rooms finished; closing cleanly.
```

The watcher process that should have replaced it was still running, which is
why Docker still called the container "Up" and why `restart: unless-stopped`
never fired.

## Three faults, not one

**1. The watcher would not restart a server that exited cleanly.**
`standalone/dev.mjs` had:

```js
if (!shuttingDown && code !== 0 && signal !== "SIGTERM") { restart }
```

The server *drains and exits with code 0* when something asks it to stop, so
the one case that most needs a relaunch was the one case excluded. The guard
was also redundant: a reload the watcher asks for clears `serverProcess`
first, so this handler only ever sees exits nobody asked for.

**2. Nothing noticed.** `scripts/docker-status.sh` — the status command
`CLAUDE.md` and the runbook both point at — inspected the `gahookz` service
only. It never mentioned dev or beta, so the one command anybody runs could
not have reported a dead development site.

**3. The trigger was the command `CLAUDE.md` already forbids.** The Docker
daemon's own log shows what happened, twice:

```
Oct 12 04:31:59 restarting container …beta-1  exitCode=0 manualRestart=false restartCount=1
Oct 12 04:31:59 restarting container …gahookz-1 exitCode=0 manualRestart=false restartCount=1
Oct 13 04:41:53 … restartCount=2 (both again)
```

Both containers' main processes exited **within the same hundred
microseconds** (`17:31:58.881362` and `17:31:58.881414`), cleanly, and
`manualRestart=false` — so this was not `docker stop` or a Compose command,
which would have said `manualRestart=true`. Production and beta run `node
standalone/server.js` as PID 1; the development container runs the watcher as
PID 1 with the server as its child. A host-side pattern kill matching
`server.js` therefore hits all three: production and beta were restarted by
Docker within a second (**ending any games in progress**, twice), and dev's
inner server died where fault 1 left it dead.

Both nights are nights a night-shift block ran local test servers.
`pkill -f server.js` is the command that does exactly this, and the host sees
the processes inside containers.

## What changed

- **`standalone/dev-supervisor.mjs`** (new): the restart policy, pure and unit
  tested — exponential backoff from 500 ms to a 5 s ceiling, a failure streak
  that resets after a server stays up 10 s, and a give-up after eight quick
  failures that exits the watcher so the container's restart policy can
  replace the whole process instead of lying about being up.
- **`standalone/dev.mjs`**: restarts the server whenever a tracked server
  exits and the watcher did not ask it to, whatever the code or signal, and
  logs the reason, the delay and the attempt number.
- **`standalone/drill-dev-restart.mjs`** (new, `npm run drill:dev-restart`):
  reproduces the outage on port 3197 — SIGTERM to the server child alone, then
  asks whether the site comes back and whether a *new* child exists.
- **`scripts/stop-test-server.sh`** (new): stops the listener on one test port
  and nothing else. Refuses 3101/3102/3103 outright, refuses any port a
  container publishes, prints the command line before stopping it, and waits
  for the process to go.
- **`scripts/docker-status.sh`**: reports every service in the project, asks
  each one's server for its release and revision from inside the container,
  and prints an `ATTENTION` line plus a non-zero exit for anything not
  healthy or not answering.
- **`CLAUDE.md`** rule 5 and **runbook section 3** now name the script instead
  of a `ss | grep` recipe, and say what the pattern kill actually cost.

## Verification

```
npm run drill:dev-restart     # new watcher
{ "ok": true, "port": 3197, "killedServer": 2770605, "replacementServer": 2770652,
  "watcherSurvived": true }
```

Non-vacuity: the same drill against the pre-fix watcher (branch
`agent/host-poke-claim-fix`, which still has it) reports
`recovered=no, new-server-child=(none), watcher still alive: yes` — the outage,
reproduced.

```
npm run check                 # typecheck, 233/233 unit tests, build
bash -n scripts/stop-test-server.sh scripts/docker-status.sh
bash scripts/stop-test-server.sh 3199   # "Nothing is listening on 127.0.0.1:3199."
bash scripts/stop-test-server.sh 3102   # refused: live service
bash scripts/stop-test-server.sh 3110   # refused: published by container /arena
bash scripts/stop-test-server.sh 3197   # stopped a real test server by pid
bash scripts/docker-status.sh           # all three services, with release and revision
```

## Still open

- **Nothing watches health between sessions.** Docker does not restart an
  unhealthy container, and no alert exists. The watcher's give-up now converts
  a hard failure into a container restart, but a container that is up and
  wrong still needs someone to run the status command. See
  [`docs/backlog.md`](../../backlog.md).
- **The night-shift blocks need the same rule.** The fix stops the damage, not
  the cause; whatever ran the pattern kill should use
  `scripts/stop-test-server.sh`. This is for Tyson and the coordinator, not
  something this repository can enforce.
