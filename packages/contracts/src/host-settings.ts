// Host room rules, the rules a started game is locked to, and the two answer
// keys a question can carry.
//
// These are contracts only. They describe what P04's Lobby rules modal sends
// and what a locked game reports; no server behaviour changes by adding them.
// They exist first because P03 and P04 both need to name these concepts, and
// because two of the distinctions here are the ones currently being lost:
//
//  * `updateHostSettings` today clears every question queue when the mode
//    changes, and drops the overflow when a per-player limit shrinks. The
//    saved bank, the questions selected for this game, and the per-player
//    quota are three different things, so they are three different fields.
//
//  * A Classic question has an *intended answer* chosen by its author, and a
//    Majority question has an *author prediction* of what the room will pick.
//    Those are not the same value and must never be stored in one field:
//    collapsing them is what lets a funny opinion prompt acquire a randomly
//    chosen "correct" answer.

import * as z from "zod";
import { AnswerIdSchema, QuestionIdSchema } from "./schemas.ts";
import { GameFamilySchema, QuizScoringSchema } from "./schemas.ts";
import { GameModeSchema, RoundPresetSchema } from "./schemas.ts";
import type { GameSettings } from "./settings.ts";

/** Which prompt library generated content is drawn from. Not a scoring rule. */
export const PROMPT_STYLES = ["funny", "educational"] as const;
export type PromptStyle = (typeof PROMPT_STYLES)[number];

/**
 * How far Gahook interruptions may go during the main game.
 *
 * `off` blocks the effects entirely, `visual` permits the cosmetic reaction but
 * no point stealing or GET GOT penalty, and `chaos` is the existing behaviour.
 * Enforced on the server: hiding the button is not a policy.
 */
export const GAHOOK_EFFECT_POLICIES = ["off", "visual", "chaos"] as const;
export type GahookEffectPolicy = (typeof GAHOOK_EFFECT_POLICIES)[number];

export const PromptStyleSchema = z.enum(PROMPT_STYLES);
export const GahookEffectPolicySchema = z.enum(GAHOOK_EFFECT_POLICIES);

/**
 * One atomic host settings request.
 *
 * Every field is optional: the modal sends what changed. `settingsRevision` is
 * the revision the host was looking at when they pressed Save — the server
 * rejects the write if the room has moved on, so a stale modal cannot quietly
 * revert someone else's change or a rule the game has already locked.
 *
 * `.strict()` so an unknown key is a rejected request rather than a silently
 * ignored setting that the host believes they changed.
 */
export const HostSettingsRequestSchema = z.object({
  settingsRevision: z.number().int().nonnegative().optional(),

  // Game family and scoring travel as the canonical pair; `normaliseGameSettings`
  // resolves them against any legacy `gameMode` and rejects contradictions.
  gameFamily: GameFamilySchema.optional(),
  quizScoring: QuizScoringSchema.optional(),

  gameMode: GameModeSchema.optional(),
  roundPreset: RoundPresetSchema.optional(),
  questionPreset: RoundPresetSchema.optional(),
  herdRoundTarget: z.number().finite().optional(),
  // The per-player writing quota. Reducing it must not delete submissions.
  maxQuestionsPerPlayer: z.number().int().min(0).max(20).optional(),

  approveQuestions: z.boolean().optional(),
  promptStyle: z.enum(["fun", "education", "funny", "educational"]).optional(),
  gahookEffects: GahookEffectPolicySchema.optional(),
  allowCustomProfiles: z.boolean().optional(),
  allowCustomProfilePictures: z.boolean().optional(),
  allowCustomGahooks: z.boolean().optional(),
  lobbyArenaEnabled: z.boolean().optional()
}).strict();

export type HostSettingsRequest = z.infer<typeof HostSettingsRequestSchema>;

/**
 * What the room reports back after a settings write.
 *
 * `retainedQuestions` is deliberately part of the contract: when a host
 * switches family or shortens the game, the UI has to be able to say how many
 * of their questions were kept rather than leaving them to discover a loss.
 */
export const HostSettingsResponseSchema = z.object({
  roundPreset: RoundPresetSchema.optional(),
  maxQuestionsPerPlayer: z.number().optional(),
  plannedTotalQuestions: z.number().optional(),
  estimatedDurationMs: z.number().optional(),
  approveQuestions: z.boolean().optional(),
  gameMode: GameModeSchema.optional(),
  allowCustomProfiles: z.boolean().optional(),
  allowCustomGahooks: z.boolean().optional(),
  gahookEffects: GahookEffectPolicySchema.optional(),
  lobbyArenaEnabled: z.boolean().optional(),
  gahookStealPoints: z.number().optional(),
  getGotPenaltyPoints: z.number().optional(),
  promptStyle: z.enum(["fun", "education"]).optional(),
  ok: z.literal(true),
  settingsRevision: z.number().int().nonnegative(),
  retainedQuestions: z.object({
    savedBank: z.number().int().nonnegative(),
    selectedForGame: z.number().int().nonnegative(),
    needingAttention: z.number().int().nonnegative()
  })
}).strict();

export type HostSettingsResponse = z.infer<typeof HostSettingsResponseSchema>;

/**
 * The rules a started game is frozen to.
 *
 * Once setup locks, results must be scored and explained by these values and
 * not by whatever the lobby currently shows. On reconnect the locked rules win
 * over a cached lobby snapshot, which is why they travel as their own object
 * rather than being inferred from the room.
 */
export interface LockedGameRules {
  readonly settings: GameSettings;
  readonly promptStyle: PromptStyle;
  readonly gahookEffects: GahookEffectPolicy;
  /** Rounds this game will actually play, not the preset's nominal maximum. */
  readonly plannedRounds: number;
  readonly lockedAt: number;
}

/**
 * The two answer keys, kept apart on purpose.
 *
 * `intendedAnswerId` is what Classic scores against and is chosen by a human;
 * it starts unset and must stay unset until someone chooses, because inventing
 * one is how an opinion prompt gains a fake correct answer.
 *
 * `authorPredictionId` is the author's guess at what the room will pick. It is
 * optional, earns the Majority author bonus only when the existing unanimity
 * condition is met, and never makes an answer "correct".
 */
export const QuestionAnswerKeysSchema = z.object({
  questionId: QuestionIdSchema,
  intendedAnswerId: AnswerIdSchema.nullable(),
  authorPredictionId: AnswerIdSchema.nullable()
}).strict();

export type QuestionAnswerKeys = z.infer<typeof QuestionAnswerKeysSchema>;

/** True when a question can be played under Classic rules. */
export function isClassicReady(keys: QuestionAnswerKeys): boolean {
  return keys.intendedAnswerId !== null;
}

/**
 * Why a question is not ready, phrased for the author rather than the server.
 * Returns null when nothing is wrong.
 */
export function questionReadinessProblem(
  keys: QuestionAnswerKeys,
  settings: GameSettings
): string | null {
  if (settings.gameFamily !== "quiz") return null;
  if (settings.quizScoring === "classic" && !isClassicReady(keys)) {
    return "Choose an intended answer for Classic.";
  }
  return null;
}
