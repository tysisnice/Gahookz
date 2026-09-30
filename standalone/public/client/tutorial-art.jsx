import React from "react";

// Tutorial illustrations (audio-art). The dialog, tabs and copy live in
// tutorial.jsx; this module only draws.
//
// Redrawn on 2026-09-25 ("make them much higher quality, make them clear,
// have personality, and simple"). The old art was three tiny UI mock-ups per
// mode with 11-15 unit text, which is 4-5 px on a phone. The rules now:
//
// - One 900 x 400 picture per mode: three numbered sticker cards, one beat
//   each, whose badge colours match the numbered steps underneath (green,
//   blue, pink).
// - Few, big shapes. A phone shows this at about a third of its size, so
//   nothing that has to be read is smaller than 40 units, and the only words
//   are the room word and point values.
// - The Gahook characters are the cast: the monkey is the hero, the Sad Pig
//   is usually on the wrong end of it.
// - House style: #111214 outlines, flat saturated fills, hard offset shadows.

const INK = "#111214";
const FONT = "Inter, ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", sans-serif";
const STEP_COLOURS = ["#20b26b", "#246bfe", "#ff3d8b"];
const CARD_X = [16, 316, 616];
const CARD_Y = 40;
const CARD_W = 268;
const CARD_H = 330;

// ---------------------------------------------------------------------------
// Frame, cards and connectors

function Scene({ label, variant, colours, children }) {
  const gradientId = `tutorial-art-${variant}-sky`;
  return <svg className={`tutorial-art tutorial-art--${variant}`} viewBox="0 0 900 400" role="img" aria-label={label}>
    <defs>
      <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={colours[0]} />
        <stop offset=".55" stopColor={colours[1]} />
        <stop offset="1" stopColor={colours[2]} />
      </linearGradient>
    </defs>
    <rect width="900" height="400" fill={`url(#${gradientId})`} />
    <g fill="#ffffff" opacity=".1">
      <circle cx="120" cy="-40" r="170" /><circle cx="820" cy="430" r="190" /><circle cx="470" cy="210" r="120" />
    </g>
    <g opacity=".85">
      <circle cx="300" cy="30" r="7" fill="#ffdf45" /><circle cx="604" cy="378" r="7" fill="#8ff0bc" />
      <circle cx="883" cy="30" r="6" fill="#ff8fb8" /><circle cx="8" cy="372" r="6" fill="#7bdcff" />
    </g>
    {children}
  </svg>;
}

function Card({ index, children }) {
  const x = CARD_X[index];
  return <g transform={`translate(${x} ${CARD_Y})`}>
    <rect x="9" y="11" width={CARD_W} height={CARD_H} rx="30" fill={INK} opacity=".32" />
    <rect width={CARD_W} height={CARD_H} rx="30" fill="#fffdf7" stroke={INK} strokeWidth="6" />
    {children}
    <circle cx="28" cy="6" r="29" fill={STEP_COLOURS[index]} stroke={INK} strokeWidth="6" />
    <text x="28" y="20" textAnchor="middle" fill="#ffffff" fontSize="40" fontWeight="900" fontFamily={FONT}>{index + 1}</text>
  </g>;
}

function Connector({ index }) {
  const x = CARD_X[index + 1] - 16;
  return <g transform={`translate(${x} 205)`}>
    <circle r="24" fill="#ffdf45" stroke={INK} strokeWidth="6" />
    <path d="M-6-11L6 0-6 11" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
  </g>;
}

function Beats({ children }) {
  const beats = React.Children.toArray(children);
  return <>
    {beats.map((beat, index) => <Card index={index} key={index}>{beat}</Card>)}
    <Connector index={0} /><Connector index={1} />
  </>;
}

function Label({ x, y, size = 44, fill = INK, children, anchor = "middle", spacing = 0 }) {
  return <text x={x} y={y} textAnchor={anchor} fill={fill} fontSize={size} fontWeight="900" letterSpacing={spacing} fontFamily={FONT}>{children}</text>;
}

function Pill({ x, y, width, fill, text, textFill = "#ffffff", rotate = 0, size = 40 }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
    <rect x={-width / 2} y="-28" width={width} height="56" rx="28" fill={fill} stroke={INK} strokeWidth="5" />
    <Label x={0} y={14} size={size} fill={textFill}>{text}</Label>
  </g>;
}

