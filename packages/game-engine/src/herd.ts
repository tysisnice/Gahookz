export const HERD_MAX_AUTHORED_ANSWERS = 4 as const;
export const HERD_MAX_VOTE_POINTS = 500 as const;
export const HERD_MAX_AUTHOR_POINTS = 500 as const;

export interface HerdQuestionSeed {
  id: string;
  authorId: string;
}

export interface HerdAnswerAssignment {
  questionId: string;
  questionAuthorId: string;
  answerAuthorId: string;
  answerIndex: number;
}

export interface HerdAssignmentPlan {
  targetAnswersPerQuestion: number;
  assignments: HerdAnswerAssignment[];
  byPlayerId: Record<string, HerdAnswerAssignment[]>;
  byQuestionId: Record<string, HerdAnswerAssignment[]>;
}

export interface HerdAnswerChoice {
  id: string;
  text: string;
  authorId: string;
}

export interface HerdVoteSelection {
  playerId: string;
  answerId: string;
  elapsedMs: number;
  answeredAt?: number;
}

export interface HerdAnswerGroup extends HerdAnswerChoice {
  playerIds: string[];
  count: number;
  fastestElapsedMs: number | null;
  averageElapsedMs: number | null;
  totalElapsedMs: number;
}

export interface HerdPlayerResult extends Required<HerdVoteSelection> {
  correct: boolean;
  points: number;
}

export interface HerdAuthorResult {
  playerId: string;
  answerId: string;
  voteCount: number;
  points: number;
  winner: boolean;
}

