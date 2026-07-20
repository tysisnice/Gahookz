export function quizPoints(correct, elapsedMs, answeringMs) {
  if (!correct) return 0;
  const boundedElapsed = Math.max(0, Math.min(answeringMs, elapsedMs));
  return Math.round(1000 - (boundedElapsed / answeringMs) * 500);
}

export function sortedLeaderboard(players) {
  return [...players].sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
}

export function rankedLeaderboard(players) {
  const sorted = sortedLeaderboard(players);
  let previousScore = null;
  let currentRank = 0;
  return sorted.map((player, index) => {
    const score = Number(player.score || 0);
    if (index === 0 || score !== previousScore) {
      currentRank = index + 1;
      previousScore = score;
    }
    return { ...player, rank: currentRank };
  });
}

export function scorePlacements(players) {
  const ranked = rankedLeaderboard(players);
  if (ranked.length === 0) {
    return { ranked, winners: [], losers: [], winner: null, loser: null };
  }

  const highestScore = Number(ranked[0].score || 0);
  const lowestScore = Number(ranked[ranked.length - 1].score || 0);
  const winners = ranked.filter((player) => Number(player.score || 0) === highestScore);
  // When every eligible player is tied, declaring the same people both winner and
  // loser makes the final contradictory. Treat it as a shared win with no losers.
  const losers = highestScore === lowestScore ? [] : ranked.filter((player) => Number(player.score || 0) === lowestScore);

  return {
    ranked,
    winners,
    losers,
    winner: winners.length === 1 ? winners[0] : null,
    loser: losers.length === 1 ? losers[0] : null
  };
}

export function gameEligiblePlayers(room) {
  const players = Object.values(room.players || {});
  const eligiblePlayerIds = room.game?.eligiblePlayerIds;
  if (!Array.isArray(eligiblePlayerIds)) {
    return players;
  }
  return eligiblePlayerIds.map((playerId) => room.players[playerId]).filter(Boolean);
}
