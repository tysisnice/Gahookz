import React, { useEffect, useState } from "react";

// Player-facing guides only.
//
// This page also carried a product roadmap, a release-readiness checklist, a
// monetisation model and server operating detail. None of that is secret, and
// none of it was a credential -- it was simply written for whoever runs
// Gahookz, not for somebody who joined a room to play. It now lives in
// docs/product/internal-reports.md.
//
// The old report URLs still resolve and say where their content went, because
// breaking a link somebody bookmarked is its own small rudeness.
const REPORTS = Object.freeze([
  { id: "majority", title: "Majority Rulz guide", tag: "Mode rules", summary: "Opinion questions, crowd-made answers, speed scoring and the unanimous author bonus." },
  { id: "herd", title: "Herd guide", tag: "Mode rules", summary: "Player-made prompts, balanced answer writing, favourite voting and two ways to score." },
  { id: "overview", title: "Gahookz overview", tag: "Game identity", summary: "How Quiz, Majority Rulz, Herd and Gahooks work together as one party game." }
]);

/** Reports that moved to the repository. Kept so their links still answer. */
const MOVED_REPORTS = Object.freeze({
  roadmap: "Product roadmap",
  launch: "Public launch checklist",
  business: "Fair monetisation",
  operations: "Hosting and operations",
  about: "About these reports"
});

const REPORT_IDS = new Set([...REPORTS.map((report) => report.id), ...Object.keys(MOVED_REPORTS)]);

