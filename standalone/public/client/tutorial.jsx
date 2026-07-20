import React, { useEffect, useId, useRef, useState } from "react";

export const TUTORIAL_CONTENT = Object.freeze({
  quiz: Object.freeze({
    eyebrow: "How to play Quiz",
    label: "Quiz",
    summary: "Write the questions together, race to answer them, and outscore your friends with a perfectly timed Gahook.",
    artworkLabel: "Three illustrated steps showing how to build, answer, and Gahook in Quiz mode",
    stepTitles: Object.freeze([
      "Make your own questions",
      "Answer fast to score",
      "Sabotage your friends!"
    ]),
    stepArtworkLabels: Object.freeze([
      "A player creating a funny question with four colourful answers and marking the correct one",
      "Friends racing to answer a live Quiz question while a timer and scores count up",
      "A Gahook character bursting onto a friend's screen and stealing 50 points"
    ]),
    sentences: Object.freeze([
      "Everyone writes questions for the room—or uses the prompt button for inspiration. Mark the correct answer, then fill in believable wrong ones.",
      "Choose the right colour before time runs out. Correct answers earn points, and quicker answers earn more.",
      "Once per question, Gahook one friend to steal 50 points. Time it well—they can still answer."
    ])
  }),
  herd: Object.freeze({
    eyebrow: "How to play Herd",
    label: "Herd",
    title: "Pick the Herd's favourites",
    summary: "Write wild prompts, answer anonymously, then predict the room's top three to prove you know your friends best.",
    artworkLabel: "A Gahookz Herd prompt with three colourful answer cards selected as first, second, and third",
    sentences: Object.freeze([
      "Write an open-ended prompt—or tap the generator up to five times for a ready-made idea.",
      "Answer anonymously, then tap the three responses you think the room will place first, second, and third.",
      "A top-three answer earns 500, 300, or 100 points, and an accurate prediction can earn 500 more—plus one well-timed Gahook can steal 50."
    ])
  }),
  host: Object.freeze({
    eyebrow: "Host guide",
    label: "Host",
    summary: "Bring everyone into one room, choose the rules, then keep the game moving all the way to the final celebration.",
    artworkLabel: "Three illustrated steps showing how to invite players, choose game options, and run a Gahookz game",
    stepTitles: Object.freeze([
      "Bring everyone in",
      "Choose the game",
      "Run the room"
    ]),
    stepArtworkLabels: Object.freeze([
      "A Gahookz host sharing a four-letter room code while three players join",
      "The host choosing Quiz or Herd, a game length, and question approval options",
      "The host starting a ready room and using live pause and skip controls while watching the leaderboard"
    ]),
    sentences: Object.freeze([
      "Share the room link or four-letter code, then watch the player cards appear as everyone joins.",
      "Pick Quiz or Herd, choose the game length, and decide whether questions need your approval.",
      "Begin question making, start when everyone is ready, then use pause or skip to keep the live game flowing."
    ])
  })
});

function QuizBuildArtwork({ label }) {
  return <svg className="tutorial-art tutorial-art--quiz tutorial-art--quiz-build" viewBox="0 0 640 330" role="img" aria-label={label}>
    <defs>
      <linearGradient id="tutorial-quiz-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#073b59" />
        <stop offset="1" stopColor="#00a8c7" />
      </linearGradient>
      <filter id="tutorial-quiz-shadow" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#001923" floodOpacity=".32" />
      </filter>
    </defs>
    <rect width="640" height="330" rx="26" fill="url(#tutorial-quiz-bg)" />
    <path d="M24 52h24M36 40v24M585 47l18-18M584 29l19 19" fill="none" stroke="#ffdf45" strokeWidth="6" strokeLinecap="round" opacity=".9" />
    <circle cx="602" cy="280" r="15" fill="#ff3d8b" opacity=".86" />
    <g transform="translate(42 17)" filter="url(#tutorial-quiz-shadow)">
      <rect width="556" height="296" rx="22" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <text x="27" y="33" fill="#063352" fontSize="17" fontWeight="1000" fontFamily="system-ui, sans-serif">MAKE A QUESTION</text>
      <rect x="386" y="13" width="143" height="30" rx="15" fill="#ffdf45" stroke="#111214" strokeWidth="3" />
      <text x="457.5" y="33" textAnchor="middle" fill="#111214" fontSize="12" fontWeight="1000" fontFamily="system-ui, sans-serif">✦ FUNNY PROMPT</text>

      <rect x="27" y="54" width="350" height="62" rx="12" fill="#ffffff" stroke="#9db8cd" strokeWidth="3" />
      <text x="43" y="74" fill="#708399" fontSize="10" fontWeight="900" fontFamily="system-ui, sans-serif">QUESTION TEXT</text>
      <text x="43" y="99" fill="#182b3a" fontSize="16" fontWeight="900" fontFamily="system-ui, sans-serif">What would a penguin order at a café?</text>
      <rect x="391" y="54" width="138" height="62" rx="12" fill="#e8f3fa" stroke="#8baabd" strokeWidth="3" strokeDasharray="7 6" />
      <path d="M438 83h44M460 69v28" stroke="#246bfe" strokeWidth="4" strokeLinecap="round" />
      <text x="460" y="108" textAnchor="middle" fill="#476477" fontSize="9" fontWeight="900" fontFamily="system-ui, sans-serif">OPTIONAL IMAGE</text>

      <g transform="translate(27 130)">
        <rect width="502" height="34" rx="10" fill="#e53c45" />
        <circle cx="22" cy="17" r="10" fill="#ffffff" stroke="#111214" strokeWidth="3" />
        <path d="M17 17l4 4 7-9" fill="none" stroke="#20b26b" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="43" y="8" width="432" height="18" rx="7" fill="#ffffff" />
        <text x="55" y="21" fill="#182b3a" fontSize="11" fontWeight="900" fontFamily="system-ui, sans-serif">An ice-cold cappuccino</text>
      </g>
      <g transform="translate(27 169)">
        <rect width="502" height="34" rx="10" fill="#246bfe" />
        <circle cx="22" cy="17" r="10" fill="#ffffff" stroke="#111214" strokeWidth="3" />
        <rect x="43" y="8" width="432" height="18" rx="7" fill="#ffffff" />
        <text x="55" y="21" fill="#182b3a" fontSize="11" fontWeight="900" fontFamily="system-ui, sans-serif">A bucket of fish sprinkles</text>
      </g>
      <g transform="translate(27 208)">
        <rect width="502" height="34" rx="10" fill="#f2c230" />
        <circle cx="22" cy="17" r="10" fill="#ffffff" stroke="#111214" strokeWidth="3" />
        <rect x="43" y="8" width="432" height="18" rx="7" fill="#ffffff" />
        <text x="55" y="21" fill="#182b3a" fontSize="11" fontWeight="900" fontFamily="system-ui, sans-serif">One very formal snow cone</text>
      </g>
      <rect x="27" y="254" width="128" height="27" rx="13.5" fill="#ffffff" stroke="#246bfe" strokeWidth="3" />
      <text x="91" y="272" textAnchor="middle" fill="#246bfe" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">+ ADD ANSWER</text>
      <rect x="394" y="250" width="135" height="35" rx="17.5" fill="#20b26b" stroke="#111214" strokeWidth="4" />
      <text x="461.5" y="273" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="1000" fontFamily="system-ui, sans-serif">SUBMIT ✓</text>
    </g>
  </svg>;
}

