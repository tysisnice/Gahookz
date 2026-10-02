import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { accountResultLocation, createAccountService, createMemoryAccountRepository, clearSessionCookie, MAX_PROFILE_IMAGE_CHARS, normaliseAccountProfile, normaliseAccountReturnTo, parseCookies, sessionCookie, validatePublicOrigin } from "./accounts.mjs";

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
  // An account keeps both slots a guest can draw in a room.
  assert.equal(service.publicStatus(authenticated).account.customGahookSlots, 2);

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

const quietLogger = { warn() {}, log() {} };
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function cookieValue(setCookie) {
  return String(setCookie).split(";", 1)[0];
}

test("developer sign-in needs the opt-in and a development environment", async () => {
  const warnings = [];
  const logger = { warn: (message) => warnings.push(message), log() {} };
  const production = await createAccountService({ environment: "production", devLogin: "1", logger });
  assert.equal(production.devLoginAvailable, false, "production must ignore GAHOOKZ_DEV_LOGIN");
  assert.equal(production.publicStatus().devLoginAvailable, false);
  await assert.rejects(production.devLogin("Tester"), (error) => error.statusCode === 404 && error.code === "dev_login_unavailable");
  assert.ok(warnings.some((message) => /GAHOOKZ_DEV_LOGIN is ignored/.test(message)), "the refusal is logged");

  const typo = await createAccountService({ environment: "prod", devLogin: "1", logger: quietLogger });
  assert.equal(typo.devLoginAvailable, false, "an unknown environment fails closed");
  const withoutFlag = await createAccountService({ environment: "development", devLogin: "", logger: quietLogger });
  assert.equal(withoutFlag.devLoginAvailable, false, "development without the opt-in stays off");
  const enabled = await createAccountService({ environment: "development", devLogin: "1", logger: quietLogger });
  assert.equal(enabled.devLoginAvailable, true);
  await assert.rejects(enabled.devLogin("   "), (error) => error.statusCode === 400);
});

test("developer sign-in returns to the same synthetic account by name", async () => {
  const service = await createAccountService({ environment: "test", devLogin: "1", logger: quietLogger });
  const first = await service.devLogin("Test Pilot");
  const second = await service.devLogin("  test pilot ");
  assert.equal(first.account.id, second.account.id, "the same name (any case) is the same account");
  const signedIn = await service.authenticate({ headers: { cookie: cookieValue(second.cookie) } });
  assert.equal(signedIn.id, first.account.id);
  const view = service.publicStatus(signedIn).account;
  assert.equal(view.developer, true, "the account is labelled as a developer account");
  assert.equal(Object.prototype.hasOwnProperty.call(view, "email"), false, "no email is exposed");
});

test("a saved profile is bounded, normalised on the way in and out, and survives sign-out", async () => {
  const repository = createMemoryAccountRepository();
  // Stands in for server.js's normaliser after the Sad Pig change.
  const normaliseGahookForm = (value) => ({ capybara: "pig" })[value] || (["monkey", "pig", "custom"].includes(value) ? value : "monkey");
  const service = await createAccountService({ repository, environment: "test", devLogin: "1", normaliseGahookForm, logger: quietLogger });
  const { account, cookie } = await service.devLogin("Profile Keeper");
  const saved = await service.saveProfile(account.id, {
    playerName: "  Bananas   Forever, the longest name you ever saw  ",
    avatarId: "Banana",
    avatarImageDataUrl: TINY_PNG,
    gahookForm: "capybara"
  });
  assert.equal(saved.playerName.length <= 24, true);
  assert.equal(saved.gahookForm, "pig", "a legacy form id is stored as its replacement");
  assert.equal(saved.avatarId, "banana");

  const request = { headers: { cookie: cookieValue(cookie) } };
  await service.logout(request);
  assert.equal(await service.authenticate(request), null, "signed out");
  const again = await service.devLogin("Profile Keeper");
  const restored = service.clientStatus(await service.authenticate({ headers: { cookie: cookieValue(again.cookie) } })).account.profile;
  assert.equal(restored.playerName, saved.playerName);
  assert.equal(restored.avatarImageDataUrl, TINY_PNG);
  assert.equal(restored.gahookForm, "pig");
  assert.ok(restored.updatedAt > 0);

  // A value written before a rename is mapped on read, too.
  await repository.saveProfile(account.id, { ...saved, gahookForm: "capybara" });
  assert.equal(service.publicStatus(await repository.getAccount(account.id)).account.profile.gahookForm, "pig");

  await assert.rejects(service.saveProfile(account.id, { playerName: "   " }), (error) => error.statusCode === 400);
  await assert.rejects(service.saveProfile("no-such-account", { playerName: "Ghost" }), (error) => error.statusCode === 401);
});

