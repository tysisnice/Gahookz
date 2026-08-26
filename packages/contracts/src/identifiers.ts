declare const gahookzBrand: unique symbol;

export type Brand<Value, Name extends string> = Value & {
  readonly [gahookzBrand]: Name;
};

export type RoomCode = Brand<string, "RoomCode">;
export type PlayerId = Brand<string, "PlayerId">;
export type QuestionId = Brand<string, "QuestionId">;
export type AnswerId = Brand<string, "AnswerId">;
export type Credential = Brand<string, "Credential">;
export type MediaUrl = Brand<string, "MediaUrl">;

export const ROOM_CODE_PATTERN = /^[A-Z]{4}$/;
export const MEDIA_URL_PATTERN = /^\/media\/[A-Z]{4}\/[a-f0-9]{32}$/i;
