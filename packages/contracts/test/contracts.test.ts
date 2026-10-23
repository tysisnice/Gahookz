import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiErrorSchema,
  HealthResponseSchema,
  HerdAnswerReviewSchema,
  HerdResultsSchema,
  OwnHerdAssignmentSchema,
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
    bannedPlayers: [],
    serverOnlyFieldIsIgnored: true
  } as const;
  assert.equal(PublicSnapshotBaseSchema.parse(snapshot).code, "GOOK");
  assert.equal(PublicSnapshotBaseSchema.safeParse({ ...snapshot, gameMode: "oddball" }).success, false);
  assert.equal(PublicSnapshotBaseSchema.safeParse({ ...snapshot, code: "TOO-LONG" }).success, false);

  // The banned list reaches every client and the host screen prints it beside
  // the lobby, so a host who removes somebody over their profile picture must
  // not have that picture promoted to a permanent panel on the shared screen.
  const banned = { id: "player-9", name: "Removed", avatarId: "fox", avatarImageDataUrl: "", kickedAt: 1_785_000_000_000 } as const;
  assert.equal(PublicSnapshotBaseSchema.safeParse({ ...snapshot, bannedPlayers: [banned] }).success, true);
  assert.equal(PublicSnapshotBaseSchema.safeParse({ ...snapshot, bannedPlayers: [{ ...banned, avatarImageDataUrl: "/media/GOOK/" + "a".repeat(32) }] }).success, false,
    "a ban record must never carry the upload somebody was removed for");
  assert.equal(PublicSnapshotBaseSchema.safeParse({ ...snapshot, bannedPlayers: [{ ...banned, credential: "leak" }] }).success, false,
    "a ban record must not carry the credential it bans");
});

test("host presence fields are optional, nullable and never carry a credential", () => {
  const snapshot = {
    schemaVersion: 1,
    code: "GOOK",
    stateVersion: 9,
    serverTime: 1_785_000_000_000,
    isHost: false,
    gameMode: "quiz",
    roundPreset: "standard",
    phase: "lobby",
    players: [],
    ownPlayer: null,
    currentQuestion: null,
    bannedPlayers: []
  } as const;
  const away = { away: true, hostName: "Captain Waffles", since: 1_785_000_000_000, promoteAt: 1_785_000_060_000 } as const;
  const change = { id: "change-1", playerId: "player-2", name: "Disco Potato", at: 1_785_000_060_000, reason: "host-away" } as const;
  const replaced = { id: "change-1", name: "Disco Potato", at: 1_785_000_060_000 } as const;

  assert.equal(PublicSnapshotBaseSchema.safeParse(snapshot).success, true, "older snapshots without the fields stay valid");
  assert.equal(PublicSnapshotBaseSchema.safeParse({ ...snapshot, hostPresence: null, hostChange: null, ownHostReplaced: null }).success, true);
  assert.equal(PublicSnapshotBaseSchema.safeParse({ ...snapshot, hostPresence: away, hostChange: change, ownHostReplaced: replaced }).success, true);
  assert.equal(PublicSnapshotBaseSchema.safeParse({ ...snapshot, hostChange: { ...change, reason: "coup" } }).success, false);
  for (const secret of ["hostKey", "previousHostKey", "playerKey", "credential"]) {
    assert.equal(PublicSnapshotBaseSchema.safeParse({ ...snapshot, hostPresence: { ...away, [secret]: "leak" } }).success, false, "hostPresence must reject " + secret);
    assert.equal(PublicSnapshotBaseSchema.safeParse({ ...snapshot, hostChange: { ...change, [secret]: "leak" } }).success, false, "hostChange must reject " + secret);
    assert.equal(PublicSnapshotBaseSchema.safeParse({ ...snapshot, ownHostReplaced: { ...replaced, [secret]: "leak" } }).success, false, "ownHostReplaced must reject " + secret);
  }
});

