// What the host may remove from the reports list, and how each subject is named
// when it is removed.
//
// This is the policy half of host moderation, kept out of both the dialog and
// app.jsx so it can be tested on its own — the same reason the server's Skip and
// Pause policy lives in server/phase-controls.mjs. Nothing here touches the
// network or the DOM.

/**
 * Subjects the host can remove straight from a report, beyond chat.
 *
 * Chat keeps its own button because that one needs the message itself, to quote
 * it and to show whether it is still in the room. A "room" report is somebody
 * saying something is generally wrong, so there is nothing to remove, and a
 * reported player is handled by kicking them or clearing their pictures from
 * the player card.
 */
export const REMOVABLE_SUBJECT_KINDS = Object.freeze(["answer", "question"]);

/** True when the reports list should offer a Remove button for this subject. */
export function canRemoveSubject(subjectKind) {
  return REMOVABLE_SUBJECT_KINDS.includes(String(subjectKind || ""));
}

/**
 * A report's subject in the shape `/api/host/remove-content` expects.
 *
 * An answer has to be named by its prompt as well as itself, because answer ids
 * are colour names that every prompt reuses — `/api/host/remove-content` would
 * otherwise blank the same colour in every question. The Report control beside
 * an answer tile already sends the pair joined as `"<questionId>:<answerId>"`,
 * so they are split here rather than widening the stored report.
 *
 * The split takes the *last* colon, because a question id is server-generated
 * and an answer id is a colour name with no colon in it. A subject with no
 * colon falls through as an answer id on its own, which the server refuses with
 * "That answer is no longer here." instead of matching something else: without
 * a questionId it compares the id against answer *authors*, and a bare answer
 * id is not a player id.
 */
export function removalRequestFor(report) {
  const subjectId = String(report?.subjectId || "");
  if (report?.subjectKind === "question") return { kind: "question", targetId: subjectId };
  const separator = subjectId.lastIndexOf(":");
  if (separator <= 0) return { kind: "herd-answer", targetId: subjectId };
  return { kind: "herd-answer", questionId: subjectId.slice(0, separator), targetId: subjectId.slice(separator + 1) };
}