function QuizAnswerArtwork({ label }) {
  return <svg className="tutorial-art tutorial-art--quiz tutorial-art--quiz-answer" viewBox="0 0 640 330" role="img" aria-label={label}>
    <defs>
      <linearGradient id="tutorial-answer-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#32155e" />
        <stop offset=".55" stopColor="#246bfe" />
        <stop offset="1" stopColor="#00a8c7" />
      </linearGradient>
      <linearGradient id="tutorial-answer-score" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#ffdf45" />
        <stop offset="1" stopColor="#ff8a00" />
      </linearGradient>
      <filter id="tutorial-answer-shadow" x="-25%" y="-25%" width="150%" height="160%">
        <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#100726" floodOpacity=".34" />
      </filter>
    </defs>
    <rect width="640" height="330" rx="26" fill="url(#tutorial-answer-bg)" />
    <path d="M30 48h24M42 36v24M582 74l16-17M577 55l22 21M45 257l17 10-17 10" fill="none" stroke="#ffdf45" strokeWidth="7" strokeLinecap="round" opacity=".9" />
    <circle cx="600" cy="276" r="18" fill="#ff3d8b" opacity=".72" />
    <circle cx="78" cy="103" r="10" fill="#8ff0bc" opacity=".8" />

    <g filter="url(#tutorial-answer-shadow)">
      <rect x="92" y="23" width="456" height="72" rx="20" fill="#ffffff" />
      <rect x="125" y="43" width="265" height="12" rx="6" fill="#182b3a" />
      <rect x="125" y="66" width="192" height="9" rx="4.5" fill="#9aa9b4" />
      <circle cx="508" cy="59" r="27" fill="#ffdf45" stroke="#111214" strokeWidth="4" />
      <path d="M508 44v17l12 8" fill="none" stroke="#111214" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M497 33h22" stroke="#111214" strokeWidth="5" strokeLinecap="round" />
    </g>

    <g filter="url(#tutorial-answer-shadow)">
      <rect x="103" y="112" width="202" height="62" rx="15" fill="#e6383a" />
      <path d="M136 127l17 30h-34z" fill="#ffffff" />
      <rect x="170" y="133" width="103" height="10" rx="5" fill="#ffffff" />
      <rect x="170" y="151" width="66" height="7" rx="3.5" fill="#ffffff" opacity=".62" />
      <rect x="335" y="112" width="202" height="62" rx="15" fill="#246bfe" />
      <path d="M369 127l16 16-16 16-16-16z" fill="#ffffff" />
      <rect x="402" y="133" width="103" height="10" rx="5" fill="#ffffff" />
      <rect x="402" y="151" width="72" height="7" rx="3.5" fill="#ffffff" opacity=".62" />
      <rect x="103" y="185" width="202" height="62" rx="15" fill="#f2c230" />
      <circle cx="136" cy="216" r="16" fill="#182b3a" />
      <rect x="170" y="206" width="103" height="10" rx="5" fill="#182b3a" opacity=".88" />
      <rect x="170" y="224" width="78" height="7" rx="3.5" fill="#182b3a" opacity=".48" />
      <rect x="335" y="185" width="202" height="62" rx="15" fill="#20b26b" stroke="#ffffff" strokeWidth="5" />
      <rect x="353" y="199" width="32" height="32" rx="6" fill="#ffffff" />
      <path d="M361 216l7 7 11-15" fill="none" stroke="#075d3c" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="402" y="206" width="103" height="10" rx="5" fill="#ffffff" />
      <rect x="402" y="224" width="80" height="7" rx="3.5" fill="#ffffff" opacity=".64" />
    </g>

    <g transform="translate(102 260)" filter="url(#tutorial-answer-shadow)">
      <circle cx="39" cy="25" r="28" fill="#ff9d66" stroke="#111214" strokeWidth="4" />
      <path d="M17 14L8 1l18 4M60 14L70 1 51 5" fill="#ff9d66" stroke="#111214" strokeWidth="4" strokeLinejoin="round" />
      <circle cx="29" cy="22" r="4" fill="#111214" /><circle cx="49" cy="22" r="4" fill="#111214" />
      <path d="M29 34q10 8 20 0" fill="none" stroke="#111214" strokeWidth="4" strokeLinecap="round" />
      <rect x="70" y="5" width="78" height="38" rx="19" fill="url(#tutorial-answer-score)" stroke="#111214" strokeWidth="4" />
      <text x="109" y="30" textAnchor="middle" fill="#111214" fontSize="18" fontWeight="1000" fontFamily="system-ui, sans-serif">+920</text>
    </g>
    <g transform="translate(373 260)" filter="url(#tutorial-answer-shadow)">
      <circle cx="38" cy="25" r="28" fill="#8ff0bc" stroke="#111214" strokeWidth="4" />
      <circle cx="23" cy="8" r="10" fill="#8ff0bc" stroke="#111214" strokeWidth="4" />
      <circle cx="53" cy="8" r="10" fill="#8ff0bc" stroke="#111214" strokeWidth="4" />
      <circle cx="28" cy="22" r="4" fill="#111214" /><circle cx="48" cy="22" r="4" fill="#111214" />
      <path d="M26 35q12 7 24 0" fill="none" stroke="#111214" strokeWidth="4" strokeLinecap="round" />
      <rect x="69" y="5" width="78" height="38" rx="19" fill="#ffffff" stroke="#111214" strokeWidth="4" />
      <text x="108" y="30" textAnchor="middle" fill="#246bfe" fontSize="18" fontWeight="1000" fontFamily="system-ui, sans-serif">+710</text>
    </g>
  </svg>;
}