// Both scoring engines derive `tieBrokenBySpeed` from the reason, and each has
// its own tests for all four reasons (see standalone/server/majority.test.mjs
// and packages/game-engine/test/herd.test.ts). What nothing checked was the
// payload: a reveal is built by `publicHerdResults`/`publicMajorityResults`,
// and a wrong flag there would reach players with the engines still correct.
// These cases pin that boundary. The `order` branch matters most and no live
// capture reaches it, because it needs two groups with identical vote counts,
// identical fastest times and identical averages.
test("a reveal payload may not explain its tie untruthfully", () => {
  const results = {
    answeredCount: 2,
    eligiblePlayerCount: 2,
    topCount: 1,
    winningAnswerId: "red",
    tiedByVotes: true,
    tieBrokenBySpeed: false,
    tieBreakReason: "order" as const,
    factCheck: null,
    groups: [{ answerId: "red", count: 1, winner: true, fastestElapsedMs: 3000, averageElapsedMs: 3000 }],
    playerResults: [{ playerId: "p1", answerId: "red", correct: true, points: 400 }],
    authorResults: [{ playerId: "p2", answerId: "red", voteCount: 1, points: 250, winner: true }]
  };

  assert.equal(HerdResultsSchema.safeParse(results).success, true, "an order tie-break is a legal reveal");
  assert.equal(
    HerdResultsSchema.safeParse({ ...results, tieBrokenBySpeed: true }).success, false,
    "speed must not take credit for a tie the answer order settled"
  );
  assert.equal(
    HerdResultsSchema.safeParse({ ...results, tieBreakReason: "average", tieBrokenBySpeed: true }).success, true,
    "an average tie-break is a speed win"
  );
  assert.equal(
    HerdResultsSchema.safeParse({ ...results, tiedByVotes: false, tieBreakReason: "fastest", tieBrokenBySpeed: true }).success, false,
    "a round that was not tied must not be explained as a tie-break"
  );
  assert.equal(
    HerdResultsSchema.safeParse({ ...results, winningAnswerId: "", tieBreakReason: "fastest", tieBrokenBySpeed: true }).success, false,
    "a round nobody answered has no winner and no tie-break"
  );
  assert.equal(
    HerdResultsSchema.safeParse({ ...results, winningAnswerId: "", tiedByVotes: false, tieBreakReason: "none" }).success, true,
    "no votes means no winning answer and reason none"
  );
  assert.equal(
    HerdResultsSchema.safeParse({ ...results, tieBreakReason: "sorted-by-vibes" }).success, false,
    "only the four declared reasons are legal"
  );
});

test("a Herd writing assignment names its writer to them and to nobody else", () => {
  // Pinned at the payload boundary as well as in a capture, because whether a
  // capture contains the field depends on the server that produced it, and
  // this is the rule the server is meant to be held to.
  const writer = { id: "p2", name: "Bo", avatarId: "fox", avatarImageDataUrl: "" };
  const assignment = {
    questionId: "q1",
    answerId: "red",
    text: "A goose",
    imageDataUrl: "",
    submitted: true,
    question: {
      id: "q1",
      text: "What happens next?",
      namedPlayerNames: [],
      imageDataUrl: "",
      author: { id: "p1", name: "Ada", avatarId: "panda", avatarImageDataUrl: "" }
    }
  };

  assert.equal(
    OwnHerdAssignmentSchema.safeParse({ ...assignment, answerAuthor: writer }).success, true,
    "a writer's own assignment names them"
  );
  assert.equal(
    OwnHerdAssignmentSchema.safeParse(assignment).success, false,
    "a writer's own assignment must say whose it is"
  );

  assert.equal(
    HerdAnswerReviewSchema.safeParse(assignment).success, true,
    "the host's review carries the prompt, the text and the slot"
  );
  assert.equal(
    HerdAnswerReviewSchema.safeParse({ ...assignment, answerAuthor: writer }).success, false,
    "the host's review, shown on the shared screen, must not name the writer"
  );
  assert.equal(
    HerdAnswerReviewSchema.safeParse({ ...assignment, answerAuthor: null }).success, false,
    "an explicit null is still the field, and the field does not belong here"
  );
  // The prompt's own author stays public: Herd credits the prompt, not the answer.
  assert.equal(
    HerdAnswerReviewSchema.safeParse({ ...assignment, question: { ...assignment.question, author: undefined } }).success, false,
    "a prompt is still credited to whoever set it"
  );
});