function selectedReportFromUrl() {
  const hash = window.location.hash.replace(/^#/, "").toLowerCase();
  return REPORT_IDS.has(hash) ? hash : "majority";
}

export function InformationHub() {
  const [activeReport, setActiveReport] = useState(selectedReportFromUrl);

  useEffect(() => {
    const sync = () => setActiveReport(selectedReportFromUrl());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const openReport = (reportId) => {
    if (!REPORT_IDS.has(reportId)) return;
    window.history.pushState(null, "", "/information#" + reportId);
    setActiveReport(reportId);
    window.scrollTo({ top: 0, behavior: "auto" });
    requestAnimationFrame(() => document.getElementById("information-report-title")?.focus());
  };

  const report = REPORTS.find((item) => item.id === activeReport) || REPORTS[0];

  return (
    <main className="information-page">
      <header className="information-header">
        <a className="information-brand" href="/">Gahookz</a>
        <div>
          <span>Project information</span>
          <h1>Reports, decisions and useful notes</h1>
          <p>A plain-language working library for understanding the game and deciding what to improve next.</p>
        </div>
        <a className="information-home-link" href="/">Back to game</a>
      </header>

      <div className="information-layout">
        <aside className="information-index">
          <h2>Reports</h2>
          <nav aria-label="Information reports">
            {REPORTS.map((item) => <button type="button" className={item.id === activeReport ? "is-active" : ""} aria-current={item.id === activeReport ? "page" : undefined} key={item.id} onClick={() => openReport(item.id)}><span>{item.tag}</span><strong>{item.title}</strong><small>{item.summary}</small></button>)}
          </nav>
        </aside>

        <article className="information-report" aria-labelledby="information-report-title">
          <header className="information-report-heading">
            <span>{report.tag} · reviewed 10 August 2026</span>
            <h2 id="information-report-title" tabIndex="-1">{report.title}</h2>
            <p>{report.summary}</p>
          </header>
          <ReportContent reportId={activeReport} />
        </article>
      </div>
    </main>
  );
}

function ReportContent({ reportId }) {
  if (MOVED_REPORTS[reportId]) {
    return (
      <section className="information-verdict">
        <strong>{MOVED_REPORTS[reportId]} has moved.</strong>
        <p>
          This was written for whoever runs Gahookz rather than for players, so it now lives with
          the project documentation instead of on this page. The game guides are still here.
        </p>
      </section>);

  }
  if (reportId === "majority") return <MajorityReport />;
  if (reportId === "herd") return <HerdReport />;
  return <OverviewReport />;
}

function ReportSection({ title, children }) {
  return <section className="information-section"><h3>{title}</h3>{children}</section>;
}

function Priority({ level, title, children }) {
  return <article className={"information-priority is-" + level.toLowerCase()}><span>{level}</span><div><h4>{title}</h4><p>{children}</p></div></article>;
}

function MajorityReport() {
  return (
    <>
      <section className="information-verdict">
        <strong>Majority Rulz keeps Quiz's pace, but lets the room decide what is right.</strong>
        <p>Every question is an opinion. Players try to choose the answer the most people will choose, while the question author predicts the room before voting begins.</p>
      </section>

      <ReportSection title="Current game flow">
        <ol className="information-flow">
          <li><strong>Choose Majority Rulz.</strong><span>The host uses the familiar Quiz room setup, duration presets, moderation and custom-content controls.</span></li>
          <li><strong>Write opinion questions.</strong><span>Each author supplies two to four answers and marks the answer they predict everyone will choose. There is no factual correct answer.</span></li>
          <li><strong>Read and answer.</strong><span>Questions use the same reading and answering phases as classic Quiz. The author's prediction stays hidden while votes are open.</span></li>
          <li><strong>Let the room decide.</strong><span>The answer with the most votes becomes correct. If answers tie on votes, the tied answer chosen quickest wins.</span></li>
          <li><strong>Score like Quiz.</strong><span>Players who joined the winning answer receive the classic speed score, up to 1,000 points. Other answers receive zero.</span></li>
          <li><strong>Reward a perfect prediction.</strong><span>The author receives a 100-point bonus only when every eligible player chose the answer they predicted.</span></li>
        </ol>
      </ReportSection>

      <ReportSection title="Rules at a glance">
        <dl className="information-scorecard">
          <div><dt>Question style</dt><dd>Opinion</dd><p>Funny, subjective and party-friendly questions work best.</p></div>
          <div><dt>Answers</dt><dd>2–4</dd><p>Authors provide the choices and predict one before submitting.</p></div>
          <div><dt>Winning answer</dt><dd>Most votes</dd><p>The room creates the correct answer during the round.</p></div>
          <div><dt>Tied votes</dt><dd>Fastest choice</dd><p>The quickest selection among tied answers settles the result.</p></div>
          <div><dt>Player points</dt><dd>Up to 1,000</dd><p>The classic Quiz speed formula applies to players on the winning answer.</p></div>
          <div><dt>Author bonus</dt><dd>+100</dd><p>Only a unanimous vote for the author's prediction earns the bonus.</p></div>
        </dl>
      </ReportSection>

      <ReportSection title="Design guardrails">
        <div className="information-priority-list">
          <Priority level="P0" title="Keep Quiz unchanged">Majority Rulz branches at question validation and reveal scoring; classic Quiz remains the benchmark.</Priority>
          <Priority level="P1" title="Make subjectivity obvious">Creation, answering and reveal copy should never imply that the author supplied a factual correct answer.</Priority>
          <Priority level="P1" title="Explain speed ties">When a vote tie is broken, show that speed decided it so the winning answer never feels arbitrary.</Priority>
          <Priority level="P2" title="Curate opinion prompts">Suggestions should invite harmless debate, reveal personalities and avoid obscure factual knowledge.</Priority>
        </div>
      </ReportSection>
    </>
  );
}

function HerdReport() {
  return (
    <>
      <section className="information-verdict">
        <strong>Herd turns every player into both a prompt writer and a punchline writer.</strong>
        <p>The room supplies the entertainment: players write one prompt, receive a balanced set of other prompts to answer, then vote for their favourite response during the familiar Quiz-shaped live round.</p>
      </section>

      <ReportSection title="Current game flow">
        <ol className="information-flow">
          <li><strong>Write one prompt.</strong><span>Every player creates one short question for the group.</span></li>
          <li><strong>Share the writing load.</strong><span>Each prompt is assigned to up to four players. Assignments are balanced, and in rooms of five or more the prompt author is not assigned their own prompt.</span></li>
          <li><strong>Write the choices.</strong><span>Players supply one answer for every assignment before the host begins the live round.</span></li>
          <li><strong>Read and vote.</strong><span>The authored answers appear anonymously in the same reading and answering flow used by Quiz. Every active player chooses a favourite.</span></li>
          <li><strong>Find the Herd favourite.</strong><span>The most-voted answer wins. Equal vote totals are settled by the quickest vote, with average speed and stable answer order as deterministic fallbacks.</span></li>
          <li><strong>Score both roles.</strong><span>Voters on the winning response earn up to 500 speed points. Each answer author earns a proportional share of 500 points from the votes their response received.</span></li>
        </ol>
      </ReportSection>

      <ReportSection title="Rules at a glance">
        <dl className="information-scorecard">
          <div><dt>Prompts</dt><dd>1 each</dd><p>Every active player contributes one question to the round set.</p></div>
          <div><dt>Answers per prompt</dt><dd>Up to 4</dd><p>Small rooms use every player; larger rooms keep the writing work balanced.</p></div>
          <div><dt>Winning response</dt><dd>Most votes</dd><p>The room decides which authored answer becomes its favourite.</p></div>
          <div><dt>Tied votes</dt><dd>Fastest choice</dd><p>Vote speed breaks a tied top count deterministically.</p></div>
          <div><dt>Voter points</dt><dd>Up to 500</dd><p>Only voters who joined the winning response receive speed points.</p></div>
          <div><dt>Author points</dt><dd>Up to 500</dd><p>Every vote is worth an equal share of the available author score.</p></div>
        </dl>
      </ReportSection>

      <ReportSection title="Design guardrails">
        <div className="information-priority-list">
          <Priority level="P0" title="Keep authorship anonymous during voting">Names should appear only after voting closes so friendship and reputation do not decide the result.</Priority>
          <Priority level="P1" title="Keep writing balanced">Every prompt needs the same target answer count and player workloads should differ by at most one assignment.</Priority>
          <Priority level="P1" title="Show both score sources">Reveal copy should make voter points and answer-author points understandable without exposing internal scoring terms.</Priority>
          <Priority level="P2" title="Prefer prompts with room to riff">Prompts should invite specific, playful answers instead of factual recall or generic one-word responses.</Priority>
        </div>
      </ReportSection>
    </>
  );
}

function OverviewReport() {
  return <><section className="information-verdict"><strong>Gahookz is a co-created live party game, not merely a quiz site.</strong><p>Its strongest product idea is that the room makes the entertainment together: players create prompts and answers, compete live, draw or upload media, chat while waiting, and sabotage friends with expressive Gahooks.</p></section><ReportSection title="The product loop"><ol className="information-flow"><li><strong>Gather.</strong><span>One host creates a four-letter room; players join from phones or browsers with no account.</span></li><li><strong>Create.</strong><span>The room makes its own content or uses curated suggestions.</span></li><li><strong>Compete.</strong><span>Quiz rewards knowledge and speed. Majority Rulz rewards reading the room. Herd rewards writing the answer the room loves and spotting it quickly.</span></li><li><strong>Gahook.</strong><span>Players interrupt friends, steal a small number of points and personalise the moment.</span></li><li><strong>Celebrate.</strong><span>Round reveals and finales identify winners, lovable losers and mode-specific moments, while the previous result remains visible after returning to the lobby.</span></li></ol></ReportSection><ReportSection title="What is working"><ul className="information-checklist"><li>A memorable name, bright visual identity and playful language.</li><li>Low-friction room-code, QR and link joining, with optional accounts instead of mandatory registration.</li><li>Friend-made content that changes with every group.</li><li>Custom profiles, drawings and Gahooks that create social ownership.</li><li>A shared Quiz-shaped host and player flow across all three modes.</li><li>Mode-aware tutorials, music, reveals and scoring without changing classic Quiz rules.</li></ul></ReportSection><ReportSection title="Main product risk"><p>The game can accumulate too many features in the same phase. Every new social tool, score, animation and setting should answer one question: does this improve creating, competing, sabotaging or celebrating? If not, it probably belongs outside the live round.</p></ReportSection></>;
}






export default InformationHub;
