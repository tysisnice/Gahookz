import * as z from "zod";
import {
  COMMAND_SCHEMA_VERSION,
  GAME_MODES,
  GAME_PHASES,
  ROUND_PRESETS,
  SNAPSHOT_SCHEMA_VERSION
} from "./game.ts";
import { MEDIA_URL_PATTERN, ROOM_CODE_PATTERN } from "./identifiers.ts";
import {
  GAME_FAMILIES,
  QUIZ_SCORINGS,
  TIE_BREAK_REASONS
} from "./settings.ts";

export const RoomCodeSchema = z.string().regex(ROOM_CODE_PATTERN);
export const PlayerIdSchema = z.string().min(1).max(128);
export const QuestionIdSchema = z.string().min(1).max(128);
export const AnswerIdSchema = z.string().min(1).max(32);
export const CredentialSchema = z.string().min(16).max(256);
export const MediaUrlSchema = z.string().regex(MEDIA_URL_PATTERN);
export const UnixMillisecondsSchema = z.number().int().nonnegative();

export const GameModeSchema = z.enum(GAME_MODES);
export const GameFamilySchema = z.enum(GAME_FAMILIES);
export const QuizScoringSchema = z.enum(QUIZ_SCORINGS);
export const TieBreakReasonSchema = z.enum(TIE_BREAK_REASONS);

/**
 * Settings as they arrive from a client. Every field is optional because both
 * the legacy and the canonical spelling must be accepted during the migration;
 * `normaliseGameSettings` decides what the combination actually means and
 * rejects contradictions. Validate shape here, meaning there.
 */
export const GameSettingsInputSchema = z.object({
  gameMode: GameModeSchema.optional(),
  gameFamily: GameFamilySchema.optional(),
  quizScoring: QuizScoringSchema.optional()
}).strict();
export const GamePhaseSchema = z.enum(GAME_PHASES);
export const RoundPresetSchema = z.enum(ROUND_PRESETS);

// The server has always sent more than the five required fields. The schema
// stays `.strict()` on purpose — an unexpected key is how a credential would
// leak into a public response, and there is a test pinning that — so the extra
// fields are enumerated rather than waved through with `.passthrough()`.
// Missing or malformed *required* fields still fail; a known optional
// operational field is tolerated. Verified against a live `/api/health`.
export const HealthResponseSchema = z.object({
  schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
  ok: z.literal(true),
  serverTime: UnixMillisecondsSchema,
  release: z.string().min(1).max(128),
  builtAt: z.string().max(128),
  revision: z.string().max(128).optional(),
  serverBuiltAt: z.string().max(128).optional(),
  instance: z.string().max(128).optional(),
  draining: z.boolean().optional(),
  activeRooms: z.number().int().nonnegative().optional(),
  accountPersistence: z.enum(["memory", "postgres"]).optional(),
  googleLoginAvailable: z.boolean().optional(),
  careerResults: z.object({
    queued: z.number().int().nonnegative(), delivered: z.number().int().nonnegative(),
    exhausted: z.number().int().nonnegative(), corruptLines: z.number().int().nonnegative(),
    pendingBytes: z.number().int().nonnegative(), journalBytes: z.number().int().nonnegative().optional(),
    journalErrors: z.number().int().nonnegative().optional()
  }).strict().optional()
}).strict();

export const ApiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.string().min(1).max(500),
  roomMissing: z.boolean().optional()
}).passthrough();

export const ApiSuccessSchema = z.object({
  ok: z.literal(true)
}).passthrough();

export const RoomCommandEnvelopeSchema = z.object({
  schemaVersion: z.literal(COMMAND_SCHEMA_VERSION),
  path: z.string().regex(/^\/api\/[a-z0-9/-]+$/),
  payload: z.record(z.string(), z.unknown())
}).strict();

export const PublicPlayerBaseSchema = z.object({
  id: PlayerIdSchema,
  name: z.string().min(1).max(24),
  score: z.number().int(),
  connected: z.boolean()
}).passthrough();

// Host presence (standalone/server/host-presence.mjs). Strict on purpose: these
// describe an absent or replaced host, which is exactly where a credential
// would be tempting to include, and an unexpected key must fail loudly.
export const HostPresenceSchema = z.object({
  away: z.literal(true),
  hostName: z.string().max(24),
  since: UnixMillisecondsSchema,
  promoteAt: UnixMillisecondsSchema
}).strict();

export const HostChangeSchema = z.object({
  id: z.string().min(1).max(64),
  playerId: PlayerIdSchema,
  name: z.string().max(24),
  at: UnixMillisecondsSchema,
  reason: z.enum(["host-away", "handover"])
}).strict();

export const OwnHostReplacedSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(24),
  at: UnixMillisecondsSchema
}).strict();

