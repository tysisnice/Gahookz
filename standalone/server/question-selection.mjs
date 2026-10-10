// P06 step 2: question selection with rotation by stable question ID across
// rematches. Extracted from server.js so the selection policy is testable
// without importing the HTTP server. The mode-readiness, round-cap and
// scoring rules stay in server.js and arrive through `rules` — this module
// owns only *which* questions a game gets, not how they are scored.

import crypto from "node:crypto";

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function cleanQuestionRoundState(question, options = {}) {
  const {
    votes: _votes,
    majorityScored: _majorityScored,
    majorityResults: _majorityResults,
    herdScored: _herdScored,
    herdResults: _herdResults,
    carriedOver: _carriedOver,
    ...base
  } = question;
  return {
    ...base,
    answers: Array.isArray(question.answers) ? question.answers.map((answer) => ({ ...answer })) : [],
    ...(options.carriedOver ? { carriedOver: true } : {})
  };
}

// Record each question this game actually played, keyed by stable ID, exactly
// once per game. Called from resetLobby before the finished game state is
// replaced — never at selection time, because Herd re-selects mid-game and a
// selection-time count would double-count those questions.
export function recordPlayedQuestionPlays(room) {
  const counts = room.questionPlayCounts ?? (room.questionPlayCounts = {});
  for (const id of room.game?.playedQuestionIds || []) {
    counts[id] = (counts[id] || 0) + 1;
  }
}

function playCount(room, question) {
  return room.questionPlayCounts?.[question.id] || 0;
}

export function fairRoundRobinQuestions(room, candidates, limit, alreadySelected = new Set()) {
  if (limit <= 0) return [];
  const byAuthor = new Map();
  candidates.forEach((question) => {
    if (alreadySelected.has(question.id)) return;
    const bucket = byAuthor.get(question.authorId) || [];
    bucket.push(question);
    byAuthor.set(question.authorId, bucket);
  });
  // Rotation by stable ID: within an author's bucket the least-played
  // questions come first, and authors whose best question has been played
  // least go first. The shuffles remain, but only as tie-breakers between
  // equal play counts — they can no longer re-pick a played question over a
  // never-played one.
  const byPlayCount = (a, b) => playCount(room, a) - playCount(room, b);
  const authorIds = shuffle([...byAuthor.keys()]).sort((a, b) => {
    const bucketA = byAuthor.get(a);
    const bucketB = byAuthor.get(b);
    return byPlayCount(bucketA[0], bucketB[0]);
  });
  authorIds.forEach((authorId) => byAuthor.set(authorId, shuffle(byAuthor.get(authorId)).sort(byPlayCount)));
  const selected = [];
  let depth = 0;
  while (selected.length < limit) {
    let addedAtDepth = false;
    for (const authorId of authorIds) {
      const question = byAuthor.get(authorId)?.[depth];
      if (!question) continue;
      selected.push(question);
      alreadySelected.add(question.id);
      addedAtDepth = true;
      if (selected.length >= limit) break;
    }
    if (!addedAtDepth) break;
    depth += 1;
  }
  return selected;
}

export function selectQuestionsForGame(room, eligiblePlayerIds, rules) {
  const eligible = new Set(eligiblePlayerIds);
  const candidates = room.questions.filter((question) =>
    eligible.has(question.authorId) && rules.questionReadyForMode(room, question));
  const maximumRounds = rules.maximumRoundsForPreset(room);
  const limit = Number.isFinite(maximumRounds) ? Math.min(maximumRounds, candidates.length) : candidates.length;
  const selectedIds = new Set();
  // Questions that missed a previous capped game get first refusal.
  // The round-robin selector still spreads those questions fairly across authors.
  const carried = fairRoundRobinQuestions(room, candidates.filter((question) => question.carriedOver), limit, selectedIds);
  const remaining = fairRoundRobinQuestions(room, candidates, limit - carried.length, selectedIds);
  return shuffle([...carried, ...remaining]).map((question) => {
    const selected = cleanQuestionRoundState(question);
    rules.applyQuestionScoring(room, selected);
    return selected;
  });
}