export interface HerdRoundResults {
  groups: HerdAnswerGroup[];
  answeredCount: number;
  eligiblePlayerCount: number;
  topCount: number;
  winningAnswerId: string | null;
  tiedByVotes: boolean;
  tieBrokenBySpeed: boolean;
  playerResults: HerdPlayerResult[];
  authorResults: HerdAuthorResult[];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function buildHerdAssignmentPlan(
  playerIdsInput: readonly string[],
  questionsInput: readonly HerdQuestionSeed[],
  maximumPerQuestion = HERD_MAX_AUTHORED_ANSWERS
): HerdAssignmentPlan {
  const playerIds = unique(playerIdsInput);
  const questions = questionsInput.filter((question) => question.id && question.authorId);
  const targetAnswersPerQuestion = Math.min(Math.max(0, Math.trunc(maximumPerQuestion)), playerIds.length);
  const byPlayerId = Object.fromEntries(playerIds.map((playerId) => [playerId, []])) as Record<string, HerdAnswerAssignment[]>;
  const byQuestionId = Object.fromEntries(questions.map((question) => [question.id, []])) as Record<string, HerdAnswerAssignment[]>;
  const assignments: HerdAnswerAssignment[] = [];
  if (targetAnswersPerQuestion === 0) return { targetAnswersPerQuestion, assignments, byPlayerId, byQuestionId };

  const playerIndex = new Map(playerIds.map((playerId, index) => [playerId, index]));
  questions.forEach((question, questionIndex) => {
    const authorIndex = playerIndex.get(question.authorId);
    const anchor = authorIndex ?? questionIndex % playerIds.length;
    const canExcludeAuthor = playerIds.length - 1 >= targetAnswersPerQuestion;
    const firstOffset = canExcludeAuthor ? 1 : 0;
    for (let answerIndex = 0; answerIndex < targetAnswersPerQuestion; answerIndex += 1) {
      const answerAuthorId = playerIds[(anchor + firstOffset + answerIndex) % playerIds.length];
      if (!answerAuthorId) continue;
      const assignment = { questionId: question.id, questionAuthorId: question.authorId, answerAuthorId, answerIndex };
      assignments.push(assignment);
      byPlayerId[answerAuthorId]?.push(assignment);
      byQuestionId[question.id]?.push(assignment);
    }
  });
  return { targetAnswersPerQuestion, assignments, byPlayerId, byQuestionId };
}

function boundedElapsed(value: unknown, answeringMs: number): number {
  const elapsed = Number(value);
  if (!Number.isFinite(elapsed)) return answeringMs;
  return Math.max(0, Math.min(answeringMs, elapsed));
}

function speedPoints(correct: boolean, elapsedMs: number, answeringMs: number): number {
  if (!correct) return 0;
  if (answeringMs <= 0) return HERD_MAX_VOTE_POINTS;
  return Math.round(HERD_MAX_VOTE_POINTS - (boundedElapsed(elapsedMs, answeringMs) / answeringMs) * (HERD_MAX_VOTE_POINTS / 2));
}

function numericTieValue(value: number | null): number {
  return value ?? Number.POSITIVE_INFINITY;
}

export function buildHerdRoundResults({
  answers = [], selections = [], eligiblePlayerIds = [], answeringMs = 14_000
}: {
  answers?: readonly HerdAnswerChoice[];
  selections?: readonly HerdVoteSelection[];
  eligiblePlayerIds?: readonly string[];
  answeringMs?: number;
}): HerdRoundResults {
  const answerOrder = new Map(answers.map((answer, index) => [answer.id, index]));
  const groupsById = new Map<string, HerdAnswerGroup>(answers.map((answer) => [answer.id, {
    ...answer,
    playerIds: [],
    count: 0,
    fastestElapsedMs: null,
    averageElapsedMs: null,
    totalElapsedMs: 0
  }]));
  const eligibleIds = unique(eligiblePlayerIds);
  const eligibleSet = new Set(eligibleIds);
  const restrictToEligible = eligibleSet.size > 0;
  const seenPlayers = new Set<string>();
  const validSelections: Required<HerdVoteSelection>[] = [];

  for (const selection of selections) {
    if (!selection?.playerId || seenPlayers.has(selection.playerId)) continue;
    if (restrictToEligible && !eligibleSet.has(selection.playerId)) continue;
    const group = groupsById.get(selection.answerId);
    if (!group) continue;
    const elapsedMs = boundedElapsed(selection.elapsedMs, answeringMs);
    seenPlayers.add(selection.playerId);
    validSelections.push({ playerId: selection.playerId, answerId: selection.answerId, elapsedMs, answeredAt: Number(selection.answeredAt || 0) });
    group.playerIds.push(selection.playerId);
    group.count += 1;
    group.totalElapsedMs += elapsedMs;
    group.fastestElapsedMs = group.fastestElapsedMs === null ? elapsedMs : Math.min(group.fastestElapsedMs, elapsedMs);
  }

  const groups = [...groupsById.values()].map((group) => ({
    ...group,
    averageElapsedMs: group.count ? Math.round(group.totalElapsedMs / group.count) : null
  }));
  const answeredGroups = groups.filter((group) => group.count > 0);
  const topCount = Math.max(0, ...answeredGroups.map((group) => group.count));
  const countLeaders = answeredGroups.filter((group) => group.count === topCount);
  countLeaders.sort((first, second) =>
    numericTieValue(first.fastestElapsedMs) - numericTieValue(second.fastestElapsedMs) ||
    numericTieValue(first.averageElapsedMs) - numericTieValue(second.averageElapsedMs) ||
    (answerOrder.get(first.id) ?? Number.POSITIVE_INFINITY) - (answerOrder.get(second.id) ?? Number.POSITIVE_INFINITY)
  );
  const winningAnswerId = countLeaders[0]?.id ?? null;
  const tiedByVotes = countLeaders.length > 1;
  const eligiblePlayerCount = restrictToEligible ? eligibleSet.size : seenPlayers.size;
  const playerResults = validSelections.map((selection) => {
    const correct = Boolean(winningAnswerId && selection.answerId === winningAnswerId);
    return { ...selection, correct, points: speedPoints(correct, selection.elapsedMs, answeringMs) };
  });
  const authorResults = groups.map((group) => ({
    playerId: group.authorId,
    answerId: group.id,
    voteCount: group.count,
    points: eligiblePlayerCount > 0 ? Math.round(HERD_MAX_AUTHOR_POINTS * group.count / eligiblePlayerCount) : 0,
    winner: group.id === winningAnswerId
  }));

  return {
    groups: groups.sort((first, second) =>
      second.count - first.count || numericTieValue(first.fastestElapsedMs) - numericTieValue(second.fastestElapsedMs) ||
      (answerOrder.get(first.id) ?? Number.POSITIVE_INFINITY) - (answerOrder.get(second.id) ?? Number.POSITIVE_INFINITY)
    ),
    answeredCount: validSelections.length,
    eligiblePlayerCount,
    topCount,
    winningAnswerId,
    tiedByVotes,
    tieBrokenBySpeed: Boolean(tiedByVotes && winningAnswerId),
    playerResults,
    authorResults
  };
}