export const PublicSnapshotBaseSchema = z.object({
  schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION).optional(),
  code: RoomCodeSchema,
  stateVersion: z.number().int().nonnegative(),
  serverTime: UnixMillisecondsSchema,
  isHost: z.boolean(),
  gameMode: GameModeSchema,
  // Canonical pair. Optional while servers and clients migrate; `gameMode`
  // above remains the derived compatibility field, never a second truth.
  gameFamily: GameFamilySchema.optional(),
  quizScoring: QuizScoringSchema.optional(),
  roundPreset: RoundPresetSchema,
  phase: GamePhaseSchema,
  players: z.array(PublicPlayerBaseSchema),
  ownPlayer: PublicPlayerBaseSchema.nullable(),
  currentQuestion: z.unknown().nullable(),
  // Optional so snapshots captured before host presence existed stay valid.
  hostPresence: HostPresenceSchema.nullable().optional(),
  hostChange: HostChangeSchema.nullable().optional(),
  ownHostReplaced: OwnHostReplacedSchema.nullable().optional()
}).passthrough();

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ApiSuccess = z.infer<typeof ApiSuccessSchema>;
export type RoomCommandEnvelope = z.infer<typeof RoomCommandEnvelopeSchema>;
export type PublicPlayerBase = z.infer<typeof PublicPlayerBaseSchema>;
export type PublicSnapshotBase = z.infer<typeof PublicSnapshotBaseSchema>;
export type HostPresence = z.infer<typeof HostPresenceSchema>;
export type HostChange = z.infer<typeof HostChangeSchema>;
export type OwnHostReplaced = z.infer<typeof OwnHostReplacedSchema>;
export type GameSettingsInput = z.infer<typeof GameSettingsInputSchema>;

// ---------------------------------------------------------------------------
// Phase-discriminated snapshot payloads (P01 step 2)
//
// `PublicSnapshotBaseSchema` above pins the eleven fields every snapshot has
// and passes the rest through. That is a useful floor and it is not a contract:
// the interesting rules in this game are not "which keys exist" -- every
// snapshot carries the same seventy-six -- but *what those keys are allowed to
// contain in a given phase*. The answer key, the answer text and the names of
// the people who wrote the answers are all in `currentQuestion`, and each one
// becomes visible at a different moment.
//
// `publicQuestion` in standalone/server.js implements exactly three gates:
//
//   phase       answers listed   answer text   key, authors, points
//   lobby              no             -                no
//   building           no             -                no
//   herd-writing       no             -                no
//   reading           yes          blank               no
//   answering         yes          filled              no
//   reveal            yes          filled             yes
//   finished          yes          filled             yes
//
// The schemas below say that, so that a change to those gates fails a test
// instead of quietly showing a room the answer early.
// ---------------------------------------------------------------------------

export const PublicAuthorSchema = z.object({
  id: PlayerIdSchema,
  name: z.string().max(24),
  avatarId: z.string().max(64),
  avatarImageDataUrl: z.string()
}).strict();

/** The rules frozen when the host locked the setup; `null` until they do. */
export const LockedRulesSchema = z.object({
  gameFamily: GameFamilySchema,
  quizScoring: QuizScoringSchema,
  gameMode: GameModeSchema,
  roundPreset: RoundPresetSchema,
  maxQuestionsPerPlayer: z.number().int().positive(),
  promptStyle: z.string().min(1).max(32),
  lockedAt: UnixMillisecondsSchema
}).strict();

const answerIdentity = {
  id: AnswerIdSchema,
  label: z.string().max(32),
  color: z.string().max(32),
  shape: z.string().max(32),
  ownAnswer: z.boolean()
};

/**
 * One answer as a client may see it. `hidden` and `visible` differ only in
 * whether the words are filled in, and both of them withhold everything that
 * would decide the round; `revealed` is the only stage that carries the key,
 * the Herd author and the author's points.
 */
export function publicAnswerSchema(stage: "hidden" | "visible" | "revealed") {
  if (stage === "revealed") {
    return z.object({
      ...answerIdentity,
      text: z.string(),
      imageDataUrl: z.string().optional(),
      correct: z.boolean(),
      // Named in Herd, deliberately anonymous in Quiz and Majority, where an
      // answer is an option the question's author wrote rather than a player's
      // contribution.
      author: PublicAuthorSchema.nullable(),
      authoredPoints: z.number().int().optional(),
      predicted: z.boolean().optional()
    }).strict();
  }
  return z.object({
    ...answerIdentity,
    // Listed but blank until answering: the room sees the colours and the
    // shapes before the words. That is what the reading phase is for.
    text: stage === "visible" ? z.string() : z.literal(""),
    imageDataUrl: z.string().optional(),
    // The four fields that would give the round away. `publicQuestion` leaves
    // them `undefined` and JSON drops them, so each must be absent outright --
    // not merely falsy, which a `.passthrough()` schema would also accept.
    correct: z.undefined().optional(),
    author: z.null(),
    authoredPoints: z.undefined().optional(),
    predicted: z.undefined().optional()
  }).strict();
}