// ---------------------------------------------------------------------------
// The cast: simplified Gahook heads drawn in a 100 x 100 box. `size` is the
// box's width in scene units.

function Critter({ kind, x, y, size = 100, mood = "happy", flip = false }) {
  const scale = size / 100;
  const Face = CRITTERS[kind] || MonkeyHead;
  return <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})${flip ? " translate(-100 0)" : ""}`}>
    <Face mood={mood} />
  </g>;
}

function MonkeyHead({ mood }) {
  const yelling = mood === "yell";
  return <g>
    <circle cx="16" cy="48" r="16" fill="#6b3b16" stroke={INK} strokeWidth="5" />
    <circle cx="84" cy="48" r="16" fill="#6b3b16" stroke={INK} strokeWidth="5" />
    <circle cx="50" cy="54" r="37" fill="#8a4f21" stroke={INK} strokeWidth="5" />
    <path d="M26 30Q50 6 74 30" fill="none" stroke="#ffdf45" strokeWidth="7" strokeLinecap="round" />
    <circle cx="38" cy="50" r="12.5" fill="#f6c78b" /><circle cx="62" cy="50" r="12.5" fill="#f6c78b" />
    <ellipse cx="50" cy="68" rx="23" ry="17" fill="#f6c78b" />
    {yelling ? <>
      <circle cx="38" cy="48" r="9" fill="#ffffff" stroke={INK} strokeWidth="3" /><circle cx="62" cy="48" r="9" fill="#ffffff" stroke={INK} strokeWidth="3" />
      <circle cx="40" cy="49" r="4.5" fill={INK} /><circle cx="60" cy="49" r="4.5" fill={INK} />
      <path d="M26 34l18 7M74 34l-18 7" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="45" cy="60" rx="3.5" ry="2.5" fill="#3a2114" /><ellipse cx="55" cy="60" rx="3.5" ry="2.5" fill="#3a2114" />
      <path d="M33 68Q50 60 67 68Q64 92 50 92Q36 92 33 68Z" fill="#5b0f2a" stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
      <path d="M40 86Q50 78 60 86Q56 92 50 92Q44 92 40 86Z" fill="#ff5c8a" />
      <path d="M36 69h28" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
    </> : <>
      <circle cx="39" cy="48" r="6.5" fill={INK} /><circle cx="61" cy="48" r="6.5" fill={INK} />
      <circle cx="41" cy="46" r="2.2" fill="#ffffff" /><circle cx="63" cy="46" r="2.2" fill="#ffffff" />
      <ellipse cx="45" cy="62" rx="3.5" ry="2.5" fill="#3a2114" /><ellipse cx="55" cy="62" rx="3.5" ry="2.5" fill="#3a2114" />
      <path d="M36 71Q50 85 64 71" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
    </>}
  </g>;
}

function PigHead({ mood }) {
  const crying = mood === "cry";
  return <g>
    <path d="M22 40Q10 18 16 5Q36 9 45 26Z" fill="#ff86b5" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
    <path d="M78 40Q90 18 84 5Q64 9 55 26Z" fill="#ff86b5" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
    <ellipse cx="50" cy="88" rx="25" ry="8" fill="#ff9dc3" stroke={INK} strokeWidth="5" />
    <ellipse cx="50" cy="56" rx="45" ry="36" fill="#ff9dc3" stroke={INK} strokeWidth="5" />
    <ellipse cx="21" cy="66" rx="7" ry="5" fill="#ff5f9e" opacity=".55" /><ellipse cx="79" cy="66" rx="7" ry="5" fill="#ff5f9e" opacity=".55" />
    {crying ? <>
      <path d="M25 47q9-9 18-1M57 46q9-8 18 1" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <path d="M28 50q-5 14-2 28M72 50q5 14 2 28" fill="none" stroke={INK} strokeWidth="10" strokeLinecap="round" />
      <path d="M28 50q-5 14-2 28M72 50q5 14 2 28" fill="none" stroke="#6fd3ff" strokeWidth="5" strokeLinecap="round" />
      <path d="M38 81Q50 69 62 81Q60 89 50 89Q40 89 38 81Z" fill="#5b0f2a" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
    </> : <>
      <circle cx="33" cy="45" r="5" fill={INK} /><circle cx="67" cy="45" r="5" fill={INK} />
      <path d="M40 79Q50 87 60 79" fill="none" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />
    </>}
    <ellipse cx="50" cy="61" rx="17" ry="12" fill="#ff78ac" stroke={INK} strokeWidth="4.5" />
    <ellipse cx="44" cy="61" rx="3" ry="4.5" fill="#7c1d48" /><ellipse cx="56" cy="61" rx="3" ry="4.5" fill="#7c1d48" />
  </g>;
}

function KoalaHead({ mood }) {
  return <g>
    <circle cx="16" cy="34" r="17" fill="#9297a1" stroke={INK} strokeWidth="5" /><circle cx="16" cy="34" r="8" fill="#d8dbe1" />
    <circle cx="84" cy="34" r="17" fill="#9297a1" stroke={INK} strokeWidth="5" /><circle cx="84" cy="34" r="8" fill="#d8dbe1" />
    <ellipse cx="50" cy="57" rx="40" ry="38" fill="#c7cbd1" stroke={INK} strokeWidth="5" />
    <circle cx="27" cy="66" r="5" fill="#ff8fb8" opacity=".6" /><circle cx="73" cy="66" r="5" fill="#ff8fb8" opacity=".6" />
    {mood === "shock" ? <>
      <circle cx="33" cy="48" r="8" fill="#ffffff" stroke={INK} strokeWidth="3" /><circle cx="67" cy="48" r="8" fill="#ffffff" stroke={INK} strokeWidth="3" />
      <circle cx="33" cy="48" r="3.5" fill={INK} /><circle cx="67" cy="48" r="3.5" fill={INK} />
      <ellipse cx="50" cy="84" rx="6" ry="7" fill="#5b6380" stroke={INK} strokeWidth="3" />
    </> : <>
      <circle cx="33" cy="49" r="5" fill={INK} /><circle cx="67" cy="49" r="5" fill={INK} />
      <path d="M41 83Q50 90 59 83" fill="none" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />
    </>}
    <ellipse cx="50" cy="62" rx="11" ry="14" fill="#22242a" />
  </g>;
}

function ChickenHead({ mood }) {
  return <g>
    <path d="M37 24q-3-15 10-10 6-12 13 0 12-4 6 11" fill="#ef4444" stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
    <circle cx="50" cy="56" r="37" fill="#fff7df" stroke={INK} strokeWidth="5" />
    <circle cx="36" cy="48" r="10.5" fill="#ffffff" stroke={INK} strokeWidth="3.5" /><circle cx="64" cy="48" r="10.5" fill="#ffffff" stroke={INK} strokeWidth="3.5" />
    <circle cx={mood === "think" ? 39 : 37} cy={mood === "think" ? 45 : 50} r="4.5" fill={INK} /><circle cx={mood === "think" ? 67 : 63} cy={mood === "think" ? 45 : 50} r="4.5" fill={INK} />
    <path d="M40 62h20l-10 14z" fill="#ff8a00" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
    <path d="M45 79q5 10 10 0" fill="#ef4444" stroke={INK} strokeWidth="3" />
  </g>;
}

function CrocHead() {
  return <g>
    <path d="M12 44Q16 18 42 22L50 10l8 12q26-4 30 22l-6 8q8 12 4 24-6 20-36 20S16 86 10 76q-4-12 4-24z" fill="#4d9f2d" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
    <path d="M20 40h26l3 15H24zM54 40h26l-3 15H51z" fill="#0b0c0d" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
    <path d="M24 44h17M58 44h17" stroke="#6ee7f9" strokeWidth="3.5" strokeLinecap="round" opacity=".75" />
    <ellipse cx="50" cy="74" rx="32" ry="17" fill="#8bd14b" stroke={INK} strokeWidth="4" />
    <circle cx="40" cy="68" r="2.5" fill={INK} /><circle cx="60" cy="68" r="2.5" fill={INK} />
    <path d="M28 78Q50 92 72 78" fill="#ffffff" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
  </g>;
}

const CRITTERS = { monkey: MonkeyHead, pig: PigHead, koala: KoalaHead, chicken: ChickenHead, croc: CrocHead };

// ---------------------------------------------------------------------------
// Props

function QuestionCard({ x, y, width = 200, height = 150, mark = "?", markFill = "#7c3aed", rotate = 0 }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate} ${width / 2} ${height / 2})`}>
    <rect width={width} height={height} rx="20" fill="#ffffff" stroke={INK} strokeWidth="6" />
    <Label x={width / 2} y={height / 2 + 40} size="118" fill={markFill}>{mark}</Label>
  </g>;
}

