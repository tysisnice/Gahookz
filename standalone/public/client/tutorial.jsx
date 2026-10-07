import React, { useEffect, useId, useRef, useState } from "react";
import { TutorialArtwork } from "./tutorial-art.jsx";

// The illustrations live in tutorial-art.jsx (audio-art); re-exported so the
// artwork keeps its old import path.
export { TutorialArtwork };

export const TUTORIAL_CONTENT = Object.freeze({
  overview: Object.freeze({
    label: "Gahookz",
    summary: "Gahookz is a make-it-together party game: join the same room, create the chaos, then Gahook your friends at exactly the wrong moment.",
    artworkLabel: "Three steps: friends pop up around a phone showing the room word FISH, everyone writes the questions together, then the monkey Gahooks its way to 50 points and a trophy",
    stepTitles: Object.freeze([
      "Join your friends",
      "Make the game together",
      "Gahook for glory"
    ]),
    sentences: Object.freeze([
      "One person hosts and shares the four-letter room word. Everyone else joins on their own phone or computer—no account or app required.",
      "Quiz has real answers, Majority Rulz rewards the most popular pick, and Herd lets your friends write every answer choice.",
      "Use your Gahook once per round to surprise a friend and steal 50 points. Laugh, climb the leaderboard, and see who wins the final showdown."
    ])
  }),
  quiz: Object.freeze({
    label: "Quiz",
    summary: "Write the questions together, race to answer them, and outscore your friends with a perfectly timed Gahook.",
    artworkLabel: "Three steps: write a question and mark the right colour, beat the stopwatch to the right answer for 900 points, then a yelling monkey Gahooks a crying pig out of 50 points",
    stepTitles: Object.freeze([
      "Make your own questions",
      "Answer fast to score",
      "Sabotage your friends!"
    ]),
    sentences: Object.freeze([
      "Everyone writes questions for the room—or uses the prompt button for inspiration. Mark the correct answer, then fill in believable wrong ones.",
      "Pick the right colour fast: quicker correct answers score more. In Majority Rulez, the most popular answer wins.",
      "Once per question, Gahook one friend to steal 50 points. Time it well—they can still answer."
    ])
  }),
  herd: Object.freeze({
    label: "Herd",
    summary: "Ask the prompt, secretly write answers for your friends’ questions, then vote for the room’s favourite.",
    artworkLabel: "Three steps: a chicken asks one question, a croc in sunglasses secretly writes answers on sticky notes, then the herd votes one answer to the crown for 500 points",
    stepTitles: Object.freeze([
      "Ask one good question",
      "Write for the room",
      "Vote with the Herd"
    ]),
    sentences: Object.freeze([
      "Everyone starts with one funny, open-ended question. You only write the prompt—the room makes its answer choices next.",
      "You’ll receive up to four other prompts. Write one short answer for each; answer writers stay hidden until the reveal.",
      "Pick your favourite live. You can earn up to 500 points for backing the winner and up to 500 more from votes for the answer you wrote."
    ])
  }),
  host: Object.freeze({
    label: "Host",
    summary: "Bring everyone into one room, choose the rules, then keep the game moving all the way to the final celebration.",
    artworkLabel: "Three steps: hold up the room word FISH as friends arrive, pick a game and switch an option on, then run the room with the pause and skip buttons",
    stepTitles: Object.freeze([
      "Bring everyone in",
      "Choose the game",
      "Run the room"
    ]),
    sentences: Object.freeze([
      "Share the room link or four-letter word, then watch the player cards appear as everyone joins.",
      "Pick Quiz, Majority Rulz, or Herd, choose the available options, and decide whether questions need your approval.",
      "Begin question making, start when everyone is ready, then use pause or skip to keep the live game flowing."
    ])
  })
});

const TUTORIAL_MODE_ORDER = Object.freeze(["overview", "quiz", "herd", "host"]);

function normaliseTutorialMode(mode) {
  return Object.prototype.hasOwnProperty.call(TUTORIAL_CONTENT, mode) ? mode : "quiz";
}