function QuizGahookArtwork({ label }) {
  return <svg className="tutorial-art tutorial-art--quiz tutorial-art--quiz-gahook" viewBox="0 0 640 330" role="img" aria-label={label}>
    <defs>
      <radialGradient id="tutorial-gahook-bg" cx="50%" cy="46%" r="74%">
        <stop offset="0" stopColor="#526b78" />
        <stop offset=".55" stopColor="#334f66" />
        <stop offset="1" stopColor="#4f4268" />
      </radialGradient>
      <linearGradient id="tutorial-gahook-screen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#eafaff" />
        <stop offset="1" stopColor="#c8e9ff" />
      </linearGradient>
      <filter id="tutorial-gahook-shadow" x="-30%" y="-30%" width="170%" height="180%">
        <feDropShadow dx="0" dy="9" stdDeviation="7" floodColor="#071923" floodOpacity=".34" />
      </filter>
    </defs>
    <rect width="640" height="330" rx="26" fill="url(#tutorial-gahook-bg)" />
    <g opacity=".14" stroke="#d9f5f8" strokeWidth="12" strokeLinecap="round">
      <path d="M320 149L36 55M320 149L73 263M320 149L586 45M320 149L598 259M320 149L319 15M320 149L315 315" />
    </g>
    <path d="M30 101l24-10-4 26 22 13-26 8-2 28-17-20-25 11 11-25-18-18 27-1z" fill="#9f8dde" opacity=".48" />
    <path d="M566 218l18-8-2 19 18 9-19 7-2 20-13-15-19 7 8-18-13-13 20-1z" fill="#75c9d1" opacity=".62" />

    <g transform="translate(20 18) rotate(-1)" filter="url(#tutorial-gahook-shadow)">
      <rect width="278" height="49" rx="15" fill="#f8fbff" stroke="#bed3e6" strokeWidth="3" />
      <circle cx="29" cy="24.5" r="17" fill="#8ff0bc" stroke="#111214" strokeWidth="3" />
      <circle cx="23" cy="22" r="3" fill="#111214" /><circle cx="35" cy="22" r="3" fill="#111214" />
      <path d="M22 31q7 5 14 0" fill="none" stroke="#111214" strokeWidth="3" strokeLinecap="round" />
      <text x="55" y="22" fill="#183044" fontSize="13" fontWeight="1000" fontFamily="system-ui, sans-serif">Disco Otter</text>
      <text x="55" y="38" fill="#667085" fontSize="10" fontWeight="900" fontFamily="system-ui, sans-serif">820 pts</text>
      <rect x="197" y="10" width="67" height="29" rx="14.5" fill="#e5edf4" stroke="#45637a" strokeWidth="2.5" />
      <text x="230.5" y="29" textAnchor="middle" fill="#274256" fontSize="9" fontWeight="1000" fontFamily="system-ui, sans-serif">GAHOOK</text>
    </g>

    <g transform="translate(54 60) rotate(-4)" filter="url(#tutorial-gahook-shadow)">
      <rect width="236" height="214" rx="24" fill="url(#tutorial-gahook-screen)" stroke="#111214" strokeWidth="7" />
      <rect x="24" y="20" width="188" height="35" rx="12" fill="#ffffff" />
      <circle cx="46" cy="38" r="10" fill="#246bfe" />
      <rect x="65" y="31" width="91" height="11" rx="5.5" fill="#344054" />
      <rect x="151" y="23" width="68" height="29" rx="14.5" fill="#ff3d8b" stroke="#111214" strokeWidth="3" />
      <text x="185" y="42" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="1000" fontFamily="system-ui, sans-serif">PRESSED!</text>
      <circle cx="118" cy="112" r="45" fill="#9aa9b4" stroke="#111214" strokeWidth="6" />
      <circle cx="84" cy="83" r="20" fill="#788794" stroke="#111214" strokeWidth="5" />
      <circle cx="152" cy="83" r="20" fill="#788794" stroke="#111214" strokeWidth="5" />
      <ellipse cx="118" cy="126" rx="33" ry="27" fill="#d8e0e6" />
      <circle cx="104" cy="108" r="6" fill="#111214" /><circle cx="132" cy="108" r="6" fill="#111214" />
      <path d="M101 137q17-17 34 0" fill="none" stroke="#111214" strokeWidth="6" strokeLinecap="round" />
      <rect x="53" y="169" width="130" height="34" rx="17" fill="#111214" />
      <text x="118" y="192" textAnchor="middle" fill="#ff8fb8" fontSize="19" fontWeight="1000" fontFamily="system-ui, sans-serif">FRIEND −50</text>
    </g>

    <path d="M295 169c39-30 77-29 108-6" fill="none" stroke="#111214" strokeWidth="13" strokeLinecap="round" />
    <path d="M386 139l36 31-45 13" fill="#111214" stroke="#111214" strokeWidth="5" strokeLinejoin="round" />
    <rect x="305" y="102" width="102" height="39" rx="19.5" fill="#ffffff" stroke="#111214" strokeWidth="5" />
    <text x="356" y="128" textAnchor="middle" fill="#d42a76" fontSize="18" fontWeight="1000" fontFamily="system-ui, sans-serif">FRIEND −50</text>

    <g transform="translate(405 54) rotate(7)" filter="url(#tutorial-gahook-shadow)">
      <circle cx="91" cy="101" r="79" fill="#8a4f21" stroke="#111214" strokeWidth="8" />
      <circle cx="31" cy="77" r="35" fill="#6b3b16" stroke="#111214" strokeWidth="7" />
      <circle cx="151" cy="77" r="35" fill="#6b3b16" stroke="#111214" strokeWidth="7" />
      <ellipse cx="91" cy="121" rx="58" ry="47" fill="#f6c78b" />
      <circle cx="68" cy="94" r="10" fill="#111214" /><circle cx="114" cy="94" r="10" fill="#111214" />
      <circle cx="72" cy="90" r="3" fill="#ffffff" /><circle cx="118" cy="90" r="3" fill="#ffffff" />
      <path d="M58 133q33 34 66 0" fill="#ffffff" stroke="#111214" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M42 33L20 5M139 30l27-27M9 121l-28 11M169 119l27 15" stroke="#ffdf45" strokeWidth="9" strokeLinecap="round" />
      <path d="M31 176h124l-9 69-52 21-54-22z" fill="#246bfe" stroke="#111214" strokeWidth="8" strokeLinejoin="round" />
      <text x="93" y="219" textAnchor="middle" fill="#ffffff" fontSize="24" fontWeight="1000" fontFamily="system-ui, sans-serif">GAHOOK!</text>
    </g>

    <g transform="translate(20 274) rotate(1)" filter="url(#tutorial-gahook-shadow)">
      <rect width="278" height="43" rx="14" fill="#f8fbff" stroke="#bed3e6" strokeWidth="3" />
      <circle cx="27" cy="21.5" r="15" fill="#ffb47c" stroke="#111214" strokeWidth="3" />
      <path d="M16 14L10 5l12 4M38 14l6-9-12 4" fill="#ffb47c" stroke="#111214" strokeWidth="2.5" strokeLinejoin="round" />
      <text x="50" y="19" fill="#183044" fontSize="12" fontWeight="1000" fontFamily="system-ui, sans-serif">Party Fox</text>
      <text x="50" y="33" fill="#667085" fontSize="9" fontWeight="900" fontFamily="system-ui, sans-serif">640 pts</text>
      <rect x="197" y="7" width="67" height="29" rx="14.5" fill="#e5edf4" stroke="#45637a" strokeWidth="2.5" />
      <text x="230.5" y="26" textAnchor="middle" fill="#274256" fontSize="9" fontWeight="1000" fontFamily="system-ui, sans-serif">GAHOOK</text>
    </g>
    <g transform="translate(419 267) rotate(-3)" filter="url(#tutorial-gahook-shadow)">
      <rect width="178" height="45" rx="22.5" fill="#ffffff" stroke="#111214" strokeWidth="4" />
      <circle cx="22" cy="22.5" r="12" fill="#20b26b" />
      <path d="M16 23l5 5 9-12" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <text x="104" y="20" textAnchor="middle" fill="#075d3c" fontSize="13" fontWeight="1000" fontFamily="system-ui, sans-serif">YOU +50</text>
      <text x="104" y="34" textAnchor="middle" fill="#344054" fontSize="9" fontWeight="1000" fontFamily="system-ui, sans-serif">ONCE PER QUESTION</text>
    </g>
  </svg>;
}