function Pencil({ x, y, rotate = -35, length = 150 }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
    <path d={`M0-13h${length - 34}l34 13-34 13H0z`} fill="#ffdf45" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
    <path d={`M${length - 34}-13l34 13-34 13z`} fill="#f6c78b" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
    <path d={`M${length - 10}-4l10 4-10 4z`} fill={INK} />
    <rect x="-24" y="-13" width="26" height="26" rx="6" fill="#ff8fb8" stroke={INK} strokeWidth="5" />
    <path d={`M8 0h${length - 46}`} stroke="#f2c230" strokeWidth="4" strokeLinecap="round" />
  </g>;
}

function Check({ x, y, size = 1, stroke = "#ffffff" }) {
  return <path transform={`translate(${x} ${y}) scale(${size})`} d="M-14 0l9 9 19-21" fill="none" stroke={stroke} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />;
}

function AnswerChips({ x, y, size = 50, gap = 10, pick = 3 }) {
  const colours = ["#e6383a", "#246bfe", "#f2c230", "#20b26b"];
  return <g transform={`translate(${x} ${y})`}>
    {colours.map((colour, index) => <rect key={colour} x={index * (size + gap)} width={size} height={size} rx="12" fill={colour} stroke={INK} strokeWidth={index === pick ? 6 : 4} />)}
    <Check x={pick * (size + gap) + size / 2} y={size / 2 + 2} />
  </g>;
}