function availableTutorialModes(allowedModes, includeHost) {
  const requested = Array.isArray(allowedModes) && allowedModes.length
    ? allowedModes
    : TUTORIAL_MODE_ORDER.filter(mode => mode !== "overview");
  const modes = requested
    .map(normaliseTutorialMode)
    .filter((mode, index, values) => values.indexOf(mode) === index)
    .filter(mode => includeHost || mode !== "host");
  return modes.length ? modes : ["quiz", "herd"];
}

export function GameTutorial({ mode = "quiz", open, onClose, includeHost = true, allowedModes = null }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const panelId = useId();
  const modes = availableTutorialModes(allowedModes, includeHost);
  const modesKey = modes.join("|");
  const requestedMode = normaliseTutorialMode(mode);
  const initialMode = modes.includes(requestedMode) ? requestedMode : modes[0];
  const [activeMode, setActiveMode] = useState(initialMode);
  const selectedMode = modes.includes(activeMode) ? activeMode : initialMode;
  const content = TUTORIAL_CONTENT[selectedMode];
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) setActiveMode(initialMode);
  }, [open, initialMode, modesKey]);

  useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(() => closeRef.current?.focus());

    const handleKeyDown = event => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(dialogRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || []).filter(element => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const changeTab = (nextMode, focus = false) => {
    setActiveMode(nextMode);
    if (focus) {
      requestAnimationFrame(() => dialogRef.current?.querySelector(`[data-tutorial-mode="${nextMode}"]`)?.focus());
    }
  };
  const handleTabKeyDown = (event, index) => {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % modes.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + modes.length) % modes.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = modes.length - 1;
    else return;
    event.preventDefault();
    changeTab(modes[nextIndex], true);
  };

  return <div
    className="tutorial-backdrop"
    role="presentation"
    onPointerDown={event => {
      if (event.target === event.currentTarget) onClose?.();
    }}
  >
    <section
      ref={dialogRef}
      className={`tutorial-dialog tutorial-dialog--${selectedMode}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex="-1"
    >
      <button ref={closeRef} className="tutorial-dialog__close" type="button" onClick={onClose} aria-label="Close how to play">
        <span aria-hidden="true">×</span>
      </button>
      <header className="tutorial-guide__header">
        <h2 id={titleId}>How to play</h2>
        <div className="tutorial-mode-tabs" role="tablist" aria-label="Choose a tutorial">
          {modes.map((tutorialMode, index) => {
            const tabContent = TUTORIAL_CONTENT[tutorialMode];
            const selected = tutorialMode === selectedMode;
            return <button
              className={`tutorial-mode-tab tutorial-mode-tab--${tutorialMode}${selected ? " is-selected" : ""}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              data-tutorial-mode={tutorialMode}
              key={tutorialMode}
              onClick={() => changeTab(tutorialMode)}
              onKeyDown={event => handleTabKeyDown(event, index)}
            >{tabContent.label}</button>;
          })}
        </div>
        <p className="tutorial-guide__summary" id={descriptionId}>{content.summary}</p>
      </header>
      <div className="tutorial-guide__panel" id={panelId} role="tabpanel" aria-label={`${content.label} tutorial`}>
        <div className="tutorial-dialog__art">
          <TutorialArtwork mode={selectedMode} label={content.artworkLabel} />
        </div>
        <ol className="tutorial-dialog__steps" aria-label={`${content.label} instructions`}>
          {content.sentences.map((sentence, index) => <li className="tutorial-dialog__step" key={content.stepTitles[index]}>
            <span className="tutorial-dialog__step-number" aria-hidden="true">{index + 1}</span>
            <div className="tutorial-dialog__step-copy">
              <h3>{content.stepTitles[index]}</h3>
              <p>{sentence}</p>
            </div>
          </li>)}
        </ol>
      </div>
      <div className="tutorial-dialog__actions tutorial-dialog__actions--quiz">
        <button className="tutorial-dialog__done tutorial-dialog__done--quiz" type="button" onClick={onClose}>Let's Go!</button>
      </div>
    </section>
  </div>;
}

export default GameTutorial;