function QuizTutorialArtwork({ step = 0, label }) {
  if (step === 1) return <QuizAnswerArtwork label={label} />;
  if (step === 2) return <QuizGahookArtwork label={label} />;
  return <QuizBuildArtwork label={label} />;
}

function HostInviteArtwork({ label }) {
  return <svg className="tutorial-art tutorial-art--host tutorial-art--host-invite" viewBox="0 0 640 330" role="img" aria-label={label}>
    <defs>
      <linearGradient id="tutorial-host-invite-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#063b57" />
        <stop offset="1" stopColor="#147d83" />
      </linearGradient>
      <filter id="tutorial-host-invite-shadow" x="-20%" y="-20%" width="140%" height="160%">
        <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#03202e" floodOpacity=".34" />
      </filter>
    </defs>
    <rect width="640" height="330" rx="26" fill="url(#tutorial-host-invite-bg)" />
    <path d="M31 48h26M44 35v26M577 37l17 17M594 37l-17 17" fill="none" stroke="#ffdf45" strokeWidth="6" strokeLinecap="round" opacity=".8" />
    <g transform="translate(103 25)" filter="url(#tutorial-host-invite-shadow)">
      <rect width="434" height="111" rx="22" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <text x="24" y="31" fill="#62778a" fontSize="12" fontWeight="1000" fontFamily="system-ui, sans-serif">YOUR ROOM CODE</text>
      <text x="24" y="80" fill="#063352" fontSize="48" fontWeight="1000" letterSpacing="8" fontFamily="system-ui, sans-serif">WACK</text>
      <rect x="260" y="29" width="149" height="50" rx="25" fill="#ffdf45" stroke="#111214" strokeWidth="4" />
      <path d="M285 49h24v20h-24zM293 41h24v20" fill="none" stroke="#111214" strokeWidth="4" strokeLinejoin="round" />
      <text x="360" y="61" textAnchor="middle" fill="#111214" fontSize="13" fontWeight="1000" fontFamily="system-ui, sans-serif">SHARE LINK</text>
    </g>
    <path d="M320 140v35M320 164H126v24M320 164h194v24" fill="none" stroke="#8ff0bc" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity=".88" />
    <g transform="translate(38 181) rotate(-2)" filter="url(#tutorial-host-invite-shadow)">
      <rect width="174" height="116" rx="20" fill="#ffffff" stroke="#111214" strokeWidth="5" />
      <circle cx="87" cy="43" r="27" fill="#ffb47c" stroke="#111214" strokeWidth="4" />
      <path d="M67 28l-9-15 20 7M107 28l9-15-20 7" fill="#ffb47c" stroke="#111214" strokeWidth="4" strokeLinejoin="round" />
      <circle cx="78" cy="42" r="4" fill="#111214" /><circle cx="96" cy="42" r="4" fill="#111214" />
      <text x="87" y="87" textAnchor="middle" fill="#183044" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">Party Fox</text>
      <rect x="53" y="95" width="68" height="17" rx="8.5" fill="#d8f5e7" />
      <text x="87" y="107" textAnchor="middle" fill="#075d3c" fontSize="9" fontWeight="1000" fontFamily="system-ui, sans-serif">JOINED</text>
    </g>
    <g transform="translate(233 174)" filter="url(#tutorial-host-invite-shadow)">
      <rect width="174" height="126" rx="20" fill="#ffffff" stroke="#111214" strokeWidth="5" />
      <circle cx="87" cy="47" r="29" fill="#8ff0bc" stroke="#111214" strokeWidth="4" />
      <circle cx="76" cy="43" r="4" fill="#111214" /><circle cx="98" cy="43" r="4" fill="#111214" />
      <path d="M75 56q12 9 24 0" fill="none" stroke="#111214" strokeWidth="4" strokeLinecap="round" />
      <text x="87" y="94" textAnchor="middle" fill="#183044" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">Disco Otter</text>
      <rect x="53" y="103" width="68" height="17" rx="8.5" fill="#d8f5e7" />
      <text x="87" y="115" textAnchor="middle" fill="#075d3c" fontSize="9" fontWeight="1000" fontFamily="system-ui, sans-serif">JOINED</text>
    </g>
    <g transform="translate(428 181) rotate(2)" filter="url(#tutorial-host-invite-shadow)">
      <rect width="174" height="116" rx="20" fill="#ffffff" stroke="#111214" strokeWidth="5" />
      <circle cx="87" cy="43" r="27" fill="#b8a5e8" stroke="#111214" strokeWidth="4" />
      <circle cx="77" cy="40" r="4" fill="#111214" /><circle cx="97" cy="40" r="4" fill="#111214" />
      <path d="M76 53q11 8 22 0" fill="none" stroke="#111214" strokeWidth="4" strokeLinecap="round" />
      <text x="87" y="87" textAnchor="middle" fill="#183044" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">Jazz Panda</text>
      <rect x="53" y="95" width="68" height="17" rx="8.5" fill="#d8f5e7" />
      <text x="87" y="107" textAnchor="middle" fill="#075d3c" fontSize="9" fontWeight="1000" fontFamily="system-ui, sans-serif">JOINED</text>
    </g>
  </svg>;
}

