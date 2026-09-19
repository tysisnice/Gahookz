# Two proposed scoring changes: recorded, not adopted

Status: **evaluated, decision deferred to a playtest.** Neither change is
implemented. The rules that ship are unchanged.

The 2026-09-07 review proposed two alterations to how rounds are scored. The
plan is explicit that these are older backlog decisions and "must not be
silently bundled into the UI merge", so this records what they would actually
do, with worked examples, and stops there.

Reproducible fixtures: `packages/game-engine/test/scoring-alternatives.test.ts`.

## 1. Shared winners on a tied vote

**Today.** A tie is separated by fastest vote, then fastest average, then the
stable answer order. Exactly one answer wins the voter bonus. Herd authors are paid for every vote their own answer receives, including votes for non-winning answers.
Since P02 the reveal says which of those three rules actually decided it, so a
tie settled by answer order is no longer announced as a speed win.

**Worked example.** Two answers, one vote each, both cast at 3,000ms. Speed
cannot separate them, so answer order does. One player is told they lost;
nothing visible to them distinguishes the two answers.

**The alternative.** Give voters for either tied leading answer the voter bonus. Authored-answer points remain vote-proportional. Two voters are rewarded instead of one being
beaten by a rule they cannot observe.

**Assessment.** The argument for it is real, and it is strongest exactly where
the current rule is weakest: a tie that no observable property separates. The
argument against is that shared wins make a leaderboard flatter, and a party
game wants a winner. This is a taste question about how the game *feels*, and
there is no measurement that settles it — which is why it needs people playing,
not more analysis.

## 2. The authored-point denominator

**Today.** An answer earns `500 × votes / eligiblePlayerCount`, and
`eligiblePlayerCount` includes the answer's own author — who is forbidden from
voting for their own answer.

**Worked example.** Four players. An answer receives votes from all three
players who are permitted to vote for it. It earns `round(500 × 3/4)` = **375**,
not 500. A unanimously chosen answer cannot reach the maximum, and the smaller
the room, the larger the penalty: in a four-player room it costs 25% of the
available points.

**Assessment.** This one is less a taste question than a quiet unfairness. The
author is counted in a denominator they are barred from contributing to. The
alternative — divide by eligible voters *excluding* the author — pays the full
500 for the same result, and is what most people would assume is happening.

The reason it is still not changed here: it moves every historical Herd score's
meaning, and the plan is equally explicit that shipped numerical rules stay
until an explicit decision is recorded. Changing it as a side effect of a
refactor is precisely the failure mode being guarded against.

## Recommendation

If only one of these is adopted, adopt the **denominator** change. It corrects
something closer to a defect than a preference, its effect is easy to explain
to players, and the worked example above is the whole argument.

Hold the **shared-winner** change until a session has been observed. The
question it answers — does losing an invisible tie-break feel bad enough to
matter — is not answerable from the code.

## What must happen before either ships

- A playtest with the current rules, watching specifically for tied rounds and
  for reactions to the authored-point total.
- A decision recorded here, with a date and who made it.
- New fixtures asserting the new numbers, and the old ones deleted rather than
  left to rot.

Until then the fixtures in `scoring-alternatives.test.ts` include a guard that
pins the selected shipped scoring examples, so neither of these can arrive by
accident.
