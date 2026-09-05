import assert from "node:assert/strict";
import test from "node:test";
import {
  admitCredential,
  initialiseRoomAuth,
  isCredentialAdmitted,
  isCredentialBanned,
  isHostCredential,
  registerPlayerCredential,
  revokeCredentialAdmission,
  unbanPlayerCredential,
  unregisterPlayerCredential } from
"./auth.mjs";

function room(hostKey = "host-key") {
  return initialiseRoomAuth({ code: "TEST", hostKey, players: {} });
}

test("a verified password admits one credential without joining a player", () => {
  const lobby = room();
  assert.equal(isCredentialAdmitted(lobby, "guest-key"), false);
  admitCredential(lobby, "guest-key");
  assert.equal(isCredentialAdmitted(lobby, "guest-key"), true);
  assert.equal(isCredentialAdmitted(lobby, "other-key"), false);
  assert.equal(isCredentialAdmitted(lobby, ""), false);
});

test("admitted credentials are bounded and evict the least recently admitted", () => {
  const lobby = room();
  for (let index = 0; index < 600; index += 1) admitCredential(lobby, "key-" + index);
  assert(lobby.admittedCredentials.size <= 512);
  assert.equal(isCredentialAdmitted(lobby, "key-0"), false);
  assert.equal(isCredentialAdmitted(lobby, "key-599"), true);
});

test("re-admitting an existing credential refreshes it rather than duplicating it", () => {
  const lobby = room();
  admitCredential(lobby, "guest-key");
  admitCredential(lobby, "guest-key");
  assert.equal(lobby.admittedCredentials.size, 1);
  revokeCredentialAdmission(lobby, "guest-key");
  assert.equal(isCredentialAdmitted(lobby, "guest-key"), false);
});

test("banning a player removes its admission so the password cannot re-open the room", () => {
  const lobby = room();
  lobby.players["p1"] = { id: "p1" };
  registerPlayerCredential(lobby, "player-key", "p1");
  admitCredential(lobby, "player-key");

  unregisterPlayerCredential(lobby, "p1", { ban: true });

  assert.equal(isCredentialBanned(lobby, "player-key"), true);
  assert.equal(isCredentialAdmitted(lobby, "player-key"), false);

  unbanPlayerCredential(lobby, "player-key");
  assert.equal(isCredentialBanned(lobby, "player-key"), false);
});

test("leaving without a ban keeps the credential unbanned", () => {
  const lobby = room();
  lobby.players["p1"] = { id: "p1" };
  registerPlayerCredential(lobby, "player-key", "p1");
  unregisterPlayerCredential(lobby, "p1");
  assert.equal(isCredentialBanned(lobby, "player-key"), false);
});

test("host credentials compare in constant time and reject length mismatches", () => {
  const lobby = room("host-key");
  assert.equal(isHostCredential(lobby, "host-key"), true);
  assert.equal(isHostCredential(lobby, "host-keyy"), false);
  assert.equal(isHostCredential(lobby, "wrong-key"), false);
  assert.equal(isHostCredential(lobby, ""), false);
});