function HostOptionsArtwork({ label }) {
  return <svg className="tutorial-art tutorial-art--host tutorial-art--host-options" viewBox="0 0 640 330" role="img" aria-label={label}>
    <defs>
      <linearGradient id="tutorial-host-options-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#302052" />
        <stop offset="1" stopColor="#68517e" />
      </linearGradient>
      <filter id="tutorial-host-options-shadow" x="-20%" y="-20%" width="140%" height="160%">
        <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#160d28" floodOpacity=".34" />
      </filter>
    </defs>
    <rect width="640" height="330" rx="26" fill="url(#tutorial-host-options-bg)" />
    <g transform="translate(39 22)" filter="url(#tutorial-host-options-shadow)">
      <rect width="562" height="286" rx="23" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <text x="24" y="33" fill="#063352" fontSize="18" fontWeight="1000" fontFamily="system-ui, sans-serif">CHOOSE YOUR GAME</text>
      <text x="24" y="58" fill="#667085" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">GAME MODE</text>
      <g transform="translate(24 69)">
        <rect width="245" height="61" rx="15" fill="#ffedf5" stroke="#ff3d8b" strokeWidth="5" />
        <circle cx="35" cy="30.5" r="20" fill="#7c3aed" />
        <text x="35" y="37" textAnchor="middle" fill="#ffffff" fontSize="19" fontWeight="1000" fontFamily="system-ui, sans-serif">?</text>
        <text x="69" y="28" fill="#3c215e" fontSize="17" fontWeight="1000" fontFamily="system-ui, sans-serif">QUIZ</text>
        <text x="69" y="45" fill="#6b5579" fontSize="10" fontWeight="900" fontFamily="system-ui, sans-serif">BUILD + ANSWER</text>
        <circle cx="218" cy="30" r="12" fill="#20b26b" />
        <path d="M212 30l5 5 9-12" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g transform="translate(293 69)">
        <rect width="245" height="61" rx="15" fill="#edf9f5" stroke="#a6cfc0" strokeWidth="3" />
        <circle cx="35" cy="30.5" r="20" fill="#20b26b" />
        <circle cx="29" cy="28" r="4" fill="#ffffff" /><circle cx="41" cy="28" r="4" fill="#ffffff" />
        <text x="69" y="28" fill="#174d3c" fontSize="17" fontWeight="1000" fontFamily="system-ui, sans-serif">HERD</text>
        <text x="69" y="45" fill="#55756a" fontSize="10" fontWeight="900" fontFamily="system-ui, sans-serif">THINK TOGETHER</text>
      </g>
      <text x="24" y="157" fill="#667085" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">GAME LENGTH</text>
      <g transform="translate(24 169)">
        <rect width="154" height="48" rx="13" fill="#ffffff" stroke="#c9d6e2" strokeWidth="3" />
        <text x="77" y="22" textAnchor="middle" fill="#344054" fontSize="13" fontWeight="1000" fontFamily="system-ui, sans-serif">QUICK</text>
        <text x="77" y="37" textAnchor="middle" fill="#98a2b3" fontSize="9" fontWeight="900" fontFamily="system-ui, sans-serif">~10 MIN</text>
        <rect x="169" width="154" height="48" rx="13" fill="#eaf3ff" stroke="#246bfe" strokeWidth="4" />
        <text x="246" y="22" textAnchor="middle" fill="#164ebc" fontSize="13" fontWeight="1000" fontFamily="system-ui, sans-serif">STANDARD</text>
        <text x="246" y="37" textAnchor="middle" fill="#5274ae" fontSize="9" fontWeight="900" fontFamily="system-ui, sans-serif">~20 MIN</text>
        <rect x="338" width="176" height="48" rx="13" fill="#ffffff" stroke="#c9d6e2" strokeWidth="3" />
        <text x="426" y="22" textAnchor="middle" fill="#344054" fontSize="13" fontWeight="1000" fontFamily="system-ui, sans-serif">CUSTOM</text>
        <text x="426" y="37" textAnchor="middle" fill="#98a2b3" fontSize="9" fontWeight="900" fontFamily="system-ui, sans-serif">YOU DECIDE</text>
      </g>
      <g transform="translate(24 235)">
        <rect width="514" height="35" rx="12" fill="#edf4f8" />
        <text x="15" y="23" fill="#344054" fontSize="12" fontWeight="1000" fontFamily="system-ui, sans-serif">APPROVE QUESTIONS</text>
        <rect x="444" y="7" width="54" height="22" rx="11" fill="#20b26b" />
        <circle cx="487" cy="18" r="8" fill="#ffffff" />
      </g>
    </g>
  </svg>;
}

