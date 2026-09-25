# Arena — six-point lead and tappable thrown minis (A1, A2)

Agent branch `agent/arena` (commits `2782110`, `f393a13`, `e0f2d0b`),
merged into `orchestrator/2026-09-25-update`. The agent's run ended before it
wrote this record; the orchestrator verified the merge.

## A1 — rules

"For the last game winning tug pull, remove the need to press 3 Gahookz in a
row. Increase the number needed to win overall by 1."

| | Before | After |
| --- | --- | --- |
| Lead to win | 5 | **6** (`ARENA_LEAD_TO_WIN`) |
| Presses per point by lead 0…(win−1) | 1, 1, 1, 2, 3 | 1, 1, 1, 1, **2, 2** (`pressesRequiredAtLead`, published to the client as `pressesByLead`) |
| Presses for a flawless win | 8 | 8 |
| Win reason code | `five-ahead` | `lead` |

Client copy follows the published table ("lead by 6 to win").

## A2 — thrown minis

A Gahook thrown at a duelist by someone outside the duel now appears as a
mini card anywhere below the score header, including the tap zone, with a
throw-back badge. Tapping it Gahooks the sender back through the normal
`/api/player/poke` path (all server rules still apply) and never counts as an
arena tap. Minis from the opponent's own taps remain decorative in the top
band: they arrive several times a second and would make the duel unplayable
if they covered the target.

## Verification (orchestrator, 2026-09-26, disposable servers only)

| Command | Result |
| --- | --- |
| `flock … npm run check` | exit 0 — 195 unit tests (incl. 2,000 seeded arena races) |
| `flock … npm run test:disposable -- bash -c "npm run standalone:smoke:gahooks && npm run standalone:smoke:arena && …"` | exit 0 — six-point lead, press table, bystander Gahook reaches a duelist and can be thrown back |
| `flock … npm run test:disposable -- npm run test:browser:arena` | exit 0 — real duel in two browser contexts; [thrown mini in the tap zone](arena/arena-thrown-minis-390x844.png), [thrown back](arena/arena-gahooked-back-390x844.png), [winner](arena/arena-winner.png), [loser](arena/arena-loser.png) |
