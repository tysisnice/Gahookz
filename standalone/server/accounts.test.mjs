import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { accountResultLocation, createAccountService, createMemoryAccountRepository, clearSessionCookie, normaliseAccountReturnTo, parseCookies, sessionCookie, validatePublicOrigin } from "./accounts.mjs";

test("account cookies are opaque, HttpOnly and host-scoped when secure", () => {
  const cookie = sessionCookie("__Host-gahookz_session", "opaque_token", { secure: true, maxAge: 60 });
  assert.match(cookie, /^__Host-gahookz_session=opaque_token;/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.match(clearSessionCookie("gahookz_session"), /Max-Age=0/);
  assert.deepEqual(parseCookies("a=one; gahookz_session=two%20words"), { a: "one", gahookz_session: "two words" });
});

test("OIDC public origins require HTTPS except for loopback development", () => {
  assert.equal(validatePublicOrigin("https://play.example.com"), "https://play.example.com");
  assert.equal(validatePublicOrigin("http://localhost:3102"), "http://localhost:3102");
  assert.equal(validatePublicOrigin("http://play.example.com"), "");
  assert.equal(validatePublicOrigin("https://play.example.com/extra"), "");
  assert.equal(validatePublicOrigin("javascript:alert(1)"), "");
});

test("account redirects preserve only safe same-origin room paths", () => {
  assert.equal(normaliseAccountReturnTo("/room/ABCD?seat=host#ignored"), "/room/ABCD?seat=host");
  assert.equal(normaliseAccountReturnTo("https://evil.example/room/ABCD"), "/");
  assert.equal(normaliseAccountReturnTo("//evil.example/room/ABCD"), "/");
  assert.equal(normaliseAccountReturnTo("/\\evil.example/room/ABCD"), "/");
  assert.equal(accountResultLocation("/room/ABCD?seat=host", "connected"), "/room/ABCD?seat=host&account=connected");
  assert.equal(accountResultLocation("//evil.example", "error"), "/?account=error");
});

test("a verified identity gets a session, durable cosmetics, and one idempotent match aggregate", async () => {
  const repository = createMemoryAccountRepository();
  const account = await repository.upsertIdentity({
    provider: "google",
    subject: "test-subject",
    displayName: "Test Player",
    email: "player@example.test",
    avatarUrl: ""
  });
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await repository.createSession(tokenHash, account.id, Date.now() + 60_000);
  const service = await createAccountService({ repository, persistence: "memory", environment: "test" });
  const request = { headers: { cookie: "gahookz_session=" + token } };
  const authenticated = await service.authenticate(request);
  assert.equal(authenticated.id, account.id);
  assert.equal(service.publicStatus(authenticated).account.customGahookSlots, 1);

  const custom = { name: "Cloud Bonk", frames: [], backgroundId: "monkey", backgroundColor: "#ff3d8b", effectId: "shake", soundId: "bonk", customAudioDataUrl: "", customAudioName: "" };
  await service.saveCustomGahook(account.id, 0, custom);
  const match = {
    matchId: crypto.randomUUID(),
    accountId: account.id,
    roomCode: "TEST",
    gameMode: "quiz",
    score: 840,
    placement: 1,
    playerCount: 4,
    statDelta: { gamesPlayed: 1, wins: 1, podiums: 1, totalScore: 840, highScore: 840, answersSubmitted: 2, correctAnswers: 1 }
  };
  assert.equal(await service.recordMatch(match), true);
  assert.equal(await service.recordMatch(match), false);

  const refreshed = await service.authenticate(request);
  const status = service.publicStatus(refreshed).account;
  assert.equal(status.stats.gamesPlayed, 1);
  assert.equal(status.stats.totalScore, 840);
  assert.equal(status.savedCustomGahooks[0].configuration.name, "Cloud Bonk");
  await service.close();
});