function HostRunArtwork({ label }) {
  return <svg className="tutorial-art tutorial-art--host tutorial-art--host-run" viewBox="0 0 640 330" role="img" aria-label={label}>
    <defs>
      <linearGradient id="tutorial-host-run-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#103d4f" />
        <stop offset="1" stopColor="#27583f" />
      </linearGradient>
      <linearGradient id="tutorial-host-start" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#20b26b" />
        <stop offset="1" stopColor="#00bfd8" />
      </linearGradient>
      <filter id="tutorial-host-run-shadow" x="-20%" y="-20%" width="140%" height="160%">
        <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#061d1c" floodOpacity=".35" />
      </filter>
    </defs>
    <rect width="640" height="330" rx="26" fill="url(#tutorial-host-run-bg)" />
    <path d="M25 39l19-10 19 10M570 294l19-11 19 11" fill="none" stroke="#ffdf45" strokeWidth="6" strokeLinecap="round" opacity=".72" />
    <g transform="translate(29 25)" filter="url(#tutorial-host-run-shadow)">
      <rect width="245" height="280" rx="22" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <text x="20" y="33" fill="#667085" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">PLAYER READY CHECK</text>
      {[0, 1, 2].map((index) => <g transform={`translate(18 ${52 + index * 52})`} key={index}>
        <rect width="209" height="42" rx="12" fill={index === 1 ? "#edf3ff" : "#edf8f4"} />
        <circle cx="23" cy="21" r="14" fill={["#ffb47c", "#b8a5e8", "#8ff0bc"][index]} stroke="#111214" strokeWidth="3" />
        <rect x="48" y="13" width={index === 1 ? 78 : 91} height="8" rx="4" fill="#344054" />
        <rect x="48" y="27" width="53" height="6" rx="3" fill="#98a2b3" />
        <circle cx="184" cy="21" r="11" fill="#20b26b" />
        <path d="M178 21l5 5 8-11" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>)}
      <text x="122.5" y="221" textAnchor="middle" fill="#075d3c" fontSize="12" fontWeight="1000" fontFamily="system-ui, sans-serif">3 / 3 READY</text>
      <rect x="18" y="235" width="209" height="34" rx="17" fill="url(#tutorial-host-start)" stroke="#111214" strokeWidth="4" />
      <text x="122.5" y="257" textAnchor="middle" fill="#052f29" fontSize="14" fontWeight="1000" fontFamily="system-ui, sans-serif">START GAME</text>
    </g>
    <path d="M288 164h34" fill="none" stroke="#ffdf45" strokeWidth="8" strokeLinecap="round" />
    <path d="M315 148l18 16-18 16" fill="none" stroke="#ffdf45" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    <g transform="translate(342 25)" filter="url(#tutorial-host-run-shadow)">
      <rect width="269" height="280" rx="22" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <rect x="18" y="17" width="233" height="38" rx="12" fill="#183f56" />
      <text x="34" y="41" fill="#ffffff" fontSize="12" fontWeight="1000" fontFamily="system-ui, sans-serif">QUESTION 4 / 12</text>
      <circle cx="210" cy="36" r="13" fill="#ffdf45" />
      <path d="M210 28v9l7 4" fill="none" stroke="#111214" strokeWidth="3" strokeLinecap="round" />
      <rect x="18" y="68" width="233" height="53" rx="13" fill="#ffffff" stroke="#c9d6e2" strokeWidth="3" />
      <rect x="35" y="84" width="151" height="9" rx="4.5" fill="#344054" />
      <rect x="35" y="101" width="109" height="7" rx="3.5" fill="#98a2b3" />
      <g transform="translate(18 135)">
        <rect width="108" height="40" rx="12" fill="#ffedf5" stroke="#ff3d8b" strokeWidth="3" />
        <text x="54" y="25" textAnchor="middle" fill="#b51f65" fontSize="12" fontWeight="1000" fontFamily="system-ui, sans-serif">Ⅱ PAUSE</text>
        <rect x="125" width="108" height="40" rx="12" fill="#edf3ff" stroke="#246bfe" strokeWidth="3" />
        <text x="179" y="25" textAnchor="middle" fill="#164ebc" fontSize="12" fontWeight="1000" fontFamily="system-ui, sans-serif">SKIP ›</text>
      </g>
      <text x="18" y="202" fill="#667085" fontSize="10" fontWeight="1000" fontFamily="system-ui, sans-serif">LIVE LEADERBOARD</text>
      {[0, 1, 2].map((index) => <g transform={`translate(18 ${213 + index * 19})`} key={index}>
        <circle cx="8" cy="8" r="8" fill={["#ffdf45", "#b8a5e8", "#8ff0bc"][index]} />
        <text x="8" y="11" textAnchor="middle" fill="#111214" fontSize="8" fontWeight="1000" fontFamily="system-ui, sans-serif">{index + 1}</text>
        <rect x="22" y="4" width={92 - index * 8} height="8" rx="4" fill="#516579" />
        <text x="230" y="12" textAnchor="end" fill="#344054" fontSize="10" fontWeight="1000" fontFamily="system-ui, sans-serif">{[1240, 980, 760][index]}</text>
      </g>)}
    </g>
  </svg>;
}

