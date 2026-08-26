export const HERD_BEST_ANSWER_POINTS = 500;
export const HERD_AUTHORED_MAX_POINTS = HERD_BEST_ANSWER_POINTS;
export const HERD_RANKING_MAX_POINTS = 0;
export const HERD_ANSWER_PLACEMENT_POINTS = Object.freeze([HERD_BEST_ANSWER_POINTS]);
export const HERD_PICK_WEIGHTS = Object.freeze([1]);

function validFavourite(answerIds, answerById) {
  const answerId = Array.isArray(answerIds) ? answerIds[0] : "";
  return answerById.has(answerId) ? answerId : "";
}

export function buildHerdRankingResults({ answers = [], rankings = [] }) {
  const usableAnswers = answers.filter((answer) => answer?.id && answer?.playerId && answer?.text);
  const answerById = new Map(usableAnswers.map((answer) => [answer.id, answer]));
  const groups = usableAnswers.map((answer) => ({
    id: answer.id,
    answerIds: [answer.id],
    authorIds: [answer.playerId],
    answerText: answer.text,
    imageDataUrl: answer.imageDataUrl || "",
    variants: [answer.text],
    rankScore: 0,
    voteScore: 0,
    voteCount: 0,
    rawVoteCount: 0,
    firstPlaceVotes: 0,
    secondPlaceVotes: 0,
    thirdPlaceVotes: 0,
    votes: []
  }));
  const groupByAnswerId = new Map(groups.map((group) => [group.id, group]));
  const usableRankings = rankings.filter((ranking) => ranking?.playerId && Array.isArray(ranking.answerIds));
  const selectedGroupsByPlayer = new Map();

  usableRankings.forEach((ranking) => {
    const answerId = validFavourite(ranking.answerIds, answerById);
    const group = groupByAnswerId.get(answerId);
    const selectedGroupIds = group ? [group.id] : [];
    selectedGroupsByPlayer.set(ranking.playerId, selectedGroupIds);
    if (!group || ranking.autoSubmitted) return;

    const eligible = !group.authorIds.includes(ranking.playerId);
    group.rawVoteCount += 1;
    group.votes.push({ playerId: ranking.playerId, answerId, rank: 1, weight: eligible ? 1 : 0, eligible });
    if (!eligible) return;
    group.rankScore += 1;
    group.voteScore += 1;
    group.voteCount += 1;
    group.firstPlaceVotes += 1;
  });

  groups.sort((first, second) =>
    second.voteScore - first.voteScore ||
    second.rawVoteCount - first.rawVoteCount ||
    first.id.localeCompare(second.id)
  );

  let previousScore = null;
  let previousRank = 0;
  groups.forEach((group, index) => {
    if (previousScore === null || group.voteScore !== previousScore) {
      previousRank = index + 1;
      previousScore = group.voteScore;
    }
    group.rank = previousRank;
  });

  const winningScore = groups[0]?.voteScore || 0;
  groups.forEach((group) => {
    const isBest = winningScore > 0 && group.voteScore === winningScore;
    group.authoredPoints = isBest ? HERD_BEST_ANSWER_POINTS : 0;
    group.answerPoints = group.authoredPoints;
  });

  const topGroupIds = winningScore > 0 ?
    groups.filter((group) => group.voteScore === winningScore).map((group) => group.id) :
    [];
  const rankingByPlayerId = new Map(usableRankings.map((ranking) => [ranking.playerId, ranking]));
  const resultPlayerIds = new Set([
    ...usableAnswers.map((answer) => answer.playerId),
    ...usableRankings.map((ranking) => ranking.playerId)
  ]);
  const playerResults = [...resultPlayerIds].map((playerId) => {
    const ranking = rankingByPlayerId.get(playerId);
    const authoredGroups = groups.filter((group) => group.authorIds.includes(playerId));
    const answerPoints = authoredGroups.reduce((sum, group) => sum + group.answerPoints, 0);
    const selectedGroupIds = selectedGroupsByPlayer.get(playerId) || [];
    return {
      playerId,
      authoredGroupIds: authoredGroups.map((group) => group.id),
      selectedGroupIds,
      selectedAnswerIds: ranking?.answerIds || [],
      answerPoints,
      predictionPoints: 0,
      predictionMatchPoints: 0,
      predictionOrderPoints: 0,
      matchedTopThree: 0,
      exactPlacements: 0,
      predictionAccuracy: 0,
      autoSubmitted: !ranking || Boolean(ranking.autoSubmitted),
      totalPoints: answerPoints,
      // Compatibility aliases for older cached snapshots.
      authoredPoints: answerPoints,
      accuracyPoints: 0,
      rankingPoints: 0,
      rankingAccuracy: 0,
      contrarianBonus: 0,
      exactBonus: 0,
      universalTopBonus: 0
    };
  });

  return {
    groups,
    topGroupIds,
    playerResults,
    rankingCount: usableRankings.filter((ranking) => !ranking.autoSubmitted).length,
    selectionLimit: 1,
    bestAnswer: topGroupIds.length ? groups.find((group) => group.id === topGroupIds[0]) || null : null
  };
}
