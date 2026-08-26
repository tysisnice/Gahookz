export const CAREER_STAT_KEYS = [
  "gamesPlayed",
  "wins",
  "podiums",
  "totalScore",
  "highScore",
  "answersSubmitted",
  "correctAnswers",
  "popularChoices",
  "questionsAuthored",
  "herdVotesReceived",
  "gahooksSent",
  "gahooksReceived"
] as const;

export type CareerStatKey = typeof CAREER_STAT_KEYS[number];
export type CareerStats = Record<CareerStatKey, number>;

export function emptyCareerStats(): CareerStats {
  return {
    gamesPlayed: 0,
    wins: 0,
    podiums: 0,
    totalScore: 0,
    highScore: 0,
    answersSubmitted: 0,
    correctAnswers: 0,
    popularChoices: 0,
    questionsAuthored: 0,
    herdVotesReceived: 0,
    gahooksSent: 0,
    gahooksReceived: 0
  };
}

export function normaliseCareerStats(value: unknown): CareerStats {
  const source = value && typeof value === "object" ? value as Partial<Record<CareerStatKey, unknown>> : {};
  const result = emptyCareerStats();
  for (const key of CAREER_STAT_KEYS) {
    const candidate = Number(source[key]);
    result[key] = Number.isFinite(candidate) ? Math.max(0, Math.trunc(candidate)) : 0;
  }
  return result;
}

export function addCareerStats(current: unknown, delta: unknown): CareerStats {
  const left = normaliseCareerStats(current);
  const right = normaliseCareerStats(delta);
  const result = emptyCareerStats();
  for (const key of CAREER_STAT_KEYS) {
    result[key] = key === "highScore" ? Math.max(left[key], right[key]) : left[key] + right[key];
  }
  return result;
}

export function matchCareerDelta(options: {
  score: number;
  placement: number;
  playerCount: number;
  roundStats?: unknown;
}): CareerStats {
  const delta = normaliseCareerStats(options.roundStats);
  const score = Math.max(0, Math.trunc(Number(options.score) || 0));
  const placement = Math.max(1, Math.trunc(Number(options.placement) || 1));
  const playerCount = Math.max(1, Math.trunc(Number(options.playerCount) || 1));
  delta.gamesPlayed = 1;
  delta.wins = placement === 1 ? 1 : 0;
  delta.podiums = placement <= Math.min(3, playerCount) ? 1 : 0;
  delta.totalScore = score;
  delta.highScore = score;
  return delta;
}
