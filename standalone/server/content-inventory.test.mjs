import test from 'node:test';
import assert from 'node:assert/strict';
import { storeRoomImage, pruneRoomMedia } from './media.mjs';
import { removeStoredQuestions } from './content-inventory.mjs';

test('hidden profiles and parked question images survive pruning; moderation removes parked copies', () => {
  const room = { code: 'TEST', players: {}, savedQuestionBank: { quiz: { questions: [], pending: [] } } };
  const image = storeRoomImage(room, 'data:image/png;base64,YQ==', { maxChars: 100, label: 'test' });
  room.players.a = { hiddenAvatarImageDataUrl: image };
  pruneRoomMedia(room); assert.equal(room.media.size, 1);
  room.players.a.hiddenAvatarImageDataUrl = '';
  room.savedQuestionBank.quiz.questions.push({ id: 'parked', imageDataUrl: image });
  pruneRoomMedia(room); assert.equal(room.media.size, 1);
  assert.equal(removeStoredQuestions(room, (q) => q.id === 'parked'), 1);
  pruneRoomMedia(room); assert.equal(room.media.size, 0);
});