function HostTutorialArtwork({ step = 0, label }) {
  if (step === 1) return <HostOptionsArtwork label={label} />;
  if (step === 2) return <HostRunArtwork label={label} />;
  return <HostInviteArtwork label={label} />;
}

function HerdTutorialArtwork({ label }) {
  return <svg className="tutorial-art tutorial-art--herd" viewBox="0 0 640 330" role="img" aria-label={label}>
    <defs>
      <linearGradient id="tutorial-herd-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#32155e" />
        <stop offset="1" stopColor="#8a236b" />
      </linearGradient>
      <linearGradient id="tutorial-herd-rank" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#ffdf45" />
        <stop offset="1" stopColor="#ff8a48" />
      </linearGradient>
      <filter id="tutorial-herd-shadow" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#170620" floodOpacity=".34" />
      </filter>
    </defs>
    <rect width="640" height="330" rx="26" fill="url(#tutorial-herd-bg)" />
    <path d="M19 59l18-9 18 9M570 289l19-11 19 11" fill="none" stroke="#ffdf45" strokeWidth="6" strokeLinecap="round" opacity=".65" />
    <circle cx="600" cy="48" r="9" fill="#6ee7f9" />
    <circle cx="45" cy="279" r="12" fill="#ff3d8b" />
    <g filter="url(#tutorial-herd-shadow)">
      <rect x="76" y="31" width="488" height="69" rx="19" fill="#fff" />
      <path d="M135 100l-9 21 30-21" fill="#fff" />
      <rect x="111" y="52" width="315" height="12" rx="6" fill="#32155e" />
      <rect x="111" y="75" width="232" height="8" rx="4" fill="#a38eae" />
      <circle cx="519" cy="65" r="22" fill="#20b26b" />
      <path d="M509 65l7 7 14-17" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </g>
    <g filter="url(#tutorial-herd-shadow)">
      <rect x="152" y="130" width="373" height="49" rx="15" fill="url(#tutorial-herd-rank)" />
      <circle cx="180" cy="155" r="16" fill="#fff" />
      <text x="180" y="161" fill="#32155e" fontSize="17" fontWeight="900" textAnchor="middle" fontFamily="system-ui, sans-serif">1</text>
      <rect x="211" y="147" width="192" height="10" rx="5" fill="#32155e" opacity=".82" />
      <path d="M474 142l14 25 14-25z" fill="#fff" />
      <rect x="118" y="192" width="373" height="49" rx="15" fill="#f7effc" />
      <circle cx="146" cy="217" r="16" fill="#734296" />
      <text x="146" y="223" fill="#fff" fontSize="17" fontWeight="900" textAnchor="middle" fontFamily="system-ui, sans-serif">2</text>
      <rect x="177" y="209" width="225" height="10" rx="5" fill="#55306e" opacity=".7" />
      <circle cx="450" cy="217" r="9" fill="#ff8fb8" />
      <rect x="84" y="254" width="373" height="49" rx="15" fill="#e8daf1" />
      <circle cx="112" cy="279" r="16" fill="#9f78b7" />
      <text x="112" y="285" fill="#fff" fontSize="17" fontWeight="900" textAnchor="middle" fontFamily="system-ui, sans-serif">3</text>
      <rect x="143" y="271" width="178" height="10" rx="5" fill="#55306e" opacity=".53" />
      <path d="M411 269l9 9-9 9-9-9z" fill="#20b26b" />
    </g>
    <g transform="translate(482 214)" filter="url(#tutorial-herd-shadow)">
      <circle cx="47" cy="47" r="42" fill="#8a4f21" stroke="#111214" strokeWidth="6" />
      <circle cx="20" cy="37" r="19" fill="#6b3b16" />
      <circle cx="74" cy="37" r="19" fill="#6b3b16" />
      <ellipse cx="47" cy="56" rx="30" ry="24" fill="#f6c78b" />
      <circle cx="35" cy="43" r="7" fill="#111214" />
      <circle cx="59" cy="43" r="7" fill="#111214" />
      <path d="M31 64q16 18 32 0" fill="none" stroke="#111214" strokeWidth="6" strokeLinecap="round" />
      <path d="M78 7l8-14M91 17l15-8" stroke="#ffdf45" strokeWidth="6" strokeLinecap="round" />
    </g>
  </svg>;
}

