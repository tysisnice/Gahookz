import React, { useEffect, useState } from "react";

const REPORTS = Object.freeze([
  { id: "majority", title: "Majority Rulz guide", tag: "Mode rules", summary: "Opinion questions, crowd-made answers, speed scoring and the unanimous author bonus." },
  { id: "herd", title: "Herd guide", tag: "Mode rules", summary: "Player-made prompts, balanced answer writing, favourite voting and two ways to score." },
  { id: "overview", title: "Gahookz overview", tag: "Game identity", summary: "How Quiz, Majority Rulz, Herd and Gahooks work together as one party-game product." },
  { id: "roadmap", title: "Product roadmap", tag: "Priorities", summary: "A practical order for improving the game without losing what already works." },
  { id: "launch", title: "Public launch checklist", tag: "Release readiness", summary: "Moderation, accessibility, privacy, testing and community requirements." },
  { id: "business", title: "Fair monetisation", tag: "Business model", summary: "Ways to earn revenue without interruptive ads, gambling mechanics or pay-to-win." },
  { id: "operations", title: "Hosting and operations", tag: "Technical notes", summary: "Current server shape, limits, deployment model and operational cautions." },
  { id: "about", title: "About these reports", tag: "Scope", summary: "What was inspected, what is evidence, and what still needs real playtesting." }
]);

const REPORT_IDS = new Set(REPORTS.map((report) => report.id));

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
  if (reportId === "herd") return <HerdReport />;
  if (reportId === "overview") return <OverviewReport />;
  if (reportId === "roadmap") return <RoadmapReport />;
  if (reportId === "launch") return <LaunchReport />;
  if (reportId === "business") return <BusinessReport />;
  if (reportId === "operations") return <OperationsReport />;
  if (reportId === "about") return <AboutReport />;
  return <MajorityReport />;
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

function RoadmapReport() {
  return <><section className="information-verdict"><strong>Protect the successful friend-group experience while making it understandable and operable for strangers.</strong><p>The order matters: prove the three-mode loop with real groups, then add the safety and operations needed for public reach.</p></section><ReportSection title="Now: evidence and safety"><div className="information-card-grid"><article><h4>Observe all three modes</h4><p>Run coached and uncoached sessions at 3, 4, 8, 12 and 20 players; time every phase and record where first-time players hesitate.</p></article><article><h4>Moderate creation</h4><p>Add text filtering, reporting, operator review and clear image/audio rules before open anonymous acquisition.</p></article><article><h4>Instrument the funnel</h4><p>Measure room creation, join failure, creation completion, reconnects and round completion without collecting unnecessary personal data.</p></article><article><h4>Exercise failure</h4><p>Load-test real SSE rooms and rehearse worker loss, database restore, affinity mistakes, drains and rollback.</p></article></div></ReportSection><ReportSection title="Next: repeatable public sessions"><ul className="information-checklist"><li>Curated and rated prompt packs for Family, Party, Education and seasonal events.</li><li>Reconnect and maintenance messaging that clearly explains process-local active rooms.</li><li>Shareable post-game summaries that do not expose private room content by default.</li><li>Formal accessibility testing on keyboard, screen reader, colour, motion and small screens.</li><li>A privacy-respecting account export/deletion flow and store-verified entitlement webhook.</li></ul></ReportSection><ReportSection title="Later: platform expansion"><ul className="information-checklist"><li>Installable web app remains the common cross-platform client.</li><li>A Steam host edition can wrap the party display and include premium expression tools.</li><li>Mobile companions can improve camera, sharing and purchase recovery without splitting the room protocol.</li><li>A pure room engine can move to sharded workers or a per-room authority only after measured load justifies it.</li></ul></ReportSection></>;
}

function LaunchReport() {
  return <><section className="information-verdict"><strong>The game is suitable for invited groups now; an open public launch still needs an abuse and operations layer.</strong><p>User-created text, drawings, images and audio make moderation a product requirement rather than an optional setting.</p></section><ReportSection title="Required before broad promotion"><div className="information-priority-list"><Priority level="P0" title="Content safety">Profanity/hate filtering, image and audio rules, reporting, host removal, bans, evidence retention and a documented response path.</Priority><Priority level="P0" title="Privacy and legal basics">Publish plain-language privacy, terms, community rules, age positioning, contact details, retention rules and copyright/takedown handling.</Priority><Priority level="P0" title="Operational reliability">Central redacted logs, alerting, drain/rollback procedures, TLS renewal checks, PostgreSQL backups and a visible status path.</Priority><Priority level="P1" title="Accessibility">Keyboard-only flows, focus order, screen-reader announcements, reduced effects, colour-independent status and tested touch targets.</Priority><Priority level="P1" title="Public onboarding">Clear best-player counts, sample prompts and recovery from wrong links, full rooms, reconnects and interrupted hosts.</Priority></div></ReportSection><ReportSection title="Release gates"><ul className="information-checklist"><li>Measured 20-player room and concurrent-room load tests pass with the production proxy and PostgreSQL.</li><li>No critical path depends on a third-party CDN.</li><li>A complete game is tested on current Chrome, Safari and Firefox plus representative iOS and Android devices.</li><li>Hosts can understand and use moderation without reading documentation.</li><li>Failure drills cover process loss, affinity mistakes, database restore and deployment rollback.</li><li>At least three fresh groups can complete Quiz, Majority Rulz and Herd without developer coaching.</li></ul></ReportSection></>;
}

