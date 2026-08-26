import * as z from "zod";
import {
  COMMAND_SCHEMA_VERSION,
  GAME_MODES,
  GAME_PHASES,
  ROUND_PRESETS,
  SNAPSHOT_SCHEMA_VERSION
} from "./game.ts";
import { MEDIA_URL_PATTERN, ROOM_CODE_PATTERN } from "./identifiers.ts";

export const RoomCodeSchema = z.string().regex(ROOM_CODE_PATTERN);
export const PlayerIdSchema = z.string().min(1).max(128);
export const QuestionIdSchema = z.string().min(1).max(128);
export const AnswerIdSchema = z.string().min(1).max(32);
export const CredentialSchema = z.string().min(16).max(256);
export const MediaUrlSchema = z.string().regex(MEDIA_URL_PATTERN);
export const UnixMillisecondsSchema = z.number().int().nonnegative();

export const GameModeSchema = z.enum(GAME_MODES);
export const GamePhaseSchema = z.enum(GAME_PHASES);
export const RoundPresetSchema = z.enum(ROUND_PRESETS);

export const HealthResponseSchema = z.object({
  schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
  ok: z.literal(true),
  serverTime: UnixMillisecondsSchema,
  release: z.string().min(1).max(128),
  builtAt: z.string().max(128)
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
