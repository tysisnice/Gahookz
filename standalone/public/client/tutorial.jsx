import React, { useEffect, useId, useRef, useState } from "react";

export const TUTORIAL_CONTENT = Object.freeze({
  overview: Object.freeze({
    label: "Gahookz",
    summary: "Gahookz is a make-it-together party game: join the same room, create the chaos, then Gahook your friends at exactly the wrong moment.",
    artworkLabel: "The complete Gahookz flow: friends join one room, make Quiz, Majority Rulz, and Herd rounds together, then use a Gahook to steal points",
    stepTitles: Object.freeze([
      "Join your friends",
      "Make the game together",
      "Gahook for glory"
    ]),
    sentences: Object.freeze([
      "One person hosts and shares the four-letter room word. Everyone else joins on their own phone or computer—no account or app required.",
      "Quiz has real answers, Majority Rulz predicts the crowd, and Herd lets your friends write every answer choice.",
      "Use your Gahook once per round to surprise a friend and steal 50 points. Laugh, climb the leaderboard, and see who wins the final showdown."
    ])
  }),
  quiz: Object.freeze({
    label: "Quiz",
    summary: "Write the questions together, race to answer them, and outscore your friends with a perfectly timed Gahook.",
    artworkLabel: "The complete Quiz flow: making a question, racing to answer it, and Gahooking a friend for points",
    stepTitles: Object.freeze([
      "Make your own questions",
      "Answer fast to score",
      "Sabotage your friends!"
    ]),
    sentences: Object.freeze([
      "Everyone writes questions for the room—or uses the prompt button for inspiration. Mark the correct answer, then fill in believable wrong ones.",
      "Choose the right colour before time runs out. Correct answers earn points, and quicker answers earn more.",
      "Once per question, Gahook one friend to steal 50 points. Time it well—they can still answer."
    ])
  }),
  majority: Object.freeze({
    label: "Majority Rulz",
    summary: "Make opinion questions, predict the room’s favourite, then score by choosing the answer most people pick.",
    artworkLabel: "The complete Majority Rulz flow: writing an opinion question, predicting the crowd, and choosing the most popular answer",
    stepTitles: Object.freeze([
      "Ask for an opinion",
      "Predict the room",
      "Join the majority"
    ]),
    sentences: Object.freeze([
      "Write a funny opinion question with two to four possible answers—or tap the suggestion button for a party-ready idea.",
      "Mark the answer you predict everyone will choose. There is no factual correct answer; the room creates the result live.",
      "Pick the answer you think will be most popular. Matching the majority scores up to 1,000 points, and a perfect author prediction earns 100 bonus points."
    ])
  }),
  herd: Object.freeze({
    label: "Herd",
    summary: "Ask the prompt, secretly write answers for your friends’ questions, then vote for the room’s favourite.",
    artworkLabel: "The complete Herd flow: making one prompt, secretly writing answer choices, and voting for the crowd favourite",
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
    artworkLabel: "The complete Host flow: sharing a room word, choosing Quiz or Majority Rulz options, and running the live game",
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

function ArtworkFrame({ label, variant, colours, children }) {
  const gradientId = `tutorial-${variant}-background`;
  const shadowId = `tutorial-${variant}-shadow`;
  return <svg className={`tutorial-art tutorial-art--${variant}`} viewBox="0 0 900 380" role="img" aria-label={label}>
    <defs>
      <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={colours[0]} />
        <stop offset=".55" stopColor={colours[1]} />
        <stop offset="1" stopColor={colours[2]} />
      </linearGradient>
      <filter id={shadowId} x="-20%" y="-20%" width="140%" height="155%">
        <feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#06131f" floodOpacity=".34" />
      </filter>
    </defs>
    <rect width="900" height="380" rx="30" fill={`url(#${gradientId})`} />
    <circle cx="53" cy="54" r="18" fill="#ffdf45" opacity=".72" />
    <circle cx="846" cy="321" r="25" fill="#ff3d8b" opacity=".6" />
    <path d="M35 318l25-13-3 28 24 15-29 6-7 27-13-25-29 3 20-21zM826 48h34M843 31v34" fill="none" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" opacity=".58" />
    <g filter={`url(#${shadowId})`}>{children}</g>
  </svg>;
}

function FlowArrow({ x }) {
  return <g transform={`translate(${x} 184)`}>
    <path d="M0 0h48" fill="none" stroke="#111214" strokeWidth="9" strokeLinecap="round" />
    <path d="M36-15L55 0 36 15" fill="none" stroke="#111214" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
  </g>;
}

function OverviewTutorialArtwork({ label }) {
  return <ArtworkFrame label={label} variant="overview" colours={["#32155e", "#246bfe", "#00a8c7"]}>
    <g transform="translate(42 55)">
      <rect width="230" height="270" rx="24" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <rect x="17" y="16" width="94" height="30" rx="15" fill="#8ff0bc" />
      <text x="64" y="37" textAnchor="middle" fill="#063352" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">1 · JOIN</text>
      <text x="115" y="82" textAnchor="middle" fill="#344054" fontSize="12" fontWeight="900" fontFamily="system-ui, sans-serif">ROOM WORD</text>
      <text x="115" y="127" textAnchor="middle" fill="#246bfe" fontSize="42" fontWeight="1000" letterSpacing="7" fontFamily="system-ui, sans-serif">FISH</text>
      <g transform="translate(31 158)">
        <circle cx="22" cy="22" r="22" fill="#ff8fb8" stroke="#111214" strokeWidth="4" />
        <circle cx="84" cy="22" r="22" fill="#8ff0bc" stroke="#111214" strokeWidth="4" />
        <circle cx="146" cy="22" r="22" fill="#ffdf45" stroke="#111214" strokeWidth="4" />
        <circle cx="15" cy="19" r="3.5" /><circle cx="29" cy="19" r="3.5" /><path d="M14 29q8 7 16 0" fill="none" stroke="#111214" strokeWidth="3" strokeLinecap="round" />
        <circle cx="77" cy="19" r="3.5" /><circle cx="91" cy="19" r="3.5" /><path d="M76 29q8 7 16 0" fill="none" stroke="#111214" strokeWidth="3" strokeLinecap="round" />
        <circle cx="139" cy="19" r="3.5" /><circle cx="153" cy="19" r="3.5" /><path d="M138 29q8 7 16 0" fill="none" stroke="#111214" strokeWidth="3" strokeLinecap="round" />
      </g>
      <rect x="41" y="222" width="148" height="30" rx="15" fill="#20b26b" />
      <text x="115" y="242" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="1000" fontFamily="system-ui, sans-serif">FRIENDS ARE IN!</text>
    </g>
    <FlowArrow x={282} />
    <g transform="translate(335 55)">
      <rect width="230" height="270" rx="24" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <rect x="17" y="16" width="104" height="30" rx="15" fill="#ffdf45" />
      <text x="69" y="37" textAnchor="middle" fill="#111214" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">2 · MAKE</text>
      <rect x="25" y="66" width="180" height="54" rx="13" fill="#ffffff" stroke="#8baabd" strokeWidth="3" />
      <text x="115" y="88" textAnchor="middle" fill="#063352" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">WHAT WOULD A PENGUIN</text>
      <text x="115" y="105" textAnchor="middle" fill="#063352" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">ORDER AT A CAFE?</text>
      <g transform="translate(25 136)">
        <rect width="84" height="45" rx="10" fill="#e6383a" /><rect x="96" width="84" height="45" rx="10" fill="#246bfe" />
        <rect y="57" width="84" height="45" rx="10" fill="#f2c230" /><rect x="96" y="57" width="84" height="45" rx="10" fill="#20b26b" />
        <path d="M123 21l8 8 16-19" fill="none" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <text x="115" y="255" textAnchor="middle" fill="#5a2f89" fontSize="13" fontWeight="1000" fontFamily="system-ui, sans-serif">QUIZ + MAJORITY</text>
    </g>
    <FlowArrow x={575} />
    <g transform="translate(628 55)">
      <rect width="230" height="270" rx="24" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <rect x="17" y="16" width="122" height="30" rx="15" fill="#ff8fb8" />
      <text x="78" y="37" textAnchor="middle" fill="#5b1531" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">3 · GAHOOK</text>
      <g transform="translate(62 65)">
        <circle cx="53" cy="59" r="51" fill="#8d99a5" stroke="#111214" strokeWidth="6" />
        <circle cx="18" cy="22" r="18" fill="#74818c" stroke="#111214" strokeWidth="5" /><circle cx="88" cy="22" r="18" fill="#74818c" stroke="#111214" strokeWidth="5" />
        <ellipse cx="53" cy="70" rx="35" ry="29" fill="#d7dee4" />
        <circle cx="39" cy="53" r="5" /><circle cx="67" cy="53" r="5" />
        <path d="M36 78q17 14 34 0" fill="none" stroke="#111214" strokeWidth="5" strokeLinecap="round" />
      </g>
      <rect x="30" y="187" width="170" height="39" rx="19.5" fill="#111214" />
      <text x="115" y="213" textAnchor="middle" fill="#ff8fb8" fontSize="18" fontWeight="1000" fontFamily="system-ui, sans-serif">STEAL 50 PTS</text>
      <text x="115" y="249" textAnchor="middle" fill="#344054" fontSize="12" fontWeight="1000" fontFamily="system-ui, sans-serif">CLIMB THE BOARD</text>
    </g>
  </ArtworkFrame>;
}

function QuizTutorialArtwork({ label }) {
  return <ArtworkFrame label={label} variant="quiz" colours={["#073b59", "#246bfe", "#7c3aed"]}>
    <g transform="translate(42 55)">
      <rect width="230" height="270" rx="24" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <rect x="18" y="16" width="96" height="30" rx="15" fill="#8ff0bc" /><text x="66" y="37" textAnchor="middle" fill="#063352" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">1 · MAKE</text>
      <rect x="22" y="62" width="186" height="60" rx="12" fill="#ffffff" stroke="#9db8cd" strokeWidth="3" />
      <text x="115" y="85" textAnchor="middle" fill="#063352" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">BEST SNACK FOR</text><text x="115" y="104" textAnchor="middle" fill="#063352" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">A ROAD TRIP?</text>
      <g transform="translate(22 136)"><rect width="186" height="31" rx="9" fill="#e6383a" /><rect y="39" width="186" height="31" rx="9" fill="#246bfe" /><rect y="78" width="186" height="31" rx="9" fill="#20b26b" /><path d="M157 91l8 8 14-17" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></g>
      <text x="115" y="260" textAnchor="middle" fill="#087054" fontSize="12" fontWeight="1000" fontFamily="system-ui, sans-serif">MARK THE RIGHT ONE</text>
    </g>
    <FlowArrow x={282} />
    <g transform="translate(335 55)">
      <rect width="230" height="270" rx="24" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <rect x="18" y="16" width="94" height="30" rx="15" fill="#ffdf45" /><text x="65" y="37" textAnchor="middle" fill="#111214" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">2 · RACE</text>
      <circle cx="115" cy="88" r="32" fill="#ffdf45" stroke="#111214" strokeWidth="5" /><text x="115" y="98" textAnchor="middle" fill="#111214" fontSize="28" fontWeight="1000" fontFamily="system-ui, sans-serif">08</text>
      <g transform="translate(24 136)"><rect width="86" height="55" rx="11" fill="#e6383a" /><rect x="96" width="86" height="55" rx="11" fill="#246bfe" /><rect y="65" width="86" height="55" rx="11" fill="#f2c230" /><rect x="96" y="65" width="86" height="55" rx="11" fill="#20b26b" stroke="#111214" strokeWidth="4" /><path d="M120 92l8 8 17-22" fill="none" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></g>
      <rect x="69" y="243" width="92" height="29" rx="14.5" fill="#ff8a00" /><text x="115" y="263" textAnchor="middle" fill="#111214" fontSize="14" fontWeight="1000" fontFamily="system-ui, sans-serif">+920</text>
    </g>
    <FlowArrow x={575} />
    <g transform="translate(628 55)">
      <rect width="230" height="270" rx="24" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <rect x="18" y="16" width="122" height="30" rx="15" fill="#ff8fb8" /><text x="79" y="37" textAnchor="middle" fill="#5b1531" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">3 · GAHOOK</text>
      <g transform="translate(70 62)"><circle cx="45" cy="50" r="43" fill="#8d99a5" stroke="#111214" strokeWidth="6" /><circle cx="16" cy="18" r="16" fill="#74818c" stroke="#111214" strokeWidth="5" /><circle cx="74" cy="18" r="16" fill="#74818c" stroke="#111214" strokeWidth="5" /><ellipse cx="45" cy="59" rx="29" ry="24" fill="#d7dee4" /><circle cx="34" cy="45" r="4" /><circle cx="56" cy="45" r="4" /><path d="M31 66q14 11 28 0" fill="none" stroke="#111214" strokeWidth="5" strokeLinecap="round" /></g>
      <rect x="27" y="174" width="176" height="43" rx="12" fill="#e7eef5" stroke="#8baabd" strokeWidth="3" /><text x="45" y="194" fill="#344054" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">DISCO OTTER</text><text x="45" y="210" fill="#667085" fontSize="10" fontWeight="900" fontFamily="system-ui, sans-serif">820 points</text><rect x="139" y="183" width="52" height="25" rx="12.5" fill="#ff3d8b" /><text x="165" y="200" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="1000" fontFamily="system-ui, sans-serif">HIT!</text>
      <text x="115" y="255" textAnchor="middle" fill="#ff3d8b" fontSize="20" fontWeight="1000" fontFamily="system-ui, sans-serif">−50 / +50</text>
    </g>
  </ArtworkFrame>;
}

function MajorityTutorialArtwork({ label }) {
  return <ArtworkFrame label={label} variant="majority" colours={["#075d3c", "#00a8c7", "#246bfe"]}>
    <g transform="translate(42 55)">
      <rect width="230" height="270" rx="24" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <rect x="18" y="16" width="90" height="30" rx="15" fill="#ffdf45" /><text x="63" y="37" textAnchor="middle" fill="#111214" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">1 · ASK</text>
      <rect x="22" y="65" width="186" height="105" rx="14" fill="#ffffff" stroke="#8baabd" strokeWidth="3" />
      <text x="115" y="91" textAnchor="middle" fill="#087054" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">THE WORST THING</text><text x="115" y="111" textAnchor="middle" fill="#087054" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">TO HEAR FROM</text><text x="115" y="131" textAnchor="middle" fill="#087054" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">YOUR GPS IS...</text>
      <rect x="43" y="190" width="144" height="38" rx="19" fill="#7c3aed" /><text x="115" y="214" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="1000" fontFamily="system-ui, sans-serif">✦ OPINION IDEA</text>
      <text x="115" y="254" textAnchor="middle" fill="#667085" fontSize="11" fontWeight="900" fontFamily="system-ui, sans-serif">ASK THE ROOM</text>
    </g>
    <FlowArrow x={282} />
    <g transform="translate(335 55)">
      <rect width="230" height="270" rx="24" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <rect x="18" y="16" width="120" height="30" rx="15" fill="#8ff0bc" /><text x="78" y="37" textAnchor="middle" fill="#063352" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">2 · PREDICT</text>
      <g transform="translate(22 65)"><rect width="186" height="48" rx="12" fill="#eaf2ff" stroke="#246bfe" strokeWidth="3" /><text x="93" y="29" textAnchor="middle" fill="#063352" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">WET SOCKS</text><rect y="61" width="186" height="48" rx="12" fill="#fff2c5" stroke="#f2c230" strokeWidth="3" /><text x="93" y="90" textAnchor="middle" fill="#063352" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">SLOW WI-FI</text><rect y="122" width="186" height="48" rx="12" fill="#fce8f1" stroke="#ff3d8b" strokeWidth="3" /><text x="93" y="151" textAnchor="middle" fill="#063352" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">LOW BATTERY</text></g>
      <path d="M52 251h126" stroke="#8baabd" strokeWidth="3" strokeDasharray="6 6" /><text x="115" y="242" textAnchor="middle" fill="#667085" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">MARK YOUR GUESS</text>
    </g>
    <FlowArrow x={575} />
    <g transform="translate(628 55)">
      <rect width="230" height="270" rx="24" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <rect x="18" y="16" width="124" height="30" rx="15" fill="#ff8fb8" /><text x="80" y="37" textAnchor="middle" fill="#5b1531" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">3 · CHOOSE</text>
      <g transform="translate(25 64)"><rect x="42" width="138" height="58" rx="12" fill="#ffdf45" stroke="#111214" strokeWidth="4" /><circle cx="21" cy="29" r="19" fill="#ffdf45" stroke="#111214" strokeWidth="3" /><text x="21" y="36" textAnchor="middle" fontSize="22" fontWeight="1000" fontFamily="system-ui, sans-serif">★</text><text x="111" y="35" textAnchor="middle" fill="#111214" fontSize="12" fontWeight="1000" fontFamily="system-ui, sans-serif">MY FAVOURITE</text><rect x="42" y="72" width="138" height="42" rx="12" fill="#e7eef5" stroke="#8baabd" strokeWidth="3" /><rect x="42" y="126" width="138" height="42" rx="12" fill="#e7eef5" stroke="#8baabd" strokeWidth="3" /></g>
      <rect x="45" y="239" width="140" height="30" rx="15" fill="#20b26b" /><text x="115" y="260" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="1000" fontFamily="system-ui, sans-serif">UP TO +1000</text>
    </g>
  </ArtworkFrame>;
}

function HerdTutorialArtwork({ label }) {
  return <ArtworkFrame label={label} variant="herd" colours={["#4a1d73", "#ff3d8b", "#ff8a00"]}>
    <g transform="translate(42 55)">
      <rect width="230" height="270" rx="24" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <rect x="18" y="16" width="86" height="30" rx="15" fill="#8ff0bc" /><text x="61" y="37" textAnchor="middle" fill="#063352" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">1 · ASK</text>
      <rect x="22" y="66" width="186" height="108" rx="14" fill="#ffffff" stroke="#8baabd" strokeWidth="3" />
      <text x="115" y="98" textAnchor="middle" fill="#4a1d73" fontSize="12" fontWeight="1000" fontFamily="system-ui, sans-serif">WORST THING TO</text><text x="115" y="121" textAnchor="middle" fill="#4a1d73" fontSize="12" fontWeight="1000" fontFamily="system-ui, sans-serif">FIND IN A CAKE?</text>
      <text x="115" y="218" textAnchor="middle" fill="#667085" fontSize="12" fontWeight="1000" fontFamily="system-ui, sans-serif">PROMPT ONLY</text><text x="115" y="244" textAnchor="middle" fill="#ff3d8b" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">THE HERD ANSWERS</text>
    </g>
    <FlowArrow x={282} />
    <g transform="translate(335 55)">
      <rect width="230" height="270" rx="24" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <rect x="18" y="16" width="100" height="30" rx="15" fill="#ffdf45" /><text x="68" y="37" textAnchor="middle" fill="#111214" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">2 · WRITE</text>
      <g transform="translate(22 67)"><rect width="186" height="50" rx="11" fill="#fce8f1" stroke="#ff3d8b" strokeWidth="3" /><text x="93" y="30" textAnchor="middle" fill="#5b1531" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">A TINY LAWYER</text><rect y="64" width="186" height="50" rx="11" fill="#eaf2ff" stroke="#246bfe" strokeWidth="3" /><text x="93" y="94" textAnchor="middle" fill="#063352" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">AN ANGRY GOOSE</text><rect y="128" width="186" height="50" rx="11" fill="#fff2c5" stroke="#f2c230" strokeWidth="3" /><text x="93" y="158" textAnchor="middle" fill="#4a2c00" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">TUESDAY</text></g>
      <text x="115" y="260" textAnchor="middle" fill="#667085" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">SECRET UNTIL REVEAL</text>
    </g>
    <FlowArrow x={575} />
    <g transform="translate(628 55)">
      <rect width="230" height="270" rx="24" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <rect x="18" y="16" width="88" height="30" rx="15" fill="#ff8fb8" /><text x="62" y="37" textAnchor="middle" fill="#5b1531" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">3 · VOTE</text>
      <g transform="translate(23 65)"><rect width="184" height="58" rx="12" fill="#ff3d8b" stroke="#111214" strokeWidth="4" /><text x="92" y="35" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="1000" fontFamily="system-ui, sans-serif">AN ANGRY GOOSE</text><rect y="72" width="184" height="42" rx="12" fill="#d9e3ec" /><rect y="126" width="184" height="42" rx="12" fill="#d9e3ec" /></g>
      <rect x="38" y="237" width="154" height="31" rx="15" fill="#20b26b" /><text x="115" y="258" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="1000" fontFamily="system-ui, sans-serif">500 + 500 PTS</text>
    </g>
  </ArtworkFrame>;
}

function HostTutorialArtwork({ label }) {
  return <ArtworkFrame label={label} variant="host" colours={["#4a2c00", "#ff8a00", "#ff3d8b"]}>
    <g transform="translate(42 55)">
      <rect width="230" height="270" rx="24" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <rect x="18" y="16" width="100" height="30" rx="15" fill="#8ff0bc" /><text x="68" y="37" textAnchor="middle" fill="#063352" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">1 · INVITE</text>
      <text x="115" y="78" textAnchor="middle" fill="#667085" fontSize="11" fontWeight="900" fontFamily="system-ui, sans-serif">SHARE ROOM WORD</text><text x="115" y="125" textAnchor="middle" fill="#246bfe" fontSize="42" fontWeight="1000" letterSpacing="7" fontFamily="system-ui, sans-serif">FISH</text>
      <g transform="translate(31 153)"><circle cx="22" cy="22" r="22" fill="#ff8fb8" stroke="#111214" strokeWidth="4" /><circle cx="84" cy="22" r="22" fill="#8ff0bc" stroke="#111214" strokeWidth="4" /><circle cx="146" cy="22" r="22" fill="#ffdf45" stroke="#111214" strokeWidth="4" /><path d="M14 27q8 8 16 0M76 27q8 8 16 0M138 27q8 8 16 0" fill="none" stroke="#111214" strokeWidth="3" strokeLinecap="round" /></g>
      <rect x="43" y="216" width="144" height="34" rx="17" fill="#20b26b" /><text x="115" y="239" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="1000" fontFamily="system-ui, sans-serif">3 PLAYERS READY</text>
    </g>
    <FlowArrow x={282} />
    <g transform="translate(335 55)">
      <rect width="230" height="270" rx="24" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <rect x="18" y="16" width="106" height="30" rx="15" fill="#ffdf45" /><text x="71" y="37" textAnchor="middle" fill="#111214" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">2 · CHOOSE</text>
      <g transform="translate(22 65)"><rect width="88" height="55" rx="12" fill="#7c3aed" stroke="#111214" strokeWidth="3" /><text x="44" y="35" textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="1000" fontFamily="system-ui, sans-serif">QUIZ</text><rect x="98" width="88" height="55" rx="12" fill="#20b26b" stroke="#111214" strokeWidth="3" /><text x="142" y="29" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="1000" fontFamily="system-ui, sans-serif">MAJORITY</text><text x="142" y="43" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="1000" fontFamily="system-ui, sans-serif">RULZ</text></g>
      <text x="26" y="154" fill="#344054" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">GAME LENGTH</text><rect x="25" y="165" width="180" height="13" rx="6.5" fill="#d9e3ec" /><rect x="25" y="165" width="112" height="13" rx="6.5" fill="#246bfe" /><circle cx="137" cy="171.5" r="11" fill="#ffffff" stroke="#111214" strokeWidth="3" />
      <rect x="25" y="201" width="180" height="43" rx="11" fill="#e7eef5" /><text x="42" y="227" fill="#344054" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">APPROVE QUESTIONS</text><rect x="159" y="211" width="36" height="22" rx="11" fill="#20b26b" /><circle cx="184" cy="222" r="8" fill="#ffffff" />
    </g>
    <FlowArrow x={575} />
    <g transform="translate(628 55)">
      <rect width="230" height="270" rx="24" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <rect x="18" y="16" width="86" height="30" rx="15" fill="#ff8fb8" /><text x="61" y="37" textAnchor="middle" fill="#5b1531" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">3 · RUN</text>
      <rect x="22" y="63" width="186" height="55" rx="13" fill="#063352" /><text x="39" y="87" fill="#ffffff" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">QUESTION 4 / 10</text><text x="39" y="104" fill="#8ff0bc" fontSize="10" fontWeight="900" fontFamily="system-ui, sans-serif">8 ANSWERS IN</text>
      <g transform="translate(22 132)"><rect width="88" height="45" rx="11" fill="#ffdf45" stroke="#111214" strokeWidth="3" /><text x="44" y="29" textAnchor="middle" fill="#111214" fontSize="12" fontWeight="1000" fontFamily="system-ui, sans-serif">PAUSE</text><rect x="98" width="88" height="45" rx="11" fill="#ff8fb8" stroke="#111214" strokeWidth="3" /><text x="142" y="29" textAnchor="middle" fill="#5b1531" fontSize="12" fontWeight="1000" fontFamily="system-ui, sans-serif">SKIP</text></g>
      <g transform="translate(31 196)"><rect width="168" height="22" rx="11" fill="#ffdf45" /><rect y="29" width="137" height="22" rx="11" fill="#d9e3ec" /><rect y="58" width="106" height="22" rx="11" fill="#ffb36b" /><text x="12" y="16" fill="#111214" fontSize="10" fontWeight="1000" fontFamily="system-ui, sans-serif">1</text><text x="12" y="45" fill="#111214" fontSize="10" fontWeight="1000" fontFamily="system-ui, sans-serif">2</text><text x="12" y="74" fill="#111214" fontSize="10" fontWeight="1000" fontFamily="system-ui, sans-serif">3</text></g>
    </g>
  </ArtworkFrame>;
}

export function TutorialArtwork({ mode = "quiz", label }) {
  if (mode === "overview") return <OverviewTutorialArtwork label={label} />;
  if (mode === "host") return <HostTutorialArtwork label={label} />;
  if (mode === "majority") return <MajorityTutorialArtwork label={label} />;
  if (mode === "herd") return <HerdTutorialArtwork label={label} />;
  return <QuizTutorialArtwork label={label} />;
}

const TUTORIAL_MODE_ORDER = Object.freeze(["overview", "quiz", "majority", "herd", "host"]);

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
  return modes.length ? modes : ["quiz", "majority", "herd"];
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