test("profile pictures must be bounded image data URLs", () => {
  assert.equal(normaliseAccountProfile({ playerName: "A", avatarImageDataUrl: TINY_PNG }).avatarImageDataUrl, TINY_PNG);
  assert.equal(normaliseAccountProfile({ playerName: "A", avatarImageDataUrl: "data:text/html;base64,PGgxPg==" }).avatarImageDataUrl, "");
  assert.equal(normaliseAccountProfile({ playerName: "A", avatarImageDataUrl: "/media/ABCD/" + "a".repeat(32) }).avatarImageDataUrl, "");
  const oversized = "data:image/png;base64," + "A".repeat(MAX_PROFILE_IMAGE_CHARS);
  assert.equal(normaliseAccountProfile({ playerName: "A", avatarImageDataUrl: oversized }).avatarImageDataUrl, "");
  assert.equal(normaliseAccountProfile({ playerName: "A", gahookForm: "<script>" }).gahookForm, "");
});

test("both custom Gahook slots are kept, entitlements add more, and the browser gets previews only", async () => {
  const repository = createMemoryAccountRepository();
  const service = await createAccountService({ repository, environment: "test", devLogin: "1", logger: quietLogger });
  const { account } = await service.devLogin("Slot Keeper");
  const custom = (name) => ({ name, frames: [TINY_PNG], backgroundId: "monkey", backgroundColor: "#ff3d8b", effectId: "shake", soundId: "bonk", customAudioDataUrl: "", customAudioName: "" });
  await service.saveCustomGahook(account.id, 0, custom("First"));
  await service.saveCustomGahook(account.id, 1, custom("Second"));
  await assert.rejects(service.saveCustomGahook(account.id, 2, custom("Third")), (error) => error.code === "slot_locked");
  await assert.rejects(service.saveCustomGahook(account.id, 0, { ...custom("Huge"), frames: ["x".repeat(1_000_001)] }), (error) => error.code === "gahook_too_large");
  const status = service.clientStatus(await repository.getAccount(account.id));
  assert.deepEqual(status.account.savedCustomGahooks, [
    { slot: 0, name: "First", previewFrame: TINY_PNG },
    { slot: 1, name: "Second", previewFrame: TINY_PNG }
  ]);
  assert.equal(status.account.customGahookSlots, 2);
});

test("deleting an account removes it, its sessions everywhere, its stats and its saved data", async () => {
  const repository = createMemoryAccountRepository();
  const service = await createAccountService({ repository, environment: "test", devLogin: "1", logger: quietLogger });
  const keep = await service.devLogin("Someone Else");
  const phone = await service.devLogin("Leaving Player");
  const laptop = await service.devLogin("Leaving Player");
  const accountId = phone.account.id;
  await service.saveProfile(accountId, { playerName: "Leaving", avatarId: "banana", gahookForm: "monkey" });
  await service.saveCustomGahook(accountId, 0, { name: "Gone", frames: [], backgroundId: "monkey", backgroundColor: "#ff3d8b", effectId: "shake", soundId: "bonk" });
  const match = { matchId: crypto.randomUUID(), accountId, roomCode: "TEST", gameMode: "quiz", score: 10, placement: 1, playerCount: 2, statDelta: { gamesPlayed: 1 } };
  assert.equal(await service.recordMatch(match), true);
  const laptopRequest = { headers: { cookie: cookieValue(laptop.cookie) } };
  assert.ok(await service.authenticate(laptopRequest), "the second device is signed in (and cached)");

  const result = await service.deleteAccount(accountId);
  assert.equal(result.deleted, true);
  assert.match(result.cookie, /Max-Age=0/, "the browser's session cookie is cleared");
  assert.equal(await repository.getAccount(accountId), null);
  assert.equal(await service.authenticate(laptopRequest), null, "every other device is signed out at once");
  assert.equal(await service.authenticate({ headers: { cookie: cookieValue(phone.cookie) } }), null);
  assert.deepEqual(repository.counts(), { accounts: 1, identities: 1, sessions: 1, matches: 0 }, "only the other account remains");
  assert.equal(await service.recordMatch({ ...match, matchId: crypto.randomUUID() }), false, "a late career result for a deleted account is dropped");
  assert.ok(await service.authenticate({ headers: { cookie: cookieValue(keep.cookie) } }), "other accounts are untouched");
  assert.equal((await service.deleteAccount(accountId)).deleted, false, "deleting twice is harmless");

  const fresh = await service.devLogin("Leaving Player");
  assert.notEqual(fresh.account.id, accountId, "signing in again starts a new, empty account");
  assert.equal(service.publicStatus(fresh.account).account.profile, null);
});
