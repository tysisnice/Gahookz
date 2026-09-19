// Active, selected and parked questions share one retention/moderation inventory.
export function questionCollections(room) {
  return [room.questions, room.pendingQuestions, room.quizQuestions,
    ...Object.values(room.savedQuestionBank || {}).flatMap((bank) => [bank.questions, bank.pending])]
    .filter(Array.isArray);
}

export function allRoomQuestions(room) {
  return [...new Set(questionCollections(room).flat())];
}

export function removeStoredQuestions(room, predicate, { includeSelected = true } = {}) {
  let removed = 0;
  for (const collection of questionCollections(room)) {
    if (!includeSelected && collection === room.quizQuestions) continue;
    for (let index = collection.length - 1; index >= 0; index -= 1) {
      if (!predicate(collection[index])) continue;
      collection.splice(index, 1);
      removed += 1;
    }
  }
  return removed;
}
