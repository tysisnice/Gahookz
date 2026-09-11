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
  /** Position in the writing rotation. Balances workload; never displayed. */
  answerIndex: number;
  /**
   * The slot this answer occupies when the room sees it.
   *
   * Independent of `answerIndex` on purpose. The room renders answers as Red,
   * Blue, Yellow, Green in this order, so if the displayed slot were the
   * rotation position, the colour of an answer would name its author: the
   * rotation is a fixed circular walk from the question author, so one reveal
   * taught the offset and every later question became computable. A fresh
   * permutation per question breaks that link.
   */
  displayIndex: number;
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

/** Which rule actually separated a tied vote. */
export type HerdTieBreakReason = "none" | "fastest" | "average" | "order";

export interface HerdRoundResults {
  groups: HerdAnswerGroup[];
  answeredCount: number;
  eligiblePlayerCount: number;
  topCount: number;
  winningAnswerId: string | null;
  tiedByVotes: boolean;
  /**
   * True only when speed genuinely decided it. Kept for compatibility; prefer
   * `tieBreakReason`, which distinguishes "fastest" from "average" from the
   * stable answer order.
   */
  tieBrokenBySpeed: boolean;
  tieBreakReason: HerdTieBreakReason;
  playerResults: HerdPlayerResult[];
  authorResults: HerdAuthorResult[];
}

/**
 * Fisher-Yates, with the randomness injected so tests are deterministic.
 * A hostile or broken `random` must not produce an out-of-range slot, so the
 * drawn index is clamped rather than trusted.
 */
