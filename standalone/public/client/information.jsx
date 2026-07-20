import React, { useEffect, useState } from "react";

const REPORTS = Object.freeze([
  { id: "herd", title: "Herd mode review", tag: "Full analysis", summary: "Flow, fun, UI, scoring, comparisons and the most important improvements." },
  { id: "overview", title: "Gahookz overview", tag: "Game identity", summary: "How Quiz, Herd and Gahooks work together as one party-game product." },
  { id: "roadmap", title: "Product roadmap", tag: "Priorities", summary: "A practical order for improving the game without losing what already works." },
  { id: "launch", title: "Public launch checklist", tag: "Release readiness", summary: "Moderation, accessibility, privacy, testing and community requirements." },
  { id: "business", title: "Fair monetisation", tag: "Business model", summary: "Ways to earn revenue without interruptive ads, gambling mechanics or pay-to-win." },
  { id: "operations", title: "Hosting and operations", tag: "Technical notes", summary: "Current server shape, limits, deployment model and operational cautions." },
  { id: "about", title: "About these reports", tag: "Scope", summary: "What was inspected, what is evidence, and what still needs real playtesting." }
]);

const REPORT_IDS = new Set(REPORTS.map((report) => report.id));

function selectedReportFromUrl() {
  const hash = window.location.hash.replace(/^#/, "").toLowerCase();
  return REPORT_IDS.has(hash) ? hash : "herd";
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
            <span>{report.tag} · reviewed 19 July 2026</span>
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
  if (reportId === "overview") return <OverviewReport />;
  if (reportId === "roadmap") return <RoadmapReport />;
  if (reportId === "launch") return <LaunchReport />;
  if (reportId === "business") return <BusinessReport />;
  if (reportId === "operations") return <OperationsReport />;
  if (reportId === "about") return <AboutReport />;
  return <HerdReport />;
}

function ReportSection({ title, children }) {
  return <section className="information-section"><h3>{title}</h3>{children}</section>;
}

function Priority({ level, title, children }) {
  return <article className={"information-priority is-" + level.toLowerCase()}><span>{level}</span><div><h4>{title}</h4><p>{children}</p></div></article>;
}

function HerdReport() {
  return (
    <>
      <section className="information-verdict">
        <strong>Verdict: high-potential and already fun, but its promise needs tightening.</strong>
        <p>Herd is the strongest creative counterweight to Quiz. Its best idea is not simply “match the majority”; it is “write one answer, then predict the podium your particular room will create.” The answer-writing, social reveal and two-part scoring can produce excellent friend-group stories. Its main weaknesses are conflicting instructions, too much work in large rooms, and scoring incentives that are not explained before players make decisions.</p>
      </section>

      <ReportSection title="Current game flow">
        <ol className="information-flow">
          <li><strong>Choose the room rules.</strong><span>The host selects Herd, a Quick, Standard or Custom length, Fun or Education prompts, moderation and custom-content options.</span></li>
          <li><strong>Build the prompt deck together.</strong><span>Each connected player writes the required prompts. Each prompt editor can offer up to five random ideas, and prompts can include an uploaded or drawn image.</span></li>
          <li><strong>Read the prompt.</strong><span>Every round begins with a five-second reading phase and the live leaderboard remains visible.</span></li>
          <li><strong>Write one anonymous answer.</strong><span>Players have up to 30 seconds to submit 60 characters plus an optional uploaded or drawn image. Their own answer is shown as locked while they wait.</span></li>
          <li><strong>Predict the room's top three.</strong><span>All submitted answers are shuffled. Players have up to 45 seconds to select and order their top three; they may include their own answer.</span></li>
          <li><strong>Reveal the room's podium.</strong><span>First, second and third picks carry weights of 3, 2 and 1. The reveal shows answer authors, voters, ranked avatar badges, placement points and each player's personal score breakdown.</span></li>
          <li><strong>Rate, Gahook and continue.</strong><span>Players may rate the prompt Good or Nah, see standings, and use the shared Gahook sabotage system. The finale awards the overall winner, loser and best singular Herd answer.</span></li>
        </ol>
        <p className="information-note">One full timed round is about 98 seconds before any short readiness waits. Ten rounds are therefore already about 16 minutes, while 18 rounds are about 29 minutes before prompt creation and the finale.</p>
      </ReportSection>

      <ReportSection title="Why it is fun">
        <div className="information-card-grid">
          <article><h4>The room makes the content</h4><p>Friends are reacting to one another rather than consuming a fixed question bank. That creates ownership and strong replayability.</p></article>
          <article><h4>Every answer starts a conversation</h4><p>The reveal exposes taste, in-jokes and unexpected alliances. The disagreement is often more entertaining than the score.</p></article>
          <article><h4>Two skills can win</h4><p>A player can write a popular answer, predict the group well, or do both. That gives quieter and less comedy-focused players another path to compete.</p></article>
          <article><h4>Images make rounds memorable</h4><p>Drawn and uploaded answers can become the moment the group remembers after the game, especially when paired with custom Gahooks.</p></article>
          <article><h4>Sabotage keeps it unmistakably Gahookz</h4><p>The once-per-question Gahook keeps the familiar 50-point social attack without replacing Herd's core prediction game.</p></article>
          <article><h4>The finale has a story</h4><p>Best answer is a meaningful mode-specific award, not merely another leaderboard position.</p></article>
        </div>
      </ReportSection>

      <ReportSection title="UI and clarity assessment">
        <dl className="information-scorecard">
          <div><dt>Game idea</dt><dd>Excellent</dd><p>Distinctive enough to support its own mode once the pitch is consistent.</p></div>
          <div><dt>Prompt creation</dt><dd>Good</dd><p>Simple and visually consistent with Quiz; generation and image tools reduce blank-page pressure.</p></div>
          <div><dt>Answering</dt><dd>Good</dd><p>Clear input and locked state, but “crowd answer” and “what everyone else will type” describe a match game that the scoring does not perform.</p></div>
          <div><dt>Top-three selection</dt><dd>Mixed</dd><p>Colour, numbers and progress make selection readable. Cycling ranks by repeatedly tapping is discoverable only through instruction text and becomes tiring with many answers.</p></div>
          <div><dt>Reveal</dt><dd>Strong but dense</dd><p>The personal two-part breakdown is excellent. Showing every answer, author, voter, score and prompt rating within 18 seconds overloads smaller screens.</p></div>
          <div><dt>Accessibility</dt><dd>Promising</dd><p>Buttons have labels and rank badges supplement avatar size. More persistent legends, focus testing, contrast checks and reduced cognitive load are still needed.</p></div>
        </dl>
      </ReportSection>

      <ReportSection title="Most important improvements">
        <div className="information-priority-list">
          <Priority level="P0" title="Keep answer authors genuinely anonymous">The visible answer identifier is currently derived from the player's public ID, so someone inspecting room data can identify authors before voting closes. Generate a random per-answer identifier and keep the author mapping only in private server state.</Priority>
          <Priority level="P0" title="Add live-answer safety controls">Prompt approval does not cover Herd answers, drawings or uploaded images. Before public rooms are promoted, give hosts controls to disable answer images, hide or remove an answer, skip an unsafe reveal and remove a player; add family-safe filtering and an in-product report path.</Priority>
          <Priority level="P0" title="Commit to the actual promise">Replace exact-match language with one consistent pitch: “Write an answer, predict your friends' top three, and find out who really knows the room.” If true matching is desired instead, duplicate answers must be merged and the scoring model redesigned. The current rules and copy should not promise both.</Priority>
          <Priority level="P0" title="Create a large-room voting flow">A 20-player room can produce 20 image-heavy choices, which is too much to read and rank in 45 seconds. For 11–20 players, use a fast qualification pass, balanced subsets, or two semifinals before the final top-three ballot.</Priority>
          <Priority level="P1" title="Remove circular prediction scoring">A player's ballot currently helps create the group podium that the same ballot is scored against. Score each player's prediction against a leave-one-out podium that excludes that ballot. Players can still choose their own answer, but cannot partly manufacture their own prediction target.</Priority>
          <Priority level="P1" title="Remove the self-vote reward conflict">A self-vote can also lift the player's authored answer into a paid podium position. Preserve self-selection if it is fun, but exclude the author's ballot from that answer's reward calculation or disclose the strategic rule unmistakably.</Priority>
          <Priority level="P1" title="Make ties honest and visible">Equal weighted vote totals are currently separated by hidden secondary rules and then answer ID. Use shared placements and equal rewards, or show an explicit tie-break rule before voting.</Priority>
          <Priority level="P1" title="Give Herd its own duration presets">Quick should target roughly 5–6 prompts and Standard roughly 8–10, with a visible 12–18 minute target. The shared 10/18-round caps make Herd much longer than Quiz because every round adds writing and ranking.</Priority>
          <Priority level="P1" title="Stage the reveal">Show the podium first, then the voters, then the personal score. Keep lower answers behind “See every answer.” This improves celebration, mobile legibility and conversation time.</Priority>
          <Priority level="P1" title="Explain scoring before the first ballot">Show two stable meters: “Your answer: up to 500” and “Your prediction: up to 500.” The current reveal explains the result well, but players cannot optimise for rules they learn afterward.</Priority>
          <Priority level="P1" title="Shuffle choices per player">Every voter currently receives the same shuffled answer order, concentrating first-position bias rather than averaging it away. Use a stable, different order for each player and round.</Priority>
          <Priority level="P1" title="Make mid-game joiners spectators first">A late joiner can become finale-eligible immediately, even without completing a full round. Let newcomers watch until the next complete round or next game, then add them to scoring eligibility.</Priority>
          <Priority level="P1" title="Give creative answers enough time">Thirty seconds is not enough to open the full drawing tool, make an image and submit reliably. Treat drawing as an optional longer creative-round setting, or let players prepare a small reusable media tray before play.</Priority>
          <Priority level="P1" title="Respect Education during force-start">Client suggestions follow Fun or Education, but server-generated fallback prompts currently come from the party set. Put prompt libraries in one shared module and choose from the active room style everywhere.</Priority>
          <Priority level="P2" title="Adapt the ballot to small groups">With one player the result is automatic; with two or three, a top three is barely selective. Recommend at least four players and use top one or top two when fewer than four usable answers exist.</Priority>
          <Priority level="P2" title="Handle semantic duplicates">“Dog,” “a dog” and “Dog!” currently compete separately. Offer a conservative duplicate merge or a quick host confirmation, while preserving genuinely different jokes.</Priority>
          <Priority level="P2" title="Keep the timer visible">The ballot can be long, but the visual timer has no seconds number and scrolls away. Add a sticky compact countdown, persistent selected-three tray and sticky lock control.</Priority>
          <Priority level="P2" title="Avoid repeated prompt suggestions">A previously generated suggestion can return and consume one of the five uses. Track all suggestions shown in that editor and sample without replacement.</Priority>
          <Priority level="P2" title="Finish the terminology pass">Use Prompt rather than Question in the round counter, host metrics, readiness messages, approval panel and finale labels whenever Herd is active.</Priority>
          <Priority level="P2" title="Remove legacy Herd code">The client still contains unused components and styles for an older exact-match/reordering version. Removing them will make future Herd work safer and reduce contradictory UI paths.</Priority>
        </div>
      </ReportSection>

      <ReportSection title="Stability, fairness and public-readiness notes">
        <dl className="information-scorecard">
          <div><dt>Phase completion</dt><dd>Strong</dd><p>Disconnected players do not block early completion, and timed-out ranking ballots become abstentions rather than invented votes.</p></div>
          <div><dt>Scoring safety</dt><dd>Strong</dd><p>Round scoring is idempotent, and the shared finale leaderboard is tie-aware at player level.</p></div>
          <div><dt>Answer privacy</dt><dd>Needs work</dd><p>The UI hides authors, but the public answer identifier can currently be mapped back to a player before reveal.</p></div>
          <div><dt>Content safety</dt><dd>Needs work</dd><p>Live answer text and media enter the ballot without an answer-level host review or removal workflow.</p></div>
          <div><dt>Media reliability</dt><dd>Mixed</dd><p>Room media is bounded, but image-answer submission uses a short client timeout that can report failure while a slow mobile upload is still reaching the server.</p></div>
          <div><dt>Player-count scaling</dt><dd>Needs work</dd><p>The current mechanic is trivial below four and cognitively heavy near twenty; both ends need explicit alternate rules.</p></div>
        </dl>
      </ReportSection>

      <ReportSection title="Comparison with nearby games">
        <div className="information-table-wrap"><table className="information-table"><thead><tr><th>Game</th><th>What it centres</th><th>Where Herd differs</th><th>Lesson</th></tr></thead><tbody>
          <tr><th><a href="https://bigpotato.com/products/herd-mentality" target="_blank" rel="noreferrer">Herd Mentality</a></th><td>Secret answers and matching the majority.</td><td>Gahookz exposes a player-made field and asks everyone to predict an ordered podium.</td><td>Market the podium prediction, not generic majority thinking. A commercial name/trademark review is sensible.</td></tr>
          <tr><th><a href="https://www.jackboxgames.com/games/the-jackbox-party-pack-7/quiplash-3" target="_blank" rel="noreferrer">Quiplash 3</a></th><td>Write the funniest response and win a head-to-head vote.</td><td>Herd ranks the full field and rewards reading this room, not only writing comedy.</td><td>Keep writing fast, moderation strong and reveals socially generous.</td></tr>
          <tr><th><a href="https://www.jackboxgames.com/games/fibbage-4" target="_blank" rel="noreferrer">Fibbage 4</a></th><td>Write a convincing lie and identify the truth.</td><td>Both reward creating and predicting; Herd's “truth” is the room's emerging preference.</td><td>Make both score sources unmistakable at decision time and reveal time.</td></tr>
          <tr><th><a href="https://www.jackboxgames.com/games/the-jackbox-survey-scramble" target="_blank" rel="noreferrer">Survey Scramble</a></th><td>Guess popularity rankings from a wider survey.</td><td>Herd's survey is created live by these exact friends.</td><td>Lean into “how well do you know this room?” and avoid implying general public opinion.</td></tr>
          <tr><th><a href="https://theop.games/products/blank-slate" target="_blank" rel="noreferrer">Blank Slate</a></th><td>Complete a cue and match another player's word.</td><td>Herd votes after seeing all responses instead of resolving exact matches immediately.</td><td>Short concrete prompts and duplicate handling keep consensus legible.</td></tr>
          <tr><th><a href="https://www.cmyk.games/products/wavelength" target="_blank" rel="noreferrer">Wavelength</a></th><td>Discuss and read a group's shared intuition.</td><td>Herd is more explicitly competitive, authored and screen-led.</td><td>Leave enough reveal time for conversation; the social debate is part of the payoff.</td></tr>
          <tr><th><a href="https://kahoot.com/home/mobile-app/" target="_blank" rel="noreferrer">Kahoot!</a></th><td>Host-led live quizzes joined by code.</td><td>Herd is subjective, creative and friend-specific rather than correctness-led.</td><td>Preserve fast account-free joining, QR entry and extremely clear phase changes.</td></tr>
        </tbody></table></div>
      </ReportSection>

      <ReportSection title="Where Herd fits in Gahookz">
        <p>Quiz is the accessible anchor: create knowledge, answer quickly and sabotage. Herd is the social-expression mode: create the conversation, read the room and discover what friends value. Gahooks are the connective tissue between them. This is a healthy portfolio because the same room, identities, drawing tools, chat, host controls and finale language support two different moods without requiring players to learn a new product.</p>
        <p>Herd should be presented as the choice for groups who want more talking, creativity and personal discovery. Quiz remains better for rapid competition and education. Education-mode Herd prompts should be framed as discussion and opinion prompts—not as assessments with an objectively correct consensus.</p>
      </ReportSection>

      <ReportSection title="Recommended target experience">
        <p className="information-pitch">Write an answer. Predict your friends' top three. Find out who really knows the room.</p>
        <ul className="information-checklist">
          <li>Best with 4–10 active players; use a large-room qualification flow above 10.</li>
          <li>Target 12–18 minutes including the finale.</li>
          <li>Teach the two 500-point score paths before round one.</li>
          <li>Reveal the podium as a celebration, then let the room inspect details.</li>
          <li>Keep author identities hidden until voting closes.</li>
          <li>Retain images, drawings, prompt voting, the best-answer award and one Gahook per round.</li>
        </ul>
      </ReportSection>
    </>
  );
}

function OverviewReport() {
  return <><section className="information-verdict"><strong>Gahookz is a co-created live party game, not merely a quiz site.</strong><p>Its strongest product idea is that the room makes the entertainment together: players create prompts or questions, answer live, draw or upload media, chat while waiting, and sabotage friends with expressive Gahooks.</p></section><ReportSection title="The product loop"><ol className="information-flow"><li><strong>Gather.</strong><span>One host creates a four-letter room; players join from phones or browsers with no account.</span></li><li><strong>Create.</strong><span>The room makes its own content or uses safe generated material.</span></li><li><strong>Compete.</strong><span>Quiz rewards knowledge and speed. Herd rewards appealing answers and social prediction.</span></li><li><strong>Gahook.</strong><span>Players interrupt friends, steal a small number of points and personalise the moment.</span></li><li><strong>Celebrate.</strong><span>Round reveals and finales identify winners, lovable losers and mode-specific awards.</span></li></ol></ReportSection><ReportSection title="What is working"><ul className="information-checklist"><li>A memorable name, bright visual identity and playful language.</li><li>Low-friction room-code, QR and link joining.</li><li>Friend-made content that changes with every group.</li><li>Custom profiles, drawings and Gahooks that create social ownership.</li><li>Shared host/player architecture across modes.</li></ul></ReportSection><ReportSection title="Main product risk"><p>The game can accumulate too many features in the same phase. Every new social tool, score, animation and setting should answer one question: does this improve creating, competing, sabotaging or celebrating? If not, it probably belongs outside the live round.</p></ReportSection></>;
}

function RoadmapReport() {
  return <><section className="information-verdict"><strong>Protect the successful friend-group experience while making it understandable and operable for strangers.</strong><p>The order matters: clarify and harden the current loop before adding more modes, platforms or monetisation.</p></section><ReportSection title="Now: clarity and pacing"><div className="information-card-grid"><article><h4>Finish Herd vNext</h4><p>Align its promise, handle large rooms, resolve ties and self-vote incentives, and shorten its presets.</p></article><article><h4>Run a copy audit</h4><p>Make every phase, timer, button and host metric use mode-correct terms.</p></article><article><h4>Moderate creation</h4><p>Add content filtering, reporting, host review and clear custom-image rules before open public acquisition.</p></article><article><h4>Instrument the funnel</h4><p>Measure room creation, join failure, creation completion, round completion and voluntary exits without collecting unnecessary personal data.</p></article></div></ReportSection><ReportSection title="Next: repeatable public sessions"><ul className="information-checklist"><li>Host presets for Family, Party and Education.</li><li>Reconnect and restart messaging that clearly explains in-memory rooms.</li><li>A curated prompt library with tags, ratings and safe seasonal packs.</li><li>Shareable post-game summaries that do not expose private room content by default.</li><li>Formal accessibility testing on keyboard, screen reader, colour, motion and small screens.</li></ul></ReportSection><ReportSection title="Later: platform expansion"><ul className="information-checklist"><li>Installable web app remains the common cross-platform client.</li><li>Steam can wrap the host/party display and include premium cosmetics.</li><li>Mobile apps can wrap the player experience and support native sharing, camera and purchases.</li><li>All platforms should use the same rooms and protocol so web, Steam and mobile players mix freely.</li></ul></ReportSection></>;
}

function LaunchReport() {
  return <><section className="information-verdict"><strong>The game is suitable for invited groups now; an open public launch needs an abuse and operations layer.</strong><p>User-created text, drawings, images and audio make moderation a product requirement rather than an optional setting.</p></section><ReportSection title="Required before broad promotion"><div className="information-priority-list"><Priority level="P0" title="Content safety">Profanity/hate filtering, image and audio rules, reporting, host removal, bans, and a documented response path.</Priority><Priority level="P0" title="Privacy and legal basics">Publish plain-language privacy, terms, community rules, age positioning, contact details, retention rules and copyright/takedown handling.</Priority><Priority level="P0" title="Operational reliability">Monitoring, alerting, rotating logs, deploy rollback, domain/TLS renewal checks, backups for any future database and a visible status path.</Priority><Priority level="P1" title="Accessibility">Keyboard-only flows, focus order, screen-reader announcements, reduced effects, colour-independent status and tested touch targets.</Priority><Priority level="P1" title="Public onboarding">A first-room tutorial, clear best-player counts, sample prompts and recovery from wrong links, full rooms and disconnected hosts.</Priority></div></ReportSection><ReportSection title="Release gates"><ul className="information-checklist"><li>Twenty-player load and media-limit tests pass repeatedly.</li><li>No critical path depends on a third-party CDN.</li><li>A complete game is tested on current Chrome, Safari and Firefox plus representative iOS and Android devices.</li><li>Hosts can understand and use moderation without reading documentation.</li><li>Analytics can show where people abandon the join, creation and live-round funnels.</li><li>At least three fresh groups can complete both modes without developer coaching.</li></ul></ReportSection></>;
}

function BusinessReport() {
  return <><section className="information-verdict"><strong>Sell expression and convenience, never competitive power.</strong><p>Gahookz is funniest when everyone feels equally able to participate. Monetisation should preserve that social trust.</p></section><ReportSection title="Recommended model"><dl className="information-scorecard"><div><dt>Web</dt><dd>Free core</dd><p>Free joining, hosting and both core modes. A modest premium purchase unlocks the five premium Gahook characters and creator cosmetics.</p></div><div><dt>Steam</dt><dd>Low one-time price</dd><p>A host-focused edition with all standard cosmetics, polished shared-screen controls and cross-platform room access.</p></div><div><dt>Mobile</dt><dd>Low price or free companion</dd><p>Allow cosmetic unlocks through normal play. If purchases exist, keep them direct and clearly priced.</p></div><div><dt>Groups</dt><dd>Optional packs</dd><p>Curated education, workplace or seasonal prompt packs can fund continued writing without disadvantaging free rooms.</p></div></dl></ReportSection><ReportSection title="Rules worth keeping"><ul className="information-checklist"><li>No loot boxes, random paid rewards, energy timers or limited lives.</li><li>No paid score boosts, stronger sabotage or host priority.</li><li>No full-screen ads during a room.</li><li>Let guests see premium Gahooks used by owners; this markets cosmetics naturally.</li><li>Use account-free play by default and require an account only for purchase recovery or creator libraries.</li></ul></ReportSection></>;
}

function OperationsReport() {
  return <><section className="information-verdict"><strong>The current deployment is intentionally simple: one Node process behind Nginx.</strong><p>That is appropriate for early public testing as long as its limits are understood and monitored.</p></section><ReportSection title="Current shape"><ul className="information-checklist"><li>Maximum 20 players per room and 32 active rooms per process.</li><li>Live state uses Server-Sent Events with periodic snapshot recovery.</li><li>Rooms, credentials and uploaded room media live in memory.</li><li>Restarting or replacing the container ends active rooms.</li><li>The prepared Docker service binds to localhost and Nginx handles public HTTP/HTTPS.</li><li>One replica only: multiple independent replicas cannot share a room without a shared state layer.</li></ul></ReportSection><ReportSection title="Operational priorities"><ol className="information-flow"><li><strong>Monitor.</strong><span>Track health, memory, active rooms, response latency and unexpected exits.</span></li><li><strong>Deploy between games.</strong><span>Announce maintenance because container replacement clears rooms.</span></li><li><strong>Keep the origin private.</strong><span>Expose only Nginx ports 80/443; keep the Node port on loopback.</span></li><li><strong>Scale deliberately.</strong><span>Before multiple instances, move room state, authentication and media to shared services or add strict room-affinity routing.</span></li></ol></ReportSection><ReportSection title="Server guide"><p>The project root contains <code>DEPLOY-FEDORA.md</code>, <code>Dockerfile</code>, <code>compose.yaml</code> and an SSE-safe Nginx example for the Fedora laptop deployment.</p></ReportSection></>;
}

function AboutReport() {
  return <><section className="information-verdict"><strong>These are working product reports, not claims from a controlled user study.</strong><p>They combine a full code-path inspection, UI review, automated game-flow tests, prior requirements from development, and comparisons with official descriptions of adjacent games.</p></section><ReportSection title="Evidence used"><ul className="information-checklist"><li>Client and server implementation, including phase timers, scoring, eligibility and failure handling.</li><li>Responsive styles and the visible host, player, party and finale states.</li><li>Automated smoke simulations for Herd flow, rankings, roles, media, onboarding and layout.</li><li>Official product descriptions from Big Potato, Jackbox, The Op and Kahoot.</li><li>Your observation that friends and family already respond very positively.</li></ul></ReportSection><ReportSection title="Evidence still needed"><ul className="information-checklist"><li>Observed sessions with first-time players who did not watch the game being developed.</li><li>Timed sessions at 4, 8, 12 and 20 players.</li><li>Accessibility sessions using keyboard, screen reader and reduced-motion settings.</li><li>Public-room moderation exercises with intentionally difficult content.</li><li>Funnel and retention data after consent-aware analytics are introduced.</li></ul></ReportSection><ReportSection title="How to use the reports"><p>Priorities marked P0 block the intended experience or safe public growth. P1 items materially improve fairness, clarity or retention. P2 items are valuable polish and maintainability work. Revisit the Herd review after its next scoring and large-room pass.</p></ReportSection></>;
}

export default InformationHub;
