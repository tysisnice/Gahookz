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
  currentQuestion: z.unknown().nullable()
}).passthrough();

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ApiSuccess = z.infer<typeof ApiSuccessSchema>;
export type RoomCommandEnvelope = z.infer<typeof RoomCommandEnvelopeSchema>;
export type PublicPlayerBase = z.infer<typeof PublicPlayerBaseSchema>;
export type PublicSnapshotBase = z.infer<typeof PublicSnapshotBaseSchema>;
export type GameSettingsInput = z.infer<typeof GameSettingsInputSchema>;
