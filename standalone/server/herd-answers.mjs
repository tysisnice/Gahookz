/**
 * Turning a Herd assignment plan into the answers a room can see.
 *
 * Two different numbers describe the same answer and they must not be
 * confused. `answerIndex` is where a writer sits in the writing rotation the
 * allocator produced; `displayIndex` is the slot the room renders them in. The
 * room shows slots in a fixed order -- Red, Blue, Yellow, Green -- so if the
 * displayed slot were the rotation position, the colour of an answer would
 * carry information about who wrote it. Under the old circular allocator that
 * information was the author's identity outright. It is now the writer's
 * remaining workload, which is just as readable at a party: whoever has
 * written least so far would always sit at Red.
 *
 * So the displayed identity is taken from `displayIndex`, which the engine
 * permutes independently for every question, and nothing here may fall back to
 * `answerIndex`. The permutation is spent into these answer objects rather than
 * retained as a private map, so there is no seed and no assignment table for a
 * payload to leak later.
 */

/**
 * The display table has to be at least as large as the number of writers a
 * question can take, or a writer would be handed a slot that does not exist
 * and their answer would reach the room with no id -- unvotable, unscorable
 * and invisible to moderation. Called once at startup so the mismatch is a
 * boot failure in testing rather than a broken round at a party.
 */
export function assertHerdDisplaySlots(answerMeta, maximumPerQuestion) {
  const slots = Array.isArray(answerMeta) ? answerMeta.length : 0;
  if (!(slots > 0)) throw new Error("Herd answers need at least one display slot");
  if (maximumPerQuestion > slots) {
    throw new Error(
      `Herd allows ${maximumPerQuestion} writers per question but only ${slots} display slots exist; ` +
      "add a display slot or lower HERD_MAX_AUTHORED_ANSWERS"
    );
  }
  const ids = answerMeta.map((meta) => meta?.id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw new Error("Every Herd display slot needs its own non-empty id");
  }
  return slots;
}

/**
 * Build one question's answers, in displayed order.
 *
 * `assignments` is a plan's list for a single question. `writerProfile` looks a
 * writer up by id and may return nothing: a writer who has left still owns
 * their slot, because removing it would renumber everyone else's answers
 * mid-game. The impossible states below cannot arise from a plan the engine
 * produced -- `assertHerdDisplaySlots` rules out the out-of-range case and the
 * permutation rules out the duplicates -- so they are a loud stop rather than
 * a silent repair: an answer with the wrong identity is worse than a round
 * that refuses to start.
 */
export function buildHerdAnswerSlots(assignments, { answerMeta, writerProfile, fallbackAvatarId = "" }) {
  const seenSlots = new Set();
  const seenWriters = new Set();
  // Sorted here rather than trusted from the plan: the room renders this array
  // in order, so display order is a property of the answers themselves and a
  // change to how the engine orders a plan cannot quietly reseat anybody.
  const inDisplayOrder = [...(assignments || [])].
    sort((first, second) => (first?.displayIndex ?? 0) - (second?.displayIndex ?? 0));
  return inDisplayOrder.map((assignment) => {
    const slot = assignment?.displayIndex;
    const meta = Number.isInteger(slot) ? answerMeta[slot] : undefined;
    if (!meta?.id) {
      throw new Error(`Herd assignment claims display slot ${String(slot)}, which does not exist`);
    }
    if (seenSlots.has(slot)) {
      throw new Error(`Two Herd writers claim display slot ${String(slot)} on the same question`);
    }
    seenSlots.add(slot);
    const writerId = assignment.answerAuthorId;
    if (seenWriters.has(writerId)) {
      // Writing is addressed by question and credential, not by slot, so a
      // writer holding two slots on one question would silently drop one.
      throw new Error("A Herd writer was given two answers on the same question");
    }
    seenWriters.add(writerId);
    const writer = writerProfile?.(writerId);
    return {
      ...meta,
      text: "",
      correct: false,
      authorId: writerId,
      authorName: writer?.name || "Player",
      authorAvatarId: writer?.avatarId || fallbackAvatarId,
      authorAvatarImageDataUrl: writer?.avatarImageDataUrl || ""
    };
  });
}
