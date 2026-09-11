# Room recovery and affinity: what it would actually take

Status: **feasibility record only.** Nothing here is implemented, nothing here
changes how the server runs today, and no extra production replica follows from
it. P09 step 7 asks for this assessment to be written down from the new module
boundary rather than guessed at later.

## The constraint this exists inside

> Rooms, players, credentials, timers, chat, drawings and uploaded media exist
> only inside one Node process. Restarting that process ends its rooms.

That is not an accident to be fixed in passing. The 32-room cap, the drain
window on deploys, and the rule against a second production replica all follow
from it. Anything proposed here has to either preserve that model or replace
all three of those at once.

## What a room actually holds

Working through `standalone/server.js`, a live room is four different kinds of
state, and they have very different recovery stories.

**1. Decisions that could be checkpointed.** Phase, current question index,
phase deadline, scores, submitted questions, votes, the Herd assignment plan
and its private display permutation. This is ordinary data. `packages/game-engine`
now holds the phase progression as a pure function of state and time, so a
checkpoint of `{ phase, questionIndex, endsAt, questionCount }` is enough to
resume the round loop correctly, including a deadline that expired while the
process was down.

**2. Credentials.** Host and player keys, admitted credentials, bans. These
live in `server/auth.mjs` and are per-room secrets. They could be checkpointed,
but doing so writes credentials to storage, which is a meaningfully different
security posture from holding them in memory for the life of a room. That is a
decision for the owner, not an implementation detail.

**3. Things that cannot be checkpointed usefully.** Open SSE sockets, phase
timers, the arena's in-flight target tokens, and the live drawing surface. A
socket cannot be moved between processes; a timer is recreated from a deadline,
which is fine; an arena duel mid-race has sub-second state whose value expires
faster than any recovery could complete.

**4. Uploaded media.** Room images and audio are held in the owning process.
These would need shared storage before any recovery could return them, which is
a deployment change, not a code one.

## What would have to be true

- **Checkpoint on transition, not on a timer.** The pure transitions make this
  cheap: write after each phase change rather than sampling a mutable room.
- **A rejoin protocol.** A returning client presents its credential and gets
  the current snapshot. This already exists — it is what reconnect does — so the
  missing half is server-side state, not client-side handling.
- **Expired deadlines resolved on load.** A room resumed after its answering
  phase ended must advance rather than show a negative countdown. `remainingMs`
  and `nextPhase` already behave correctly for this; it is why they clamp.
- **Ownership.** Two processes must never believe they own the same room. With
  one replica this is trivial and worthless; with two it is the entire problem,
  and it needs a lease or a lock, not hope.

## Honest assessment

Recovery **within one process** — surviving a deliberate restart or deploy — is
the achievable half, and the phase work in P09 is most of what it needs. The
cost is checkpoint storage and a decision about persisting credentials.

Recovery **across processes**, which is what would allow a second replica, is
not close. It requires shared media storage, a room ownership lease, and a
socket handover story, and it would remove the single-writer assumption that
every piece of room mutation in `server.js` currently relies on. Nothing about
the current code makes it impossible; it is simply a much larger project than
it appears from the outside, and it should not be started as a side effect of a
refactor.

## What remains true today

A restart still ends every room in progress, and the server still says so. The
drain window on deploys exists precisely because that is honest. Until a
recovery feature exists **and has been tested**, no document, health field or
release note should imply otherwise.
