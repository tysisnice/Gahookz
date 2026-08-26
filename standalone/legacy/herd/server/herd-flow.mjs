/*
 * Archived source reference only.
 *
 * These functions were extracted from standalone/server.js when the former
 * free-text Herd mode was retired. They relied on helpers and room structures
 * local to that historical server and are intentionally not imported.
 */

export function archivedHerdFlowReference() {
  return {
    endpoints: ["/api/herd/draft", "/api/herd/rank"],
    phases: ["reading", "answering", "ranking", "reveal"],
    timers: {
      answeringMs: 35000,
      rankingMs: 45000,
      revealMs: 18000
    },
    answerLimit: 60,
    roundState: ["answerDrafts", "rankings", "herdRankingOrder"],
    functions: [
      "submitHerdAnswer",
      "saveHerdAnswerDraft",
      "lockHerdDraftAnswers",
      "herdAnswerEntries",
      "allActivePlayersRanked",
      "submitHerdRanking",
      "ensureMissingHerdRankings",
      "scoreHerdRound",
      "beginHerdRanking",
      "publicHerdResults",
      "publicHerdAnswerOptions",
      "bestHerdAnswerResult"
    ]
  };
}