const questionIdentity = {
  id: QuestionIdSchema,
  mode: GameModeSchema,
  text: z.string(),
  namedPlayerNames: z.array(z.string().max(24)),
  imageDataUrl: z.string(),
  authorName: z.string().max(24),
  author: PublicAuthorSchema.nullable(),
  voteScore: z.number().int(),
  goodVotes: z.number().int().nonnegative(),
  badVotes: z.number().int().nonnegative(),
  // Who reported or liked the prompt. Described as a list rather than by
  // member, because nothing in this contract depends on its contents yet.
  voteSelections: z.array(z.unknown())
};

/** Shared by Herd and Majority: the result, and why it came out that way. */
const roundOutcome = {
  answeredCount: z.number().int().nonnegative(),
  eligiblePlayerCount: z.number().int().nonnegative(),
  topCount: z.number().int().nonnegative(),
  winningAnswerId: z.string(),
  tiedByVotes: z.boolean(),
  tieBrokenBySpeed: z.boolean(),
  tieBreakReason: TieBreakReasonSchema,
  factCheck: z.unknown().nullable(),
  groups: z.array(z.looseObject({
    answerId: z.string(),
    count: z.number().int().nonnegative(),
    winner: z.boolean(),
    fastestElapsedMs: z.number().nullable(),
    averageElapsedMs: z.number().nullable()
  })),
  playerResults: z.array(z.looseObject({
    playerId: PlayerIdSchema,
    answerId: z.string(),
    correct: z.boolean(),
    points: z.number().int()
  }))
};

/**
 * A reveal has to explain itself truthfully. Three rules, all of which the two
 * scoring engines already satisfy and neither of which was previously checked
 * against a payload:
 *
 *   - `tieBrokenBySpeed` is the compatibility flag an older client reads. It
 *     may only describe a tie that speed actually settled, so a tie settled by
 *     the stable answer order must leave it false;
 *   - naming a tie-break rule when no tie happened is a false explanation;
 *   - no votes means no winning answer, and the reason is `none`.
 */
function withTruthfulTieReason<T extends z.ZodObject>(schema: T) {
  return schema.
    refine(
      (value) => !value.tieBrokenBySpeed || value.tieBreakReason === "fastest" || value.tieBreakReason === "average",
      { error: "tieBrokenBySpeed must describe only a fastest or average tie-break", path: ["tieBrokenBySpeed"] }
    ).
    refine(
      (value) => value.tieBreakReason === "none" || value.tiedByVotes,
      { error: "a tie-break reason without a tie is a false explanation", path: ["tieBreakReason"] }
    ).
    refine(
      (value) => value.winningAnswerId !== "" || value.tieBreakReason === "none",
      { error: "no winning answer must report reason none", path: ["tieBreakReason"] }
    );
}

export const MajorityResultsSchema = withTruthfulTieReason(z.looseObject({
  ...roundOutcome,
  // The author's guess at the room, kept distinct from a Quiz answer key: it
  // decides only the author bonus, and it is published once voting is over.
  predictedAnswerId: z.string().nullable(),
  predictionMatched: z.boolean(),
  unanimous: z.boolean(),
  authorBonusAwarded: z.boolean()
}));

export const HerdResultsSchema = withTruthfulTieReason(z.looseObject({
  ...roundOutcome,
  authorResults: z.array(z.looseObject({
    playerId: PlayerIdSchema,
    answerId: z.string(),
    voteCount: z.number().int().nonnegative(),
    points: z.number().int().nonnegative(),
    winner: z.boolean()
  }))
}));

/** One question as a client may see it in a given phase. */
export function publicQuestionSchema(stage: "hidden" | "visible" | "revealed") {
  if (stage === "revealed") {
    return z.object({
      ...questionIdentity,
      answers: z.array(publicAnswerSchema("revealed")),
      correctAnswerId: z.string().nullable(),
      majorityResults: MajorityResultsSchema.nullable(),
      herdResults: HerdResultsSchema.nullable()
    }).strict();
  }
  return z.object({
    ...questionIdentity,
    answers: z.array(publicAnswerSchema(stage)),
    // The key is explicitly `null` before the reveal rather than absent, so a
    // client can tell "not yet" from "this build does not send it".
    correctAnswerId: z.null(),
    majorityResults: z.null(),
    herdResults: z.null()
  }).strict();
}

/**
 * A question the viewer wrote themselves. The counterpart to withholding the
 * key from everyone else: an author must still be able to see the answer they
 * marked, or they cannot check their own question.
 */