export function TutorialArtwork({ mode = "quiz", label, step = 0 }) {
  if (mode === "host") return <HostTutorialArtwork step={step} label={label} />;
  if (mode === "herd") return <HerdTutorialArtwork label={label} />;
  return <QuizTutorialArtwork step={step} label={label} />;
}

const TUTORIAL_MODE_ORDER = Object.freeze(["quiz", "herd", "host"]);

function normaliseTutorialMode(mode) {
  return Object.prototype.hasOwnProperty.call(TUTORIAL_CONTENT, mode) ? mode : "quiz";
}

function availableTutorialModes(allowedModes, includeHost) {
  const requested = Array.isArray(allowedModes) && allowedModes.length ? allowedModes : TUTORIAL_MODE_ORDER;
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
      <header className="quiz-tutorial__header tutorial-guide__header">
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
        {selectedMode === "quiz" || selectedMode === "host" ? <ol className="quiz-tutorial__rows" aria-label={`${content.label} instructions`}>
          {content.sentences.map((sentence, index) => <li className="quiz-tutorial__row" key={content.stepTitles[index]}>
            <div className="quiz-tutorial__copy">
              <span className="quiz-tutorial__number" aria-hidden="true">{index + 1}</span>
              <div>
                <h3>{content.stepTitles[index]}</h3>
                <p>{sentence}</p>
              </div>
            </div>
            <div className="quiz-tutorial__visual">
              <TutorialArtwork mode={selectedMode} step={index} label={content.stepArtworkLabels[index]} />
            </div>
          </li>)}
        </ol> : <>
          <div className="tutorial-dialog__art">
            <TutorialArtwork mode={selectedMode} label={content.artworkLabel} />
          </div>
          <h3 className="tutorial-guide__mode-title">{content.title}</h3>
          <ol className="tutorial-dialog__steps">
            {content.sentences.map((sentence, index) => <li className="tutorial-dialog__step" key={sentence}>
              <span className="tutorial-dialog__step-number" aria-hidden="true">{index + 1}</span>
              <span>{sentence}</span>
            </li>)}
          </ol>
        </>}
      </div>
      <div className="tutorial-dialog__actions tutorial-dialog__actions--quiz">
        <button className="tutorial-dialog__done tutorial-dialog__done--quiz" type="button" onClick={onClose}>Let's Go!</button>
      </div>
    </section>
  </div>;
}

export default GameTutorial;
