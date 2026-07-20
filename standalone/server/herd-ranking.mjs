export const HERD_AUTHORED_MAX_POINTS = 500;
export const HERD_RANKING_MAX_POINTS = 500;
export const HERD_ANSWER_PLACEMENT_POINTS = Object.freeze([500, 300, 100]);
export const HERD_PICK_WEIGHTS = Object.freeze([3, 2, 1]);

const HERD_PREDICTION_MATCH_POOL = 300;
const HERD_PREDICTION_ORDER_POOL = 200;

function uniqueValidPicks(answerIds, answerById) {
  const seen = new Set();
  return (Array.isArray(answerIds) ? answerIds : []).slice(0, 3).filter((answerId) => {
    if (!answerById.has(answerId) || seen.has(answerId)) return false;
    seen.add(answerId);
    return true;
  });
}

function predictionBreakdown(selectedGroupIds, collectiveTopGroupIds) {
  const targetCount = collectiveTopGroupIds.length;
  if (!targetCount) {
    return {
      matchedTopThree: 0,
      exactPlacements: 0,
      predictionMatchPoints: 0,
      predictionOrderPoints: 0,
      predictionPoints: 0
    };
  }

  let matchedTopThree = 0;
  let exactPlacements = 0;
  selectedGroupIds.slice(0, targetCount).forEach((groupId, index) => {
    if (collectiveTopGroupIds.includes(groupId)) matchedTopThree += 1;
    if (collectiveTopGroupIds[index] === groupId) exactPlacements += 1;
  });

  const predictionMatchPoints = Math.round(HERD_PREDICTION_MATCH_POOL * matchedTopThree / targetCount);
  const predictionOrderPoints = Math.round(HERD_PREDICTION_ORDER_POOL * exactPlacements / targetCount);
  return {
    matchedTopThree,
    exactPlacements,
    predictionMatchPoints,
    predictionOrderPoints,
    predictionPoints: Math.min(HERD_RANKING_MAX_POINTS, predictionMatchPoints + predictionOrderPoints)
  };
}

export function buildHerdRankingResults({ answers = [], rankings = [] }) {
  const usableAnswers = answers.filter((answer) => answer?.id && answer?.playerId && answer?.text);
  const answerById = new Map(usableAnswers.map((answer) => [answer.id, answer]));

  // Each submission remains a singular answer. That keeps two players who type
  // the same thing independently selectable and makes finale attribution fair.
  const groups = usableAnswers.map((answer) => {
    return {
      id: answer.id,
      answerIds: [answer.id],
      authorIds: [answer.playerId],
      answerText: answer.text,
      imageDataUrl: answer.imageDataUrl || "",
      variants: [answer.text],
      rankScore: 0,
      voteScore: 0,
      firstPlaceVotes: 0,
      secondPlaceVotes: 0,
      thirdPlaceVotes: 0,
      votes: []
    };
  });
  const groupByAnswerId = new Map();
  groups.forEach((group) => group.answerIds.forEach((answerId) => groupByAnswerId.set(answerId, group)));

  const usableRankings = rankings.filter((ranking) => ranking?.playerId && Array.isArray(ranking.answerIds));
  const selectedGroupsByPlayer = new Map();
  usableRankings.forEach((ranking) => {
    const seenGroups = new Set();
    const selectedGroupIds = [];
    uniqueValidPicks(ranking.answerIds, answerById).forEach((answerId, index) => {
      const group = groupByAnswerId.get(answerId);
      if (!group || seenGroups.has(group.id)) return;
      seenGroups.add(group.id);
      selectedGroupIds.push(group.id);
      if (ranking.autoSubmitted) return;
      const rank = index + 1;
      const weight = HERD_PICK_WEIGHTS[index] || 0;
      group.rankScore += weight;
      group.voteScore += weight;
      if (rank === 1) group.firstPlaceVotes += 1;
      if (rank === 2) group.secondPlaceVotes += 1;
      if (rank === 3) group.thirdPlaceVotes += 1;
      group.votes.push({ playerId: ranking.playerId, answerId, rank, weight });
    });
    selectedGroupsByPlayer.set(ranking.playerId, selectedGroupIds);
  });

  const combinedGroups = groups.sort((first, second) =>
    second.voteScore - first.voteScore ||
    second.firstPlaceVotes - first.firstPlaceVotes ||
    second.secondPlaceVotes - first.secondPlaceVotes ||
    second.thirdPlaceVotes - first.thirdPlaceVotes ||
    first.id.localeCompare(second.id)
  );
  combinedGroups.forEach((group, index) => {
    group.rank = index + 1;
    group.voteCount = group.votes.length;
    group.authoredPoints = group.voteCount > 0 ? HERD_ANSWER_PLACEMENT_POINTS[index] || 0 : 0;
    group.answerPoints = group.authoredPoints;
  });

  const votedGroups = combinedGroups.filter((group) => group.voteCount > 0);
  const collectiveTopGroupIds = votedGroups.slice(0, Math.min(3, votedGroups.length)).map((group) => group.id);
  const rankingByPlayerId = new Map(usableRankings.map((ranking) => [ranking.playerId, ranking]));
  const resultPlayerIds = new Set([
    ...usableAnswers.map((answer) => answer.playerId),
    ...usableRankings.map((ranking) => ranking.playerId)
  ]);
  const playerResults = [...resultPlayerIds].map((playerId) => {
    const ranking = rankingByPlayerId.get(playerId);
    const autoSubmitted = !ranking || Boolean(ranking.autoSubmitted);
    const selectedGroupIds = selectedGroupsByPlayer.get(playerId) || [];
    const prediction = autoSubmitted ? predictionBreakdown([], collectiveTopGroupIds) : predictionBreakdown(selectedGroupIds, collectiveTopGroupIds);
    const authoredGroups = combinedGroups.filter((group) => group.authorIds.includes(playerId));
    const answerPoints = authoredGroups.reduce((sum, group) => sum + group.answerPoints, 0);
    const predictionAccuracy = HERD_RANKING_MAX_POINTS ? prediction.predictionPoints / HERD_RANKING_MAX_POINTS : 0;
    return {
      playerId,
      authoredGroupIds: authoredGroups.map((group) => group.id),
      selectedGroupIds,
      selectedAnswerIds: ranking?.answerIds || [],
      answerPoints,
      predictionPoints: prediction.predictionPoints,
      predictionMatchPoints: prediction.predictionMatchPoints,
      predictionOrderPoints: prediction.predictionOrderPoints,
      matchedTopThree: prediction.matchedTopThree,
      exactPlacements: prediction.exactPlacements,
      predictionAccuracy: Math.round(predictionAccuracy * 1000) / 1000,
      autoSubmitted,
      totalPoints: answerPoints + prediction.predictionPoints,
      // Compatibility aliases for older clients and cached snapshots.
      authoredPoints: answerPoints,
      accuracyPoints: prediction.predictionPoints,
      rankingPoints: prediction.predictionPoints,
      rankingAccuracy: Math.round(predictionAccuracy * 1000) / 1000,
      contrarianBonus: 0,
      exactBonus: 0,
      universalTopBonus: 0
    };
  });

  return {
    groups: combinedGroups,
    topGroupIds: collectiveTopGroupIds,
    playerResults,
    rankingCount: usableRankings.filter((ranking) => !ranking.autoSubmitted).length,
    selectionLimit: 3,
    bestAnswer: votedGroups[0] || null
  };
}
