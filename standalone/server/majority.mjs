import { quizPoints } from "./scoring.mjs";

export const MAJORITY_AUTHOR_BONUS = 100;

function finiteElapsed(value, answeringMs) {
  const elapsed = Number(value);
  if (!Number.isFinite(elapsed)) return answeringMs;
  return Math.max(0, Math.min(answeringMs, elapsed));
}

export function buildMajorityResults({
  answers = [],
  selections = [],
  eligiblePlayerIds = [],
  predictedAnswerId = "",
  authorId = "",
  answeringMs = 14000
}) {
  const answerOrder = new Map(answers.map((answer, index) => [answer.id, index]));
  const groupsById = new Map(answers.map((answer) => [answer.id, {
    answerId: answer.id,
    label: answer.label,
    color: answer.color,
    shape: answer.shape,
    text: answer.text,
    playerIds: [],
    count: 0,
    fastestElapsedMs: null,
    averageElapsedMs: null,
    totalElapsedMs: 0
  }]));
  const eligibleSet = new Set(eligiblePlayerIds);
  const restrictToEligible = eligibleSet.size > 0;
  const seenPlayers = new Set();
  const validSelections = [];

  selections.forEach((selection) => {
    if (!selection?.playerId || seenPlayers.has(selection.playerId)) return;
    if (restrictToEligible && !eligibleSet.has(selection.playerId)) return;
    const group = groupsById.get(selection.answerId);
    if (!group) return;
    seenPlayers.add(selection.playerId);
    const elapsedMs = finiteElapsed(selection.elapsedMs, answeringMs);
    const normalized = {
      playerId: selection.playerId,
      answerId: selection.answerId,
      elapsedMs,
      answeredAt: Number(selection.answeredAt || 0)
    };
    validSelections.push(normalized);
    group.playerIds.push(selection.playerId);
    group.count += 1;
    group.totalElapsedMs += elapsedMs;
    group.fastestElapsedMs = group.fastestElapsedMs === null ?
      elapsedMs :
      Math.min(group.fastestElapsedMs, elapsedMs);
  });

  const groups = [...groupsById.values()].map((group) => ({
    ...group,
    averageElapsedMs: group.count ? Math.round(group.totalElapsedMs / group.count) : null
  }));
  const answeredGroups = groups.filter((group) => group.count > 0);
  const topCount = Math.max(0, ...answeredGroups.map((group) => group.count));
  const countLeaders = answeredGroups.filter((group) => group.count === topCount);
  countLeaders.sort((first, second) =>
    first.fastestElapsedMs - second.fastestElapsedMs ||
    first.averageElapsedMs - second.averageElapsedMs ||
    answerOrder.get(first.answerId) - answerOrder.get(second.answerId)
  );
  const winningGroup = countLeaders[0] || null;
  const winningAnswerId = winningGroup?.answerId || null;
  const tiedByVotes = countLeaders.length > 1;
  // Name the rule that actually separated the winner. The sort tries fastest,
  // then average, then the stable answer order, so compare the winner with the
  // best of the other leaders and report the first key that differs. Calling an
  // order tie-break a speed win told players something untrue about their game.
  let tieBreakReason = "none";
  if (winningAnswerId && tiedByVotes) {
    const runnerUp = countLeaders[1];
    if (winningGroup.fastestElapsedMs !== runnerUp.fastestElapsedMs) tieBreakReason = "fastest";
    else if (winningGroup.averageElapsedMs !== runnerUp.averageElapsedMs) tieBreakReason = "average";
    else tieBreakReason = "order";
  }

  const playerResults = validSelections.map((selection) => {
    const correct = Boolean(winningAnswerId && selection.answerId === winningAnswerId);
    return {
      ...selection,
      correct,
      points: quizPoints(correct, selection.elapsedMs, answeringMs)
    };
  });

  const expectedPlayerCount = restrictToEligible ? eligibleSet.size : seenPlayers.size;
  const unanimous = Boolean(
    winningAnswerId &&
    expectedPlayerCount > 0 &&
    validSelections.length === expectedPlayerCount &&
    validSelections.every((selection) => selection.answerId === winningAnswerId)
  );
  const predictionMatched = Boolean(winningAnswerId && predictedAnswerId === winningAnswerId);
  const authorBonusAwarded = Boolean(authorId && unanimous && predictionMatched);

  return {
    groups: groups.sort((first, second) =>
      second.count - first.count ||
      (first.fastestElapsedMs ?? Number.POSITIVE_INFINITY) - (second.fastestElapsedMs ?? Number.POSITIVE_INFINITY) ||
      answerOrder.get(first.answerId) - answerOrder.get(second.answerId)
    ),
    answeredCount: validSelections.length,
    eligiblePlayerCount: expectedPlayerCount,
    topCount,
    winningAnswerId,
    tiedByVotes,
    tieBrokenBySpeed: tieBreakReason === "fastest" || tieBreakReason === "average",
    tieBreakReason,
    predictedAnswerId: predictedAnswerId || null,
    predictionMatched,
    unanimous,
    authorId: authorId || null,
    authorBonus: authorBonusAwarded ? MAJORITY_AUTHOR_BONUS : 0,
    authorBonusAwarded,
    playerResults
  };
}