function Burst({ x, y, r = 110, points = 12, fill = "#ffdf45" }) {
  const path = Array.from({ length: points * 2 }, (_value, index) => {
    const radius = index % 2 ? r * 0.72 : r;
    const angle = (Math.PI * index) / points - Math.PI / 2;
    return `${index ? "L" : "M"}${(x + Math.cos(angle) * radius).toFixed(1)} ${(y + Math.sin(angle) * radius).toFixed(1)}`;
  }).join("") + "Z";
  return <path d={path} fill={fill} stroke={INK} strokeWidth="6" strokeLinejoin="round" />;
}

function Stopwatch({ x, y, r = 46 }) {
  return <g transform={`translate(${x} ${y})`}>
    <rect x="-12" y={-r - 20} width="24" height="16" rx="5" fill={INK} />
    <path d={`M${r * 0.6} ${-r * 0.78}l12-12`} stroke={INK} strokeWidth="8" strokeLinecap="round" />
    <circle r={r} fill="#ffdf45" stroke={INK} strokeWidth="6" />
    <circle r={r - 11} fill="#ffffff" stroke={INK} strokeWidth="4" />
    <path d={`M0 0V${-(r - 20)}`} stroke={INK} strokeWidth="6" strokeLinecap="round" />
    <path d={`M0 0L${(r - 22) * 0.8} ${(r - 22) * 0.2}`} stroke="#ff3d8b" strokeWidth="6" strokeLinecap="round" />
    <circle r="6" fill={INK} />
  </g>;
}

function SpeedLines({ x, y, flip = false }) {
  const sign = flip ? -1 : 1;
  return <path transform={`translate(${x} ${y})`} d={`M0 0h${sign * -34}M6 18h${sign * -26}M0 36h${sign * -34}`} stroke={INK} strokeWidth="6" strokeLinecap="round" />;
}

function Phone({ x, y, width = 150, height = 230, word = "FISH" }) {
  return <g transform={`translate(${x} ${y})`}>
    <rect width={width} height={height} rx="26" fill="#1c2340" stroke={INK} strokeWidth="6" />
    <rect x="12" y="24" width={width - 24} height={height - 48} rx="14" fill="#fffdf7" />
    <rect x={width / 2 - 20} y="9" width="40" height="7" rx="3.5" fill="#3a4466" />
    <Label x={width / 2} y={height / 2 + 16} size="46" fill="#246bfe" spacing="2">{word}</Label>
    <rect x={width / 2 - 40} y={height / 2 + 36} width="80" height="12" rx="6" fill="#d9e3ec" />
  </g>;
}