export const OwnQuestionSchema = z.looseObject({
  id: QuestionIdSchema,
  text: z.string(),
  answers: z.array(z.looseObject({
    id: AnswerIdSchema,
    text: z.string(),
    correct: z.boolean().optional(),
    predicted: z.boolean().optional()
  }))
});

const snapshotShape = PublicSnapshotBaseSchema.shape;

function snapshotForPhase<P extends (typeof GAME_PHASES)[number]>(
  phase: P,
  currentQuestion: z.ZodType,
  lockedRules: z.ZodType
) {
  return z.object({
    ...snapshotShape,
    phase: z.literal(phase),
    currentQuestion,
    lockedRules,
    ownQuestions: z.array(OwnQuestionSchema)
  }).loose();
}

const noQuestion = z.null();
const hiddenQuestion = publicQuestionSchema("hidden");
const visibleQuestion = publicQuestionSchema("visible");
const revealedQuestion = publicQuestionSchema("revealed");
const lockedRules = LockedRulesSchema;
const notYetLocked = LockedRulesSchema.nullable();

/**
 * The public snapshot, discriminated by phase. A game that has begun always
 * carries the rules it was locked into; a lobby may not have any yet.
 *
 * `finished` tolerates a missing question because a game can end without one
 * having been reached; `reading`, `answering` and `reveal` cannot, since those
 * phases exist only to show a question.
 */
export const PublicSnapshotSchema = z.discriminatedUnion("phase", [
  snapshotForPhase("lobby", noQuestion, notYetLocked),
  snapshotForPhase("building", noQuestion, lockedRules),
  snapshotForPhase("herd-writing", noQuestion, lockedRules),
  snapshotForPhase("reading", hiddenQuestion, lockedRules),
  snapshotForPhase("answering", visibleQuestion, lockedRules),
  snapshotForPhase("reveal", revealedQuestion, lockedRules),
  snapshotForPhase("finished", revealedQuestion.nullable(), lockedRules)
]);

/**
 * Keys this contract actually describes. Everything else in a snapshot is
 * passed through, which is a deliberate and temporary state of affairs rather
 * than a claim that those fields are validated.
 */
export const DESCRIBED_SNAPSHOT_KEYS: readonly string[] = Object.freeze(
  [...new Set([...Object.keys(snapshotShape), "lockedRules", "ownQuestions"])].sort()
);

/**
 * Keys the server sends that this contract knowingly does not describe yet.
 * The list is explicit so that a *new* server field fails a test and has to be
 * either described above or added here on purpose. That is the difference
 * between a tolerated forward-compatible addition and an unnoticed one.
 */
export const TOLERATED_SNAPSHOT_KEYS: readonly string[] = Object.freeze([
  "activePlayerCount", "allowCustomGahooks", "allowCustomProfiles", "answerCount",
  "answerSelections", "approveQuestions", "availableQuestionCount", "bannedPlayers",
  "canStart", "chatMessages", "currentQuestionIndex", "customGahookOptions",
  "estimatedDurationMs", "gahookDuel", "gahookEffects", "gahookStealPoints",
  "getGotPenaltyPoints", "hasPassword", "herdAnswerReview", "herdPreparation",
  "herdRoundTarget", "lastGameSummary", "leaderboard", "lobbyArenaEnabled",
  "loser", "losers", "maxQuestionsPerPlayer", "ownAnswer", "ownCounterOffer",
  "ownCustomGahook", "ownGahookUses", "ownHerdAssignments", "ownPoke", "ownVote",
  "paused", "pausedRemainingMs", "pendingQuestionCount", "pendingQuestions",
  "phaseDurations", "phaseEndsAt", "phaseWaitingForProgress", "plannedTotalQuestions",
  "promptStyle", "questionCount", "questionResults", "questionsPerPlayer", "reports",
  "roomPoke", "savedQuestionCount", "savedQuestionCountOtherFamily",
  "selectedQuestionLimit", "settingsRevision", "totalQuestions", "unusedQuestionCount",
  "whiteboardRevision", "whiteboardStrokes", "winner", "winners"
].sort());

/** Snapshot keys that are neither described nor knowingly tolerated. */
export function undescribedSnapshotKeys(payload: Record<string, unknown>): string[] {
  const known = new Set([...DESCRIBED_SNAPSHOT_KEYS, ...TOLERATED_SNAPSHOT_KEYS]);
  return Object.keys(payload).filter((key) => !known.has(key)).sort();
}

export type PublicSnapshot = z.infer<typeof PublicSnapshotSchema>;
export type PublicAuthor = z.infer<typeof PublicAuthorSchema>;
export type LockedRules = z.infer<typeof LockedRulesSchema>;
export type MajorityResults = z.infer<typeof MajorityResultsSchema>;
export type HerdResults = z.infer<typeof HerdResultsSchema>;
