import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ROOM_ABANDON_GRACE_MS,
  HOST_CHANGE_NOTICE_MS,
  MAX_ROOM_ABANDON_GRACE_MS,
  MIN_ROOM_ABANDON_GRACE_MS,
  chooseHostSuccessor,
  hostAwayState,
  isPromotionDue,
  publicHostChange,
  publicHostPresence,
  publicOwnHostReplaced,
  resolveRoomAbandonGraceMs,
  sameCredential
} from './host-presence.mjs';

test('the abandon grace defaults to one minute and is clamped', () => {
  assert.equal(DEFAULT_ROOM_ABANDON_GRACE_MS, 60_000);
  assert.equal(resolveRoomAbandonGraceMs(undefined), 60_000);
  assert.equal(resolveRoomAbandonGraceMs(''), 60_000);
  assert.equal(resolveRoomAbandonGraceMs('not a number'), 60_000);
  // Zero is "unset", not "reap immediately": the old instant deletion is the
  // behaviour this replaces and must not come back through a typo.
  assert.equal(resolveRoomAbandonGraceMs('0'), 60_000);
  assert.equal(resolveRoomAbandonGraceMs('1500'), 1500);
  assert.equal(resolveRoomAbandonGraceMs('-5'), MIN_ROOM_ABANDON_GRACE_MS);
  assert.equal(resolveRoomAbandonGraceMs('10'), MIN_ROOM_ABANDON_GRACE_MS);
  assert.equal(resolveRoomAbandonGraceMs(String(24 * 60 * 60 * 1000)), MAX_ROOM_ABANDON_GRACE_MS);
});

test('credentials compare exactly and never match when empty', () => {
  assert.equal(sameCredential('host-key-123', 'host-key-123'), true);
  assert.equal(sameCredential('host-key-123', 'host-key-124'), false);
  assert.equal(sameCredential('short', 'longer-key'), false);
  assert.equal(sameCredential('', ''), false);
  assert.equal(sameCredential(undefined, undefined), false);
});

test('the host-away clock promotes only once the grace has fully elapsed', () => {
  const away = hostAwayState({ now: 1_000, graceMs: 60_000, hostName: 'Captain Waffles' });
  assert.deepEqual(away, { since: 1_000, promoteAt: 61_000, hostName: 'Captain Waffles' });
  assert.equal(isPromotionDue(away, 60_999), false);
  assert.equal(isPromotionDue(away, 61_000), true);
  assert.equal(isPromotionDue(null, 99_999), false);
});

test('the successor is the earliest-joined connected, eligible player', () => {
  const players = [
    { id: 'c', joinedAt: 300, connected: true },
    { id: 'a', joinedAt: 100, connected: false },
    { id: 'b', joinedAt: 200, connected: true },
    { id: 'banned', joinedAt: 50, connected: true }
  ];
  const isEligible = (player) => player.id !== 'banned';
  assert.equal(chooseHostSuccessor(players, { isEligible })?.id, 'b', 'a disconnected player must never be chosen');
  assert.equal(chooseHostSuccessor(players)?.id, 'banned', 'without a filter the earliest connected player wins');
  assert.equal(chooseHostSuccessor([{ id: 'x', joinedAt: 1, connected: false }]), null);
  assert.equal(chooseHostSuccessor([]), null);
  assert.equal(chooseHostSuccessor(null), null);
});

test('ties in join time resolve the same way every time', () => {
  const players = [{ id: 'zed', joinedAt: 5, connected: true }, { id: 'amy', joinedAt: 5, connected: true }];
  assert.equal(chooseHostSuccessor(players)?.id, 'amy');
  assert.equal(chooseHostSuccessor([...players].reverse())?.id, 'amy');
});

test('public host presence carries no credentials', () => {
  assert.equal(publicHostPresence(null), null);
  const view = publicHostPresence({ ...hostAwayState({ now: 10, graceMs: 20, hostName: 'Host' }), hostKey: 'secret' });
  assert.deepEqual(view, { away: true, hostName: 'Host', since: 10, promoteAt: 30 });
});

test('the host-change notice is published only while it is recent, without the old key', () => {
  const change = { id: 'change-1', playerId: 'p1', name: 'Disco Potato', at: 1_000, reason: 'host-away', previousHostKey: 'old-host-key' };
  const view = publicHostChange(change, 1_000 + HOST_CHANGE_NOTICE_MS - 1);
  assert.deepEqual(view, { id: 'change-1', playerId: 'p1', name: 'Disco Potato', at: 1_000, reason: 'host-away' });
  assert.equal(JSON.stringify(view).includes('old-host-key'), false);
  assert.equal(publicHostChange(change, 1_000 + HOST_CHANGE_NOTICE_MS), null);
  assert.equal(publicHostChange(null, 0), null);
});

test('only the replaced host is told they were replaced, and only for an away promotion', () => {
  const change = { id: 'change-1', playerId: 'p1', name: 'Disco Potato', at: 1_000, reason: 'host-away', previousHostKey: 'old-host-key' };
  assert.deepEqual(publicOwnHostReplaced(change, 'old-host-key', false), { id: 'change-1', name: 'Disco Potato', at: 1_000 });
  assert.equal(publicOwnHostReplaced(change, 'someone-else', false), null);
  assert.equal(publicOwnHostReplaced(change, '', false), null);
  assert.equal(publicOwnHostReplaced(change, 'old-host-key', true), null, 'a host who is host again is not "replaced"');
  assert.equal(publicOwnHostReplaced({ ...change, reason: 'handover' }, 'old-host-key', false), null, 'a deliberate handover needs no explanation');
});
