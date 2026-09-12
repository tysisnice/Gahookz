// The reveal, as its own feature.
//
// Moved out of app.jsx unchanged. The plan asks for relocation and visual work
// to be separate changes, so this is a mechanical extraction: any regression
// here can only have been caused by the move itself.
//
// `AnswerGrid` arrives as a prop rather than an import, because it lives in
// app.jsx and importing it back would create a cycle. This is the same shape
// the arena module already uses for `Avatar`.

import React from "react";

// The reveal must describe the rule that actually decided it. "Quickest pick
// wins" was shown for every tie, including ties settled by the stable answer
// order, which told players something untrue about their own game.
// Shown after a Majority or Herd reveal when the prompt came from verified
// content. Separate from the winning answer on purpose: the room's vote decides
// the points, and a popular wrong answer is still the winner. Saying otherwise
// would relabel a wrong fact as correct.
export function FactCheckPanel({ results }) {
  const factCheck = results?.factCheck;
  if (!factCheck) return null;
  return (
    <section className="fact-check" aria-label="Fact check">
      <strong>Fact check</strong>
      <p className="fact-check-answer">{factCheck.answerText}</p>
      {factCheck.explanation ? <p className="fact-check-explanation">{factCheck.explanation}</p> : null}
    </section>);

}

// Emphasise the player a prompt names.
//
// Done by splitting the text and returning React elements, never by putting
// markup into the string. A display name is chosen by the player it belongs
// to, so building HTML from it would hand every room an injection vector for
// the price of typing a name. React escapes each fragment it renders here.
export function PromptText({ text, names = [] }) {
  const value = String(text ?? "");
  const matches = (names || []).map((name) => String(name ?? "")).filter((name) => name.length > 1);
  if (!matches.length) return value;

  // Longest first, so a name that contains another is not split by it.
  const ordered = [...matches].sort((left, right) => right.length - left.length);
  let parts = [value];
  for (const name of ordered) {
    const next = [];
    for (const part of parts) {
      if (typeof part !== "string") {
        next.push(part);
        continue;
      }
      const pieces = part.split(name);
      pieces.forEach((piece, index) => {
        if (index > 0) next.push({ name });
        if (piece) next.push(piece);
      });
    }
    parts = next;
  }
  return parts.map((part, index) =>
  typeof part === "string" ?
  <React.Fragment key={index}>{part}</React.Fragment> :
  <strong className="prompt-player-name" key={index}>{part.name}</strong>
  );
}

export function tieBreakLabel(results, settledText) {
  const reason = results?.tieBreakReason ||
    (results?.tieBrokenBySpeed ? "fastest" : results?.tiedByVotes ? "order" : "none");
  if (reason === "fastest") return "Vote tie · quickest pick wins";
  if (reason === "average") return "Vote tie · fastest on average";
  if (reason === "order") return "Exact tie · settled by answer order";
  return settledText;
}

export function HerdRevealBreakdown({ question, lobby, AnswerGrid }) {
  const results = question?.herdResults;
  if (!results) return null;
  const ownVote = results.playerResults?.find((result) => result.playerId === lobby.ownPlayer?.id);
  const ownAuthor = results.authorResults?.find((result) => result.playerId === lobby.ownPlayer?.id);
  return (
    <section className="majority-reveal-breakdown herd-reveal-breakdown">
      <header>
        <span>{tieBreakLabel(results, "The Herd has spoken")}</span><FactCheckPanel results={results} />
        <strong>{results.topCount} vote{results.topCount === 1 ? "" : "s"} for the favourite</strong>
        <p>Up to 500 points for picking the favourite, plus up to 500 for every vote your authored answer attracted.</p>
      </header>
      <AnswerGrid answers={question.answers || []} reveal answerSelections={lobby.answerSelections} players={lobby.players} questionId={question.id} />
      {/* Two separate ways to score a Herd round, kept visually separate
          because they are earned differently: one for picking the room's
          favourite, one for writing an answer other people picked. The total
          is shown so it reconciles with the leaderboard rather than leaving
          people to add it up. */}
      <div className="round-score-breakdown">
        <div>
          <dt>Points for your vote</dt>
          <dd>{ownVote ? "+" + ownVote.points : "no pick"}</dd>
        </div>
        <div>
          <dt>Points for your answer</dt>
          <dd>{ownAuthor ? "+" + ownAuthor.points : "—"}</dd>
        </div>
        <div className="round-score-total">
          <dt>This round</dt>
          <dd>+{(ownVote?.points || 0) + (ownAuthor?.points || 0)}</dd>
        </div>
      </div>
    </section>);
}

export function MajorityRevealBreakdown({ question, lobby, AnswerGrid }) {
  const results = question?.majorityResults;
  if (!results) return null;
  const ownResult = results.playerResults?.find((result) => result.playerId === lobby.ownPlayer?.id);
  const prediction = question.answers?.find((answer) => answer.id === results.predictedAnswerId);
  return (
    <section className="majority-reveal-breakdown">
      <header>
        <span>{tieBreakLabel(results, "The room has spoken")}</span><FactCheckPanel results={results} />
        <strong>{results.topCount} vote{results.topCount === 1 ? "" : "s"} for the winner</strong>
        {/* The bonus condition is stated exactly, because it is stricter than
            it looks: it needs *every* eligible voter to pick the predicted
            answer, not merely the largest group. And a vote winner is not a
            fact, so it is never described as correct. */}
        <p>{results.authorBonusAwarded ?
        "Every voter picked the author's prediction — that earns the +" + (results.authorBonusValue || 100) + " bonus." :
        results.unanimous ?
        "Everyone agreed, but the author predicted a different answer, so no bonus." :
        "The room's most-voted answer wins this round."}</p>
        {!results.authorBonusAwarded ?
        <small className="majority-bonus-rule">The author bonus needs every voter to choose their prediction, not just the biggest group.</small> :
        null}
      </header>
      <AnswerGrid answers={question.answers || []} reveal answerSelections={lobby.answerSelections} players={lobby.players} questionId={question.id} />
      <div className="round-score-breakdown">
        <div>
          <dt>Author predicted</dt>
          <dd>{prediction?.text || "no prediction"}</dd>
        </div>
        <div className="round-score-total">
          <dt>This round</dt>
          <dd>{ownResult ? "+" + ownResult.points : "+0"}</dd>
        </div>
      </div>
    </section>);
}