function StickyNote({ x, y, fill, rotate = 0, width = 150, height = 120 }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate} ${width / 2} ${height / 2})`}>
    <rect width={width} height={height} rx="10" fill={fill} stroke={INK} strokeWidth="5" />
    <path d={`M22 40h${width - 44}M22 66h${width - 64}M22 92h${width - 84}`} stroke={INK} strokeWidth="7" strokeLinecap="round" opacity=".7" />
  </g>;
}

function Padlock({ x, y }) {
  return <g transform={`translate(${x} ${y})`}>
    <path d="M-17-8v-12a17 17 0 0 1 34 0v12" fill="none" stroke={INK} strokeWidth="8" />
    <rect x="-27" y="-10" width="54" height="44" rx="10" fill="#ffdf45" stroke={INK} strokeWidth="6" />
    <circle cx="0" cy="8" r="6" fill={INK} /><path d="M0 10v12" stroke={INK} strokeWidth="6" strokeLinecap="round" />
  </g>;
}

function Crown({ x, y, width = 70 }) {
  const w = width;
  return <path transform={`translate(${x - w / 2} ${y})`} d={`M0 0L${w * 0.2} ${-w * 0.45}L${w * 0.5} ${-w * 0.15}L${w * 0.8} ${-w * 0.45}L${w} 0Z`} fill="#ffdf45" stroke={INK} strokeWidth="5" strokeLinejoin="round" />;
}

function Trophy({ x, y, scale = 1 }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <path d="M-34-50h68v18c0 30-16 48-34 48s-34-18-34-48z" fill="#ffdf45" stroke={INK} strokeWidth="6" strokeLinejoin="round" />
    <path d="M-34-40h-16c0 22 10 32 22 32M34-40h16c0 22-10 32-22 32" fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" />
    <path d="M-8 16h16v16H-8z" fill="#f2c230" stroke={INK} strokeWidth="5" />
    <rect x="-30" y="30" width="60" height="18" rx="5" fill="#ff8a00" stroke={INK} strokeWidth="5" />
    <path d="M-16-36v20" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" opacity=".8" />
  </g>;
}

function RoundButton({ x, y, r = 40, fill, children }) {
  return <g transform={`translate(${x} ${y})`}>
    <circle cx="4" cy="6" r={r} fill={INK} opacity=".3" />
    <circle r={r} fill={fill} stroke={INK} strokeWidth="6" />
    {children}
  </g>;
}

function Toggle({ x, y, on = true }) {
  return <g transform={`translate(${x} ${y})`}>
    <rect x="-54" y="-28" width="108" height="56" rx="28" fill={on ? "#20b26b" : "#d9e3ec"} stroke={INK} strokeWidth="6" />
    <circle cx={on ? 26 : -26} r="20" fill="#ffffff" stroke={INK} strokeWidth="5" />
    {on ? <Check x={-22} y={0} size={0.75} /> : null}
  </g>;
}

function Sparkle({ x, y, size = 1, fill = "#ffffff" }) {
  return <path transform={`translate(${x} ${y}) scale(${size})`} d="M0-16L4-4 16 0 4 4 0 16-4 4-16 0-4-4Z" fill={fill} stroke={INK} strokeWidth="3" strokeLinejoin="round" />;
}

function Tear({ x, y, size = 1 }) {
  return <path transform={`translate(${x} ${y}) scale(${size})`} d="M0-14C6-4 10 2 10 7a10 10 0 0 1-20 0c0-5 4-11 10-21z" fill="#6fd3ff" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />;
}

// ---------------------------------------------------------------------------
// The beats. Each draws inside a 268 x 330 card whose number badge sits over
// its top-left corner, so nothing important goes in that corner.

function WriteQuestionBeat() {
  return <>
    <QuestionCard x={34} y={54} width={200} height={156} rotate={-3} />
    <Pencil x={150} y={206} rotate={-38} length={128} />
    <AnswerChips x={16} y={244} size={52} gap={10} />
  </>;
}

function RaceBeat() {
  return <>
    <Stopwatch x={134} y={100} r={50} />
    <SpeedLines x={62} y={76} />
    <g transform="translate(30 172)">
      <rect width="98" height="64" rx="14" fill="#e6383a" stroke={INK} strokeWidth="4" />
      <rect x="110" width="98" height="64" rx="14" fill="#246bfe" stroke={INK} strokeWidth="4" />
      <rect y="76" width="98" height="64" rx="14" fill="#f2c230" stroke={INK} strokeWidth="4" />
      <rect x="110" y="76" width="98" height="64" rx="14" fill="#20b26b" stroke={INK} strokeWidth="7" />
      <Check x={159} y={110} size={1.2} />
    </g>
    <Pill x={196} y={322} width={136} fill="#ff8a00" textFill={INK} text="+900" rotate={-4} />
  </>;
}

function GahookFriendBeat() {
  return <>
    <Burst x={162} y={104} r={98} points={11} />
    <Critter kind="monkey" mood="yell" x={82} y={24} size={160} />
    <Critter kind="pig" mood="cry" x={10} y={196} size={118} />
    <Tear x={26} y={194} size={1.2} /><Tear x={126} y={206} size={0.9} />
    <Pill x={192} y={272} width={118} fill="#e6383a" text="−50" rotate={6} />
  </>;
}

function JoinBeat() {
  return <>
    <Phone x={62} y={50} width={144} height={236} />
    <Critter kind="koala" x={-6} y={188} size={96} />
    <Critter kind="chicken" x={186} y={36} size={86} />
    <Critter kind="pig" x={176} y={200} size={96} />
    <Sparkle x={236} y={164} size={1.1} fill="#ffdf45" />
  </>;
}

function MakeTogetherBeat() {
  return <>
    <StickyNote x={126} y={52} fill="#ff8fb8" rotate={8} width={118} height={100} />
    <QuestionCard x={26} y={60} width={176} height={150} rotate={-4} />
    <Pencil x={148} y={214} rotate={-36} length={118} />
    <AnswerChips x={16} y={248} size={52} gap={10} />
  </>;
}

function GloryBeat() {
  return <>
    <Burst x={134} y={120} r={104} points={12} />
    <Critter kind="monkey" mood="yell" x={56} y={40} size={156} />
    <Trophy x={202} y={262} scale={0.9} />
    <Pill x={82} y={292} width={118} fill="#20b26b" text="+50" rotate={-5} />
  </>;
}

function AskBeat() {
  return <>
    <path d="M70 46h164a20 20 0 0 1 20 20v104a20 20 0 0 1-20 20H136l-42 38 8-38H70a20 20 0 0 1-20-20V66a20 20 0 0 1 20-20z" fill="#ffffff" stroke={INK} strokeWidth="6" strokeLinejoin="round" />
    <Label x={152} y={160} size="120" fill="#ff3d8b">?</Label>
    <Critter kind="chicken" mood="think" x={8} y={196} size={120} />
  </>;
}

function SecretWriteBeat() {
  return <>
    <StickyNote x={32} y={58} fill="#7bdcff" rotate={-10} />
    <StickyNote x={92} y={74} fill="#ff8fb8" rotate={7} />
    <StickyNote x={50} y={124} fill="#ffdf45" rotate={-2} width={164} height={124} />
    <Padlock x={216} y={78} />
    <Critter kind="croc" x={148} y={218} size={112} />
    <Pencil x={30} y={292} rotate={-14} length={112} />
  </>;
}

function VoteBeat() {
  return <>
    <Crown x={196} y={72} width={84} />
    <rect x="30" y="72" width="212" height="80" rx="18" fill="#ff3d8b" stroke={INK} strokeWidth="6" />
    <path d="M56 101h140M56 125h96" stroke="#ffffff" strokeWidth="9" strokeLinecap="round" opacity=".9" />
    <path d="M64 186v-22M134 186v-22M204 186v-22M54 172l10-11 10 11M124 172l10-11 10 11M194 172l10-11 10 11" fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    <Critter kind="monkey" x={24} y={178} size={80} />
    <Critter kind="koala" x={96} y={180} size={80} />
    <Critter kind="pig" x={170} y={178} size={80} />
    <Pill x={134} y={296} width={140} fill="#20b26b" text="+500" rotate={-3} />
  </>;
}

function InviteBeat() {
  return <>
    <g transform="rotate(-4 134 104)">
      <rect x="32" y="56" width="204" height="96" rx="20" fill="#ffdf45" stroke={INK} strokeWidth="6" />
      <Label x={134} y={122} size="56" fill={INK} spacing="4">FISH</Label>
    </g>
    <path d="M64 176q-12 30 0 44M134 170v36M204 176q12 30 0 44" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" strokeDasharray="2 12" />
    <Critter kind="koala" x={12} y={214} size={84} />
    <Critter kind="chicken" x={92} y={206} size={84} />
    <Critter kind="pig" x={172} y={214} size={84} />
  </>;
}

function ChooseGameBeat() {
  return <>
    <g transform="rotate(-6 84 124)">
      <rect x="22" y="54" width="112" height="140" rx="18" fill="#7c3aed" stroke={INK} strokeWidth="6" />
      <Label x={78} y={152} size="92" fill="#ffffff">?</Label>
      <circle cx="126" cy="60" r="22" fill="#20b26b" stroke={INK} strokeWidth="5" />
      <Check x={126} y={62} size={0.8} />
    </g>
    <g transform="rotate(5 188 124)">
      <rect x="140" y="58" width="104" height="134" rx="18" fill="#ff8a00" stroke={INK} strokeWidth="6" opacity=".92" />
      {[[172, 110], [212, 110], [192, 150]].map(([cx, cy]) => <g key={cx + "-" + cy}>
        <circle cx={cx} cy={cy} r="18" fill="#ffffff" stroke={INK} strokeWidth="4" />
        <circle cx={cx - 6} cy={cy - 3} r="3" fill={INK} /><circle cx={cx + 6} cy={cy - 3} r="3" fill={INK} />
        <path d={`M${cx - 7} ${cy + 5}q7 7 14 0`} fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      </g>)}
    </g>
    <Toggle x={134} y={262} />
  </>;
}

function RunRoomBeat() {
  return <>
    <Crown x={134} y={50} width={72} />
    <Critter kind="monkey" x={74} y={40} size={120} />
    <RoundButton x={78} y={236} r={44} fill="#ffdf45">
      <path d="M-11-16v32M11-16v32" stroke={INK} strokeWidth="10" strokeLinecap="round" />
    </RoundButton>
    <RoundButton x={190} y={236} r={44} fill="#ff8fb8">
      <path d="M-16-16L6 0-16 16Z" fill={INK} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
      <path d="M14-16v32" stroke={INK} strokeWidth="8" strokeLinecap="round" />
    </RoundButton>
    <Sparkle x={36} y={120} fill="#ffdf45" /><Sparkle x={228} y={96} size={0.8} fill="#8ff0bc" />
  </>;
}

function OverviewTutorialArtwork({ label }) {
  return <Scene label={label} variant="overview" colours={["#32155e", "#246bfe", "#00a8c7"]}>
    <Beats><JoinBeat /><MakeTogetherBeat /><GloryBeat /></Beats>
  </Scene>;
}

function QuizTutorialArtwork({ label }) {
  return <Scene label={label} variant="quiz" colours={["#073b59", "#246bfe", "#7c3aed"]}>
    <Beats><WriteQuestionBeat /><RaceBeat /><GahookFriendBeat /></Beats>
  </Scene>;
}

function HerdTutorialArtwork({ label }) {
  return <Scene label={label} variant="herd" colours={["#4a1d73", "#ff3d8b", "#ff8a00"]}>
    <Beats><AskBeat /><SecretWriteBeat /><VoteBeat /></Beats>
  </Scene>;
}

function HostTutorialArtwork({ label }) {
  return <Scene label={label} variant="host" colours={["#4a2c00", "#ff8a00", "#ff3d8b"]}>
    <Beats><InviteBeat /><ChooseGameBeat /><RunRoomBeat /></Beats>
  </Scene>;
}

// ---------------------------------------------------------------------------
// Majority Rulz keeps its original illustration only until its tutorial tab
// is removed (U7, later in the 2026-09-25 update); it was deliberately not
// redrawn. Delete this block together with the tab.

function LegacyArtworkFrame({ label, variant, colours, children }) {
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

function LegacyFlowArrow({ x }) {
  return <g transform={`translate(${x} 184)`}>
    <path d="M0 0h48" fill="none" stroke="#111214" strokeWidth="9" strokeLinecap="round" />
    <path d="M36-15L55 0 36 15" fill="none" stroke="#111214" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
  </g>;
}

function MajorityTutorialArtwork({ label }) {
  return <LegacyArtworkFrame label={label} variant="majority" colours={["#075d3c", "#00a8c7", "#246bfe"]}>
    <g transform="translate(42 55)">
      <rect width="230" height="270" rx="24" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <rect x="18" y="16" width="90" height="30" rx="15" fill="#ffdf45" /><text x="63" y="37" textAnchor="middle" fill="#111214" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">1 · ASK</text>
      <rect x="22" y="65" width="186" height="105" rx="14" fill="#ffffff" stroke="#8baabd" strokeWidth="3" />
      <text x="115" y="91" textAnchor="middle" fill="#087054" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">THE WORST THING</text><text x="115" y="111" textAnchor="middle" fill="#087054" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">TO HEAR FROM</text><text x="115" y="131" textAnchor="middle" fill="#087054" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">YOUR GPS IS...</text>
      <rect x="43" y="190" width="144" height="38" rx="19" fill="#7c3aed" /><text x="115" y="214" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="1000" fontFamily="system-ui, sans-serif">✦ OPINION IDEA</text>
      <text x="115" y="254" textAnchor="middle" fill="#667085" fontSize="11" fontWeight="900" fontFamily="system-ui, sans-serif">ASK THE ROOM</text>
    </g>
    <LegacyFlowArrow x={282} />
    <g transform="translate(335 55)">
      <rect width="230" height="270" rx="24" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <rect x="18" y="16" width="120" height="30" rx="15" fill="#8ff0bc" /><text x="78" y="37" textAnchor="middle" fill="#063352" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">2 · PREDICT</text>
      <g transform="translate(22 65)"><rect width="186" height="48" rx="12" fill="#eaf2ff" stroke="#246bfe" strokeWidth="3" /><text x="93" y="29" textAnchor="middle" fill="#063352" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">WET SOCKS</text><rect y="61" width="186" height="48" rx="12" fill="#fff2c5" stroke="#f2c230" strokeWidth="3" /><text x="93" y="90" textAnchor="middle" fill="#063352" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">SLOW WI-FI</text><rect y="122" width="186" height="48" rx="12" fill="#fce8f1" stroke="#ff3d8b" strokeWidth="3" /><text x="93" y="151" textAnchor="middle" fill="#063352" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">LOW BATTERY</text></g>
      <path d="M52 251h126" stroke="#8baabd" strokeWidth="3" strokeDasharray="6 6" /><text x="115" y="242" textAnchor="middle" fill="#667085" fontSize="11" fontWeight="1000" fontFamily="system-ui, sans-serif">MARK YOUR GUESS</text>
    </g>
    <LegacyFlowArrow x={575} />
    <g transform="translate(628 55)">
      <rect width="230" height="270" rx="24" fill="#f8fbff" stroke="#111214" strokeWidth="5" />
      <rect x="18" y="16" width="124" height="30" rx="15" fill="#ff8fb8" /><text x="80" y="37" textAnchor="middle" fill="#5b1531" fontSize="15" fontWeight="1000" fontFamily="system-ui, sans-serif">3 · CHOOSE</text>
      <g transform="translate(25 64)"><rect x="42" width="138" height="58" rx="12" fill="#ffdf45" stroke="#111214" strokeWidth="4" /><circle cx="21" cy="29" r="19" fill="#ffdf45" stroke="#111214" strokeWidth="3" /><text x="21" y="36" textAnchor="middle" fontSize="22" fontWeight="1000" fontFamily="system-ui, sans-serif">★</text><text x="111" y="35" textAnchor="middle" fill="#111214" fontSize="12" fontWeight="1000" fontFamily="system-ui, sans-serif">MY FAVOURITE</text><rect x="42" y="72" width="138" height="42" rx="12" fill="#e7eef5" stroke="#8baabd" strokeWidth="3" /><rect x="42" y="126" width="138" height="42" rx="12" fill="#e7eef5" stroke="#8baabd" strokeWidth="3" /></g>
      <rect x="45" y="239" width="140" height="30" rx="15" fill="#20b26b" /><text x="115" y="260" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="1000" fontFamily="system-ui, sans-serif">UP TO +1000</text>
    </g>
  </LegacyArtworkFrame>;
}

export function TutorialArtwork({ mode = "quiz", label }) {
  if (mode === "overview") return <OverviewTutorialArtwork label={label} />;
  if (mode === "host") return <HostTutorialArtwork label={label} />;
  if (mode === "majority") return <MajorityTutorialArtwork label={label} />;
  if (mode === "herd") return <HerdTutorialArtwork label={label} />;
  return <QuizTutorialArtwork label={label} />;
}

export default TutorialArtwork;