function shuffledSlots(count: number, random: () => number): number[] {
  const slots = Array.from({ length: count }, (_unused, index) => index);
  for (let index = count - 1; index > 0; index -= 1) {
    const drawn = random();
    const safe = Number.isFinite(drawn) ? Math.min(Math.max(drawn, 0), 0.999_999_999) : 0;
    const target = Math.floor(safe * (index + 1));
    const current = slots[index] as number;
    slots[index] = slots[target] as number;
    slots[target] = current;
  }
  return slots;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function buildHerdAssignmentPlan(
  playerIdsInput: readonly string[],
  questionsInput: readonly HerdQuestionSeed[],
  maximumPerQuestion = HERD_MAX_AUTHORED_ANSWERS,
  random: () => number = Math.random
): HerdAssignmentPlan {
  const playerIds = unique(playerIdsInput);
  const questions = questionsInput.filter((question) => question.id && question.authorId);
  const targetAnswersPerQuestion = Math.min(Math.max(0, Math.trunc(maximumPerQuestion)), playerIds.length);
  const byPlayerId = Object.fromEntries(playerIds.map((playerId) => [playerId, []])) as Record<string, HerdAnswerAssignment[]>;
  const byQuestionId = Object.fromEntries(questions.map((question) => [question.id, []])) as Record<string, HerdAnswerAssignment[]>;
  const assignments: HerdAnswerAssignment[] = [];
  if (targetAnswersPerQuestion === 0) return { targetAnswersPerQuestion, assignments, byPlayerId, byQuestionId };

  // Least-loaded assignment rather than a circular walk from the author.
  //
  // The walk was fine while every player authored exactly one prompt: the
  // anchors were spread evenly around the roster. Once the game plays fewer
  // rounds than there are players, the anchors cluster in roster order and the
  // load collapses onto whoever sits just after them -- a capped twenty-player
  // probe gave some writers four answers and others none.
  const canExcludeAuthor = playerIds.length - 1 >= targetAnswersPerQuestion;
  const totalSlots = questions.length * targetAnswersPerQuestion;
  const baseShare = Math.floor(totalSlots / playerIds.length);
  const remainder = totalSlots % playerIds.length;

  // Everyone's fair share, stated up front. The remainder goes to a random few
  // rather than always the same people.
  const capacity = new Map<string, number>();
  shuffledSlots(playerIds.length, random).forEach((playerIndex, rank) => {
    capacity.set(playerIds[playerIndex] as string, baseShare + (rank < remainder ? 1 : 0));
  });

  const load = new Map(playerIds.map((playerId) => [playerId, 0]));
  const writersByQuestion = new Map<string, string[]>();

  for (const question of questions) {
    const eligible = playerIds.filter(
      (playerId) => !(canExcludeAuthor && playerId === question.authorId)
    );
    const withinCapacity = eligible.filter(
      (playerId) => (load.get(playerId) ?? 0) < (capacity.get(playerId) ?? 0)
    );
    // An unfilled prompt is worse for the room than one extra answer, so the
    // cap is relaxed rather than leaving a question short. The repair below
    // usually gives that slot back.
    const candidates = withinCapacity.length >= targetAnswersPerQuestion ? withinCapacity : eligible;
    const chosen = shuffledSlots(candidates.length, random).
      map((index) => candidates[index] as string).
      sort((first, second) => (load.get(first) ?? 0) - (load.get(second) ?? 0)).
      slice(0, targetAnswersPerQuestion);

    for (const writer of chosen) load.set(writer, (load.get(writer) ?? 0) + 1);
    writersByQuestion.set(question.id, chosen);
  }

  // Repair overshoot. Excluding a question's own author can leave a late
  // question with no under-loaded writer available, which pushes somebody past
  // their share. Moving one answer to an under-loaded writer fixes it, as long
  // as they are not already on that question and are not its author.
  for (let pass = 0; pass < playerIds.length * 2; pass += 1) {
    const over = playerIds.find((playerId) => (load.get(playerId) ?? 0) > (capacity.get(playerId) ?? 0));
    if (!over) break;
    const under = playerIds.filter((playerId) => (load.get(playerId) ?? 0) < (capacity.get(playerId) ?? 0));
    if (!under.length) break;

    let moved = false;
    for (const question of questions) {
      const writers = writersByQuestion.get(question.id);
      if (!writers?.includes(over)) continue;
      const replacement = under.find(
        (playerId) => !writers.includes(playerId) && !(canExcludeAuthor && playerId === question.authorId)
      );
      if (!replacement) continue;
      writers[writers.indexOf(over)] = replacement;
      load.set(over, (load.get(over) ?? 0) - 1);
      load.set(replacement, (load.get(replacement) ?? 0) + 1);
      moved = true;
      break;
    }
    if (!moved) break;
  }

  // Indexes are built from the final writers, after any repair, so they cannot
  // disagree with each other.
  for (const question of questions) {
    const writers = writersByQuestion.get(question.id) ?? [];
    const slots = shuffledSlots(writers.length, random);
    const forQuestion: HerdAnswerAssignment[] = [];
    writers.forEach((answerAuthorId, answerIndex) => {
      const assignment = {
        questionId: question.id,
        questionAuthorId: question.authorId,
        answerAuthorId,
        answerIndex,
        displayIndex: slots[answerIndex] as number
      };
      assignments.push(assignment);
      byPlayerId[answerAuthorId]?.push(assignment);
      forQuestion.push(assignment);
    });
    forQuestion.sort((first, second) => first.displayIndex - second.displayIndex);
    byQuestionId[question.id]?.push(...forQuestion);
  }

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
  // Report the rule that actually separated the winner rather than assuming a
  // tie means speed. The sort tries fastest, then average, then the stable
  // answer order, so compare the winner with the best of the other leaders and
  // name the first key that differs. With three or more tied groups this
  // correctly advances past a key they all share.
  let tieBreakReason: HerdTieBreakReason = "none";
  if (winningAnswerId && tiedByVotes) {
    const winner = countLeaders[0] as HerdAnswerGroup;
    const runnerUp = countLeaders[1] as HerdAnswerGroup;
    if (numericTieValue(winner.fastestElapsedMs) !== numericTieValue(runnerUp.fastestElapsedMs)) {
      tieBreakReason = "fastest";
    } else if (numericTieValue(winner.averageElapsedMs) !== numericTieValue(runnerUp.averageElapsedMs)) {
      tieBreakReason = "average";
    } else {
      tieBreakReason = "order";
    }
  }
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
    tieBrokenBySpeed: tieBreakReason === "fastest" || tieBreakReason === "average",
    tieBreakReason,
    playerResults,
    authorResults
  };
}
