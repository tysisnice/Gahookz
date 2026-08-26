import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiErrorSchema,
  HealthResponseSchema,
  PublicSnapshotBaseSchema,
  RoomCommandEnvelopeSchema
} from "../src/index.ts";

test("health responses reject malformed or extra fields", () => {
  const valid = {
    schemaVersion: 1,
    ok: true,
    serverTime: 1_785_000_000_000,
    release: "release-0123456789abcdef",
    builtAt: "2026-08-10T00:00:00.000Z"
  };
  assert.deepEqual(HealthResponseSchema.parse(valid), valid);
  assert.equal(HealthResponseSchema.safeParse({ ...valid, serverTime: -1 }).success, false);
  assert.equal(HealthResponseSchema.safeParse({ ...valid, credential: "must-not-leak" }).success, false);
});

test("API errors preserve endpoint metadata while enforcing the base contract", () => {
  const parsed = ApiErrorSchema.parse({
    ok: false,
    error: "That room does not exist.",
    roomMissing: true,
    retryAfterMs: 500
  });
  assert.equal(parsed.roomMissing, true);
  assert.equal(parsed.retryAfterMs, 500);
  assert.equal(ApiErrorSchema.safeParse({ ok: true, error: "wrong discriminator" }).success, false);
});

test("command envelopes are versioned and only accept API paths", () => {
  const command = {
    schemaVersion: 1,
    path: "/api/answer",
    payload: { code: "GOOK", answerId: "blue" }
  } as const;
  assert.deepEqual(RoomCommandEnvelopeSchema.parse(command), command);
  assert.equal(RoomCommandEnvelopeSchema.safeParse({ ...command, schemaVersion: 2 }).success, false);
  assert.equal(RoomCommandEnvelopeSchema.safeParse({ ...command, path: "/information" }).success, false);
});

test("public snapshot base accepts role-filtered live snapshots and rejects invalid modes", () => {
  const snapshot = {
    schemaVersion: 1,
    code: "GOOK",
    stateVersion: 4,
    serverTime: 1_785_000_000_000,
    isHost: false,
    gameMode: "majority",
    roundPreset: "quick",
    phase: "answering",
    players: [{ id: "player-1", name: "Quokka", score: 500, connected: true }],
    ownPlayer: { id: "player-1", name: "Quokka", score: 500, connected: true },
    currentQuestion: { id: "question-1" },
    serverOnlyFieldIsIgnored: true
  } as const;
  assert.equal(PublicSnapshotBaseSchema.parse(snapshot).code, "GOOK");
  assert.equal(PublicSnapshotBaseSchema.safeParse({ ...snapshot, gameMode: "oddball" }).success, false);
  assert.equal(PublicSnapshotBaseSchema.safeParse({ ...snapshot, code: "TOO-LONG" }).success, false);
});
