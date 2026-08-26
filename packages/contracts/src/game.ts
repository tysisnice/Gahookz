export const GAME_MODES = ["quiz", "majority", "herd"] as const;
export type GameMode = (typeof GAME_MODES)[number];

export const GAME_PHASES = [
  "lobby",
  "building",
  "herd-writing",
  "reading",
  "answering",
  "reveal",
  "finished"
] as const;
export type GamePhase = (typeof GAME_PHASES)[number];

export const ROUND_PRESETS = ["quick", "standard", "custom"] as const;
export type RoundPreset = (typeof ROUND_PRESETS)[number];

export const SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const COMMAND_SCHEMA_VERSION = 1 as const;