function BusinessReport() {
  return <><section className="information-verdict"><strong>Sell expression and host convenience, never competitive power.</strong><p>Gahookz is funniest when everyone feels equally able to participate. Monetisation should preserve that social trust.</p></section><ReportSection title="Recommended model"><dl className="information-scorecard"><div><dt>Web</dt><dd>Free core</dd><p>Keep guest joining and the three modes free. Sell durable custom-Gahook slots, cosmetic packs and host presentation themes through optional accounts.</p></div><div><dt>Steam</dt><dd>One-time host edition</dd><p>Bundle polished shared-screen controls, offline practice and a useful cosmetic allowance while keeping cross-platform room access.</p></div><div><dt>Mobile</dt><dd>Free companion</dd><p>Improve camera, sharing and purchase recovery. Use direct, clearly priced cosmetic purchases if demand supports them.</p></div><div><dt>Groups</dt><dd>Host subscription</dd><p>Charge organisations for larger rooms, reports, moderation, brand controls and curated workplace or education packs—not for player access.</p></div></dl></ReportSection><ReportSection title="Entitlement foundation"><p>Signed-in accounts currently receive one cloud custom-Gahook slot. Server-side entitlement quantities can expand that allowance to twelve; a future store must verify every transaction before granting it.</p></ReportSection><ReportSection title="Rules worth keeping"><ul className="information-checklist"><li>No loot boxes, random paid rewards, energy timers or limited lives.</li><li>No paid score boosts, stronger sabotage or host priority.</li><li>No full-screen ads during a room.</li><li>Let guests see premium expression used by owners; this markets cosmetics naturally.</li><li>Require an account only for durable stats, purchases and cloud creator libraries.</li></ul></ReportSection></>;
}

function OperationsReport() {
  return <><section className="information-verdict"><strong>The server—not the host browser—is the room authority.</strong><p>That is the right trust model for scoring, accounts, moderation and purchases, but active rooms remain process-local and need careful draining.</p></section><ReportSection title="Current shape"><ul className="information-checklist"><li>Maximum 20 players per room and 32 active rooms per process.</li><li>Live state uses bounded commands and Server-Sent Events with opaque, scoped, single-use stream tickets.</li><li>Nginx can consistently route a non-secret room code to one of several independent Node workers.</li><li>Room state and uploaded room media remain in the owning worker; replacing it ends those active rooms.</li><li>PostgreSQL persists optional accounts, career statistics, entitlements and custom slots across workers.</li><li>Health, readiness and token-protected metrics expose deployment state without room or player data.</li></ul></ReportSection><ReportSection title="Operational priorities"><ol className="information-flow"><li><strong>Measure.</strong><span>Load-test the real command, media and SSE mix; tune capacity and admission limits from p95/p99 evidence.</span></li><li><strong>Drain.</strong><span>Stop assigning new rooms to a worker and wait for its active-room gauge to reach zero before replacement.</span></li><li><strong>Keep the origin private.</strong><span>Expose only Nginx, trust forwarded addresses only from that proxy, and keep PostgreSQL private.</span></li><li><strong>Scale deliberately.</strong><span>Add a room coordinator or move the pure engine to a per-room primitive when measured demand justifies live migration.</span></li></ol></ReportSection><ReportSection title="Server guide"><p>See <code>docs/operations/production-readiness.md</code>, <code>Dockerfile</code>, <code>compose.yaml</code>, <code>infra/postgres</code> and the SSE-safe Nginx example. Browser or peer hosting is deliberately not the public scale plan.</p></ReportSection></>;
}

function AboutReport() {
  return <><section className="information-verdict"><strong>These are implementation audits, not claims from a controlled user study.</strong><p>They combine a full code-path inspection, responsive browser review, security and game-flow tests, and deterministic simulation.</p></section><ReportSection title="Evidence used"><ul className="information-checklist"><li>Client and server implementation, including phase timers, scoring, eligibility, account attribution and failure handling.</li><li>Desktop and phone-sized Firefox screenshots of the current welcome experience.</li><li>Automated flows for Quiz, Majority Rulz, Herd, roles, security, media, onboarding, finales and deployment.</li><li>Seeded simulation of 15,000 games and more than 1.7 million Quiz answers, Majority choices and Herd votes.</li></ul></ReportSection><ReportSection title="Evidence still needed"><ul className="information-checklist"><li>Observed sessions with first-time players who did not watch the game being developed.</li><li>Timed sessions at 3, 4, 8, 12 and 20 players.</li><li>Accessibility sessions using keyboard, screen reader and reduced-motion settings on real devices.</li><li>Public-room moderation exercises with intentionally difficult content.</li><li>Production load, reconnect, failure, backup and rollback exercises.</li><li>Consent-aware funnel and retention data.</li></ul></ReportSection><ReportSection title="How to use the reports"><p>Priorities marked P0 block safe public growth. P1 items materially improve fairness, clarity or retention. P2 items are valuable polish and maintainability work. Revisit both social-mode guides after their first uncoached group playtests.</p></ReportSection></>;
}

export default InformationHub;
