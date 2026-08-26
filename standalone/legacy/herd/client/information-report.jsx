function HerdReport() {
  return (
    <>
      <section className="information-verdict">
        <strong>Verdict: a clearer, faster creative counterweight to Quiz.</strong>
        <p>Herd now commits to one promise: write the answer your friends will love, then choose one favourite from the room. That makes the decision easy to teach, gives every reveal a clear hero, and keeps the best social material—anonymous answers, surprising alliances, images and friend-group stories—without the previous top-three bookkeeping.</p>
      </section>

      <ReportSection title="Current game flow">
        <ol className="information-flow">
          <li><strong>Choose the room rules.</strong><span>The host selects Herd, a Quick, Standard or Custom length, Fun or Education prompts, moderation and custom-content options.</span></li>
          <li><strong>Build the prompt deck together.</strong><span>Each connected player writes the required prompts. Each prompt editor can offer up to five random ideas, and prompts can include an uploaded or drawn image.</span></li>
          <li><strong>Read the prompt.</strong><span>Every round begins with a five-second reading phase and the live leaderboard remains visible.</span></li>
          <li><strong>Write one anonymous answer.</strong><span>Players have up to 35 seconds to submit 60 characters plus an optional uploaded or drawn image. Drafts save while they type and automatically lock at timeout.</span></li>
          <li><strong>Choose one favourite.</strong><span>All submitted answers are shuffled. Players choose the single answer they like most and may include their own; self-votes are visible but do not help that answer win or score.</span></li>
          <li><strong>Reveal the best answer.</strong><span>The answer with the most eligible favourite votes wins 500 points for its author. Ties share first place honestly, the winner is celebrated first, and the remaining answers stay readable below it.</span></li>
          <li><strong>Rate, Gahook and continue.</strong><span>Players may rate the prompt Good or Nah, see standings, and use the shared Gahook sabotage system. The finale awards the overall winner, loser and best singular Herd answer.</span></li>
        </ol>
        <p className="information-note">The writing phase is now five seconds longer and safer because unfinished drafts are preserved. One-favourite voting requires far less interaction than ordering three answers, so the round should feel calmer despite that added creative time.</p>
      </ReportSection>

      <ReportSection title="Why it is fun">
        <div className="information-card-grid">
          <article><h4>The room makes the content</h4><p>Friends are reacting to one another rather than consuming a fixed question bank. That creates ownership and strong replayability.</p></article>
          <article><h4>Every answer starts a conversation</h4><p>The reveal exposes taste, in-jokes and unexpected alliances. The disagreement is often more entertaining than the score.</p></article>
          <article><h4>One decision creates tension</h4><p>Every player has one vote, so choosing between two great responses feels meaningful without becoming complicated or tiring.</p></article>
          <article><h4>Images make rounds memorable</h4><p>Drawn and uploaded answers can become the moment the group remembers after the game, especially when paired with custom Gahooks.</p></article>
          <article><h4>Sabotage keeps it unmistakably Gahookz</h4><p>The once-per-prompt Gahook keeps the familiar 50-point social attack without replacing Herd's core answer contest.</p></article>
          <article><h4>The finale has a story</h4><p>Best answer is a meaningful mode-specific award, not merely another leaderboard position.</p></article>
        </div>
      </ReportSection>

      <ReportSection title="UI and clarity assessment">
        <dl className="information-scorecard">
          <div><dt>Game idea</dt><dd>Excellent</dd><p>Distinctive enough to support its own mode once the pitch is consistent.</p></div>
          <div><dt>Prompt creation</dt><dd>Good</dd><p>Simple and visually consistent with Quiz; generation and image tools reduce blank-page pressure.</p></div>
          <div><dt>Answering</dt><dd>Strong</dd><p>The copy now asks for a winning answer, the timer allows 35 seconds, and server-saved drafts protect players who miss the lock button.</p></div>
          <div><dt>Favourite selection</dt><dd>Strong</dd><p>One tap selects one clearly highlighted card. The rule and the self-vote exception are visible before locking.</p></div>
          <div><dt>Reveal</dt><dd>Strong</dd><p>The best answer receives a dedicated celebration, while the remaining answers and personal score are visually secondary and compact.</p></div>
          <div><dt>Accessibility</dt><dd>Promising</dd><p>Selection uses a star, colour, text and pressed state rather than colour alone. Keyboard, screen-reader and real-device testing are still needed.</p></div>
        </dl>
      </ReportSection>

      <ReportSection title="Most important improvements">
        <div className="information-priority-list">
          <Priority level="P0" title="Add live-answer safety controls">Prompt approval does not cover Herd answers, drawings or uploaded images. Before public rooms are promoted, give hosts controls to disable answer images, hide or remove an answer, skip an unsafe reveal and remove a player; add family-safe filtering and an in-product report path.</Priority>
          <Priority level="P0" title="Keep testing answer anonymity">New answers use random public identifiers, but privacy tests should remain a release gate whenever the room protocol changes.</Priority>
          <Priority level="P1" title="Create a large-room voting flow">A 20-player room can still produce 20 image-heavy choices. For 11–20 players, test balanced subsets or a fast qualification pass before the final favourite vote.</Priority>
          <Priority level="P1" title="Give Herd its own duration presets">Quick should target roughly 5–6 prompts and Standard roughly 8–10, with a visible 12–18 minute target. The shared 10/18-round caps make Herd much longer than Quiz because every round adds writing and ranking.</Priority>
          <Priority level="P1" title="Shuffle choices per player">Every voter currently receives the same shuffled answer order, concentrating first-position bias rather than averaging it away. Use a stable, different order for each player and round.</Priority>
          <Priority level="P1" title="Make mid-game joiners spectators first">A late joiner can become finale-eligible immediately, even without completing a full round. Let newcomers watch until the next complete round or next game, then add them to scoring eligibility.</Priority>
          <Priority level="P1" title="Test the new creative timer">The 35-second answer window and automatic draft lock reduce lost work. Observe drawing-heavy rounds to decide whether images need a separate longer setting.</Priority>
          <Priority level="P1" title="Respect Education during force-start">Client suggestions follow Fun or Education, but server-generated fallback prompts currently come from the party set. Put prompt libraries in one shared module and choose from the active room style everywhere.</Priority>
          <Priority level="P2" title="Adapt very small rooms">With one player, a self-vote cannot create an eligible winner. Recommend at least three active players and give one-player testing rooms an explicit practice result.</Priority>
          <Priority level="P2" title="Handle semantic duplicates">“Dog,” “a dog” and “Dog!” currently compete separately. Offer a conservative duplicate merge or a quick host confirmation, while preserving genuinely different jokes.</Priority>
          <Priority level="P2" title="Keep the timer visible">Long answer lists can push the visual timer away. Add a sticky compact countdown and lock control after real 12–20-player testing.</Priority>
          <Priority level="P2" title="Avoid repeated prompt suggestions">A previously generated suggestion can return and consume one of the five uses. Track all suggestions shown in that editor and sample without replacement.</Priority>
          <Priority level="P2" title="Finish the terminology pass">Use Prompt rather than Question in the round counter, host metrics, readiness messages, approval panel and finale labels whenever Herd is active.</Priority>
          <Priority level="P2" title="Remove legacy Herd styles">The client stylesheet still includes unused selectors from earlier exact-match and top-three versions. Remove them after the new reveal has completed its cross-device visual pass.</Priority>
        </div>
      </ReportSection>

      <ReportSection title="Stability, fairness and public-readiness notes">
        <dl className="information-scorecard">
          <div><dt>Phase completion</dt><dd>Strong</dd><p>Disconnected players do not block early completion, and timed-out ranking ballots become abstentions rather than invented votes.</p></div>
          <div><dt>Scoring safety</dt><dd>Strong</dd><p>Round scoring is idempotent, and the shared finale leaderboard is tie-aware at player level.</p></div>
          <div><dt>Answer privacy</dt><dd>Improved</dd><p>New answers receive random public identifiers, so the ballot no longer exposes the author's public player ID through the answer ID.</p></div>
          <div><dt>Content safety</dt><dd>Needs work</dd><p>Live answer text and media enter the ballot without an answer-level host review or removal workflow.</p></div>
          <div><dt>Media reliability</dt><dd>Mixed</dd><p>Room media is bounded, but image-answer submission uses a short client timeout that can report failure while a slow mobile upload is still reaching the server.</p></div>
          <div><dt>Player-count scaling</dt><dd>Needs work</dd><p>The current mechanic is trivial below four and cognitively heavy near twenty; both ends need explicit alternate rules.</p></div>
        </dl>
      </ReportSection>

      <ReportSection title="Comparison with nearby games">
        <div className="information-table-wrap"><table className="information-table"><thead><tr><th>Game</th><th>What it centres</th><th>Where Herd differs</th><th>Lesson</th></tr></thead><tbody>
          <tr><th><a href="https://bigpotato.com/products/herd-mentality" target="_blank" rel="noreferrer">Herd Mentality</a></th><td>Secret answers and matching the majority.</td><td>Gahookz reveals a player-made field and asks everyone to vote for one favourite response.</td><td>Market the live best-answer contest, not exact matching. A commercial name/trademark review is sensible.</td></tr>
          <tr><th><a href="https://www.jackboxgames.com/games/the-jackbox-party-pack-7/quiplash-3" target="_blank" rel="noreferrer">Quiplash 3</a></th><td>Write the funniest response and win a head-to-head vote.</td><td>Herd votes across the full room and can reward clever, heartfelt or chaotic answers—not only jokes.</td><td>Keep writing fast, moderation strong and reveals socially generous.</td></tr>
          <tr><th><a href="https://www.jackboxgames.com/games/fibbage-4" target="_blank" rel="noreferrer">Fibbage 4</a></th><td>Write a convincing lie and identify the truth.</td><td>Herd has no objective truth; the room directly decides which authored answer wins.</td><td>Make the single score source unmistakable at decision time and reveal time.</td></tr>
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
        <p className="information-pitch">Write your best answer. Pick one favourite. Let the room crown the winner.</p>
        <ul className="information-checklist">
          <li>Best with 4–10 active players; use a large-room qualification flow above 10.</li>
          <li>Target 12–18 minutes including the finale.</li>
          <li>Teach the single 500-point winning-answer reward before round one.</li>
          <li>Reveal the best answer as a celebration, then let the room inspect every response.</li>
          <li>Keep author identities hidden until voting closes.</li>
          <li>Retain images, drawings, prompt voting, the best-answer award and one Gahook per round.</li>
        </ul>
      </ReportSection>
    </>
  );
}
