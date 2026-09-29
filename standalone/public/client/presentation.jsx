import React, { useEffect, useRef, useState } from "react";
import { getGahookForm } from "./gahook-forms.js";

const ULTIMATE_GAHOOK_MAX_STACK = 50;

export function useQuickCounter(target, durationMs = 200) {
  const initialValue = target > 1 ? 1 : target;
  const [displayValue, setDisplayValue] = useState(initialValue);
  const valueRef = useRef(initialValue);
  const rafRef = useRef(0);
  useEffect(() => {
    const startValue = valueRef.current;
    const delta = target - startValue;
    if (!delta) {
      return undefined;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    const startAt = performance.now();
    const tick = time => {
      const progress = Math.min(1, (time - startAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = Math.round(startValue + delta * eased);
      valueRef.current = nextValue;
      setDisplayValue(nextValue);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = 0;
        valueRef.current = target;
        setDisplayValue(target);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [target, durationMs]);
  return displayValue;
}

export function PokeJumpScare({
  poke,
  action = null
}) {
  const fromName = poke?.from || "Someone";
  const gahookForm = getGahookForm(poke?.gahookForm);
  const message = poke?.message || "";
  const isUltimate = poke?.kind === "ultimate";
  const isUltimateCongrats = poke?.kind === "ultimate-congrats";
  const isGetGot = poke?.kind === "get-got";
  const isCongrats = poke?.kind === "congrats" || isUltimateCongrats;
  const isBoo = poke?.kind === "boo";
  const isCounter = poke?.kind === "counter";
  const isDuelChallenge = poke?.kind === "duel-challenge";
  const customGahook = gahookForm.id === "custom" && Array.isArray(poke?.customGahook?.frames) && poke.customGahook.frames.length ? poke.customGahook : null;
  const isCustomForm = Boolean(customGahook) && !isGetGot && !isCongrats && !isBoo;
  const isPremiumForm = gahookForm.id !== "monkey" && gahookForm.id !== "custom" && !isGetGot && !isCongrats && !isBoo;
  const targetUltimateCount = Math.min(ULTIMATE_GAHOOK_MAX_STACK, Math.max(0, poke?.ultimateStack || 0));
  const ultimateCount = useQuickCounter(targetUltimateCount, 200);
  const extraMonkeys = isUltimate ? ultimateCount : 0;
  const extraCelebrations = isUltimateCongrats ? Math.min(18, ultimateCount) : 0;
  const scorePenalty = Math.max(0, poke?.scorePenalty || 0);
  const pointsStolen = Math.max(0, poke?.pointsStolen || 0);
  const bananaCount = isGetGot ? 24 : isBoo ? 18 : 10;
  const footerText = isGetGot ? (poke?.targetName ? poke.targetName + " GETS GOT" : "GET GOT") + (scorePenalty + pointsStolen ? " -" + (scorePenalty + pointsStolen) + " pts" : "") : isCounter ? "Fired back by " + fromName + (pointsStolen ? " - " + pointsStolen + " pts stolen" : "") : isDuelChallenge ? fromName + " wants a tap battle — pull 5 taps ahead to win" : isCongrats || isBoo ? "by " + fromName : message || "by " + fromName + (pointsStolen ? " - " + pointsStolen + " pts stolen" : "");
  const backgroundColor = normaliseCustomColor(customGahook?.backgroundColor, customGahook?.backgroundId);
  const effectId = normaliseCustomChoice(customGahook?.effectId, ["shake", "spin", "bounce", "zoom"], "bounce");
  return <div className={["poke-overlay", !isCongrats && !isBoo ? "is-form-" + gahookForm.id : "", isPremiumForm ? "is-premium-form" : "", isCustomForm ? "is-custom-form" : "", isUltimate ? "is-ultimate" : "", isUltimateCongrats ? "is-ultimate-congrats" : "", isGetGot ? "is-get-got" : "", isCongrats ? "is-congrats" : "", isBoo ? "is-boo" : "", isCounter ? "is-counter" : "", isDuelChallenge ? "is-duel-challenge" : ""].filter(Boolean).join(" ")} style={isCustomForm ? { "--custom-gahook-color": backgroundColor } : undefined} role="alert" aria-live="assertive">
      {isPremiumForm ? <PremiumFormEffects formId={gahookForm.id} /> : null}
      <div className="poke-scare-card">
        {isGetGot || isBoo ? <div className="banana-burst">{Array.from({
          length: bananaCount
        }, (_item, index) => <BananaIcon key={index} index={index} />)}</div> : null}
        <div className={isUltimate ? "monkey-stack" : isCongrats ? "congrats-stack" : ""}>
          {isCongrats ? <><BirdIcon /><ThumbsUpIcon /></> : <GahookOverlayVisual form={gahookForm} customGahook={customGahook} effectId={effectId} />}
          {isUltimate ? <><GahookOverlayVisual form={gahookForm} customGahook={customGahook} effectId={effectId} small /><GahookOverlayVisual form={gahookForm} customGahook={customGahook} effectId={effectId} small /></> : null}
          {extraMonkeys ? <div className="ultimate-extra-monkeys">{Array.from({
            length: extraMonkeys
          }, (_item, index) => <GahookOverlayVisual form={gahookForm} customGahook={customGahook} effectId={effectId} small key={index} />)}</div> : null}
          {extraCelebrations ? <div className="ultimate-congrats-extra">{Array.from({
            length: extraCelebrations
          }, (_item, index) => index % 2 ? <ThumbsUpIcon key={index} /> : <BirdIcon key={index} />)}</div> : null}
        </div>
        {isCounter ? <strong className="counter-rebound">BACK AT YA!</strong> : null}
        <h1>{isUltimateCongrats ? "ULTIMATE CONGRATULATIONS" : isCongrats ? "CONGRATULATIONS" : isBoo ? "BOO" : isGetGot ? "GET GOT" : isUltimate ? "ULTIMATE GAHOOK" : isCounter ? "COUNTER GAHOOK!" : isDuelChallenge ? "GAHOOK ARENA?" : "GAHOOK"}</h1>
        {isUltimate || isUltimateCongrats ? <strong className="ultimate-stack-count">{ultimateCount}/{ULTIMATE_GAHOOK_MAX_STACK}</strong> : null}
        <p>{footerText}</p>
        {action ? <button className={["poke-overlay-action", action.moving ? "is-moving" : ""].filter(Boolean).join(" ")} type="button" disabled={Boolean(action.disabled)} onClick={action.onClick}>{action.label}</button> : null}
      </div>
    </div>;
}

function normaliseCustomChoice(value, allowed, fallback) {
  const choice = String(value || "").toLowerCase();
  return allowed.includes(choice) ? choice : fallback;
}

function normaliseCustomColor(value, legacyId = "") {
  const legacyColors = { burst: "#ff3d8b", checker: "#7c3aed", void: "#063352", confetti: "#00bfd8" };
  const candidate = String(value || legacyColors[legacyId] || "#ff3d8b").toLowerCase();
  return /^#[0-9a-f]{6}$/.test(candidate) ? candidate : "#ff3d8b";
}

export function GahookOverlayVisual({ form, customGahook, effectId = "bounce", small = false }) {
  if (form?.id === "custom" && customGahook?.frames?.length) {
    return <CustomGahookVisual customGahook={customGahook} effectId={effectId} small={small} />;
  }
  return <GahookFormVisual form={form} small={small} />;
}

export function CustomGahookVisual({ customGahook, effectId = "bounce", small = false }) {
  const frames = Array.isArray(customGahook?.frames) ? customGahook.frames.filter(Boolean).slice(0, 3) : [];
  if (!frames.length) return <GahookFormVisual form={{ id: "monkey" }} small={small} />;
  const safeEffect = normaliseCustomChoice(effectId || customGahook?.effectId, ["shake", "spin", "bounce", "zoom"], "bounce");
  return <span className={["custom-gahook-visual", "is-effect-" + safeEffect, small ? "is-small" : "", frames.length > 1 ? `has-${frames.length}-frames` : ""].filter(Boolean).join(" ")} role="img" aria-label="Custom Gahook">
    {frames.map((frame, index) => <img
      className="custom-gahook-frame"
      src={frame}
      alt=""
      aria-hidden="true"
      style={{ "--custom-frame-duration": `${frames.length * 240}ms`, "--custom-frame-delay": `${index * -240}ms` }}
      key={`${frame}-${index}`}
    />)}
  </span>;
}

function PremiumFormEffects({ formId }) {
  return <div className={"premium-form-effects premium-effects-" + formId} aria-hidden="true">
    {Array.from({ length: 15 }, (_item, index) => <span key={index}><i /></span>)}
  </div>;
}

export function GahookFormVisual({ form, small = false }) {
  const id = form?.id || "monkey";
  if (id === "gorilla") return <GorillaFace small={small} />;
  if (id === "pig") return <PigFace small={small} />;
  if (id === "koala") return <KoalaFace small={small} />;
  if (id === "croc") return <CrocFace small={small} />;
  if (id === "chicken") return <ChickenFace small={small} />;
  return <MonkeyFace small={small} />;
}

function animalClass(small) {
  return small ? "poke-animal is-small" : "poke-animal";
}

export function GorillaFace({ small = false }) {
  return <svg className={animalClass(small)} viewBox="0 0 220 220" aria-label="Rage Gorilla Gahook" role="img">
    <circle cx="45" cy="91" r="34" fill="#45454d" stroke="#09090b" strokeWidth="8" />
    <circle cx="175" cy="91" r="34" fill="#45454d" stroke="#09090b" strokeWidth="8" />
    <ellipse cx="110" cy="112" rx="78" ry="91" fill="#27272c" stroke="#09090b" strokeWidth="9" />
    <path d="M58 57Q82 37 109 53M162 57Q138 37 111 53" fill="none" stroke="#55555e" strokeWidth="10" strokeLinecap="round" />
    <path d="M72 43l-8-15M91 38l-3-18M148 43l8-15M129 38l3-18" stroke="#8b1720" strokeWidth="6" strokeLinecap="round" />
    <path d="M58 179Q72 205 110 205t52-26" fill="#3f3f46" stroke="#09090b" strokeWidth="8" />
    <path d="M75 188l18-15 17 17 17-17 18 15" fill="none" stroke="#777780" strokeWidth="6" strokeLinecap="round" />
    <g className="animal-pose animal-pose-a">
      <path d="M54 87Q79 54 104 82M166 87Q141 54 116 82" fill="none" stroke="#d51f2f" strokeWidth="12" strokeLinecap="round" />
      <ellipse cx="82" cy="102" rx="23" ry="26" fill="#f8fafc" /><ellipse cx="138" cy="102" rx="23" ry="26" fill="#f8fafc" />
      <circle cx="89" cy="108" r="10" fill="#09090b" /><circle cx="131" cy="108" r="10" fill="#09090b" />
      <ellipse cx="110" cy="145" rx="55" ry="42" fill="#8b8b92" stroke="#09090b" strokeWidth="7" />
      <ellipse cx="91" cy="137" rx="8" ry="6" fill="#09090b" /><ellipse cx="129" cy="137" rx="8" ry="6" fill="#09090b" />
      <path d="M73 158Q110 193 147 158Q110 146 73 158Z" fill="#8b1720" stroke="#09090b" strokeWidth="7" />
      <path d="M82 159h56" stroke="#ffffff" strokeWidth="8" strokeDasharray="12 4" />
      <circle cx="43" cy="174" r="25" fill="#4b4b54" stroke="#09090b" strokeWidth="7" /><circle cx="177" cy="174" r="25" fill="#4b4b54" stroke="#09090b" strokeWidth="7" />
    </g>
    <g className="animal-pose animal-pose-b">
      <path d="M52 92L101 70M168 92l-49-22" fill="none" stroke="#ff3347" strokeWidth="14" strokeLinecap="round" />
      <path d="M67 104q16-14 32 0M121 104q16-14 32 0" fill="none" stroke="#f8fafc" strokeWidth="10" strokeLinecap="round" />
      <ellipse cx="110" cy="144" rx="58" ry="45" fill="#9b9ba4" stroke="#09090b" strokeWidth="7" />
      <ellipse cx="91" cy="135" rx="8" ry="6" fill="#09090b" /><ellipse cx="129" cy="135" rx="8" ry="6" fill="#09090b" />
      <path d="M73 154Q110 207 147 154Z" fill="#44050b" stroke="#09090b" strokeWidth="7" />
      <path d="M81 157h58l-8 15H89z" fill="#ffffff" stroke="#09090b" strokeWidth="4" />
      <circle cx="42" cy="148" r="29" fill="#55555e" stroke="#09090b" strokeWidth="8" /><circle cx="178" cy="148" r="29" fill="#55555e" stroke="#09090b" strokeWidth="8" />
      <path d="M31 137l10-20 11 20M167 137l11-20 11 20" fill="none" stroke="#73737c" strokeWidth="6" strokeLinecap="round" />
      <path d="M57 38q-20-28-33 0 18-5 28 11M163 38q20-28 33 0-18-5-28 11" fill="#e5e7eb" stroke="#09090b" strokeWidth="5" />
    </g>
  </svg>;
}

export function KoalaFace({ small = false }) {
  return <svg className={animalClass(small)} viewBox="0 0 220 220" aria-label="Chonky Koala Gahook" role="img">
    <circle cx="47" cy="65" r="40" fill="#9297a1" stroke="#111214" strokeWidth="8" />
    <circle cx="173" cy="65" r="40" fill="#9297a1" stroke="#111214" strokeWidth="8" />
    <circle cx="47" cy="65" r="22" fill="#d8dbe1" /><circle cx="173" cy="65" r="22" fill="#d8dbe1" />
    <path d="M30 50l14 9-12 11M190 50l-14 9 12 11" fill="none" stroke="#f3f4f6" strokeWidth="5" strokeLinecap="round" />
    <ellipse cx="110" cy="124" rx="91" ry="88" fill="#c7cbd1" stroke="#111214" strokeWidth="9" />
    <path d="M42 144Q61 163 73 178M178 144Q159 163 147 178" fill="none" stroke="#eef0f4" strokeWidth="8" strokeLinecap="round" />
    <path d="M42 186q19-33 45-12-12 34-45 12z" fill="#20b26b" stroke="#111214" strokeWidth="6" />
    <path d="M50 183l33-8M64 171l5 11" stroke="#c7f9dc" strokeWidth="4" strokeLinecap="round" />
    <circle cx="63" cy="133" r="9" fill="#ff8fb8" opacity=".62" /><circle cx="157" cy="133" r="9" fill="#ff8fb8" opacity=".62" />
    <g className="animal-pose animal-pose-a">
      <circle cx="78" cy="102" r="25" fill="#ffffff" stroke="#111214" strokeWidth="5" /><circle cx="142" cy="102" r="25" fill="#ffffff" stroke="#111214" strokeWidth="5" />
      <circle cx="84" cy="107" r="8" fill="#111214" /><circle cx="136" cy="107" r="8" fill="#111214" />
      <ellipse cx="110" cy="132" rx="28" ry="35" fill="#22242a" stroke="#111214" strokeWidth="6" />
      <path d="M86 165Q110 189 134 165" fill="#ff8fb8" stroke="#111214" strokeWidth="7" strokeLinecap="round" />
    </g>
    <g className="animal-pose animal-pose-b">
      <path d="M56 105q22 18 44 0M120 105q22 18 44 0" fill="none" stroke="#111214" strokeWidth="8" strokeLinecap="round" />
      <ellipse cx="110" cy="132" rx="28" ry="35" fill="#22242a" stroke="#111214" strokeWidth="6" />
      <ellipse cx="111" cy="171" rx="15" ry="11" fill="#5b6380" stroke="#111214" strokeWidth="6" />
      <circle cx="150" cy="156" r="9" fill="#d8f7ff" stroke="#111214" strokeWidth="4" opacity=".9" />
      <circle cx="166" cy="142" r="14" fill="#d8f7ff" stroke="#111214" strokeWidth="4" opacity=".8" />
      <circle cx="186" cy="120" r="19" fill="#d8f7ff" stroke="#111214" strokeWidth="4" opacity=".7" />
    </g>
  </svg>;
}

export function CrocFace({ small = false }) {
  return <svg className={animalClass(small)} viewBox="0 0 220 220" aria-label="Cool Croc Gahook" role="img">
    <path d="M35 79Q47 35 91 45L110 25l19 20q44-9 56 34l-17 23q22 24 13 61-10 42-71 42s-61 0-71-42q-9-37 13-61z" fill="#4d9f2d" stroke="#07150b" strokeWidth="9" strokeLinejoin="round" />
    <path d="M45 77l-18-15M175 77l18-15M77 50l-9-22M143 50l9-22" stroke="#b8e65d" strokeWidth="7" strokeLinecap="round" />
    <path d="M52 93h52l7 34H60zM116 93h52l-8 34h-49z" fill="#0b0c0d" stroke="#07150b" strokeWidth="7" strokeLinejoin="round" />
    <path d="M59 100h37M123 100h35" stroke="#6ee7f9" strokeWidth="7" strokeLinecap="round" opacity=".72" />
    <path d="M104 101h12" stroke="#0b0c0d" strokeWidth="9" />
    <path d="M54 184q56 48 112 0" fill="none" stroke="#facc15" strokeWidth="10" strokeDasharray="7 6" strokeLinecap="round" />
    <path d="M156 39l5-14 5 14 14 5-14 5-5 14-5-14-14-5z" fill="#ffffff" stroke="#07150b" strokeWidth="4" />
    <g className="animal-pose animal-pose-a">
      <ellipse cx="110" cy="156" rx="68" ry="43" fill="#8bd14b" stroke="#07150b" strokeWidth="7" />
      <circle cx="83" cy="148" r="6" fill="#07150b" /><circle cx="137" cy="148" r="6" fill="#07150b" />
      <path d="M60 170Q110 200 160 170" fill="#ed5f69" stroke="#07150b" strokeWidth="7" />
      <path d="M73 172l9 13 9-10 10 17 10-15 10 15 10-17 9 10 8-13" fill="#ffffff" stroke="#07150b" strokeWidth="4" strokeLinejoin="round" />
    </g>
    <g className="animal-pose animal-pose-b">
      <ellipse cx="110" cy="151" rx="70" ry="48" fill="#9fe05c" stroke="#07150b" strokeWidth="7" />
      <circle cx="82" cy="143" r="6" fill="#07150b" /><circle cx="138" cy="143" r="6" fill="#07150b" />
      <path d="M55 158Q110 218 165 158Z" fill="#40131b" stroke="#07150b" strokeWidth="7" />
      <path d="M67 163l13 18 11-16 12 23 10-21 12 21 11-23 13 16 10-18" fill="#ffffff" stroke="#07150b" strokeWidth="4" strokeLinejoin="round" />
      <path d="M88 193q22-17 44 0" fill="#ed5f69" stroke="#07150b" strokeWidth="5" />
      <path d="M50 122q-22 17-5 34M170 122q22 17 5 34" fill="none" stroke="#7dd3fc" strokeWidth="8" strokeLinecap="round" />
    </g>
  </svg>;
}

// Sad Pig replaced Airhorn Capy on 2026-09-25 ("a fat crying pig that makes
// an annoying crying sound"). Pose A is the wail -- eyes screwed shut, tears
// running, mouth wide open -- and is the only pose drawn at mini size, so it
// has to carry the whole character on its own: pink, round, snout, blue
// tears. Pose B is the sob between wails: wet puppy eyes, a wobbling lip,
// tears spraying sideways and the snot bubble at full size.
export function PigFace({ small = false }) {
  return <svg className={animalClass(small)} viewBox="0 0 220 220" aria-label="Sad Pig Gahook" role="img">
    <path d="M44 82Q20 42 30 10Q74 16 96 52Z" fill="#ff86b5" stroke="#111214" strokeWidth="8" strokeLinejoin="round" />
    <path d="M176 82Q200 42 190 10Q146 16 124 52Z" fill="#ff86b5" stroke="#111214" strokeWidth="8" strokeLinejoin="round" />
    <path d="M50 64Q38 40 42 26Q68 32 80 50ZM170 64Q182 40 178 26Q152 32 140 50Z" fill="#e2548e" />
    <ellipse cx="110" cy="196" rx="58" ry="17" fill="#ff9dc3" stroke="#111214" strokeWidth="8" />
    <ellipse cx="110" cy="122" rx="102" ry="80" fill="#ff9dc3" stroke="#111214" strokeWidth="9" />
    <path d="M20 150q8 22 32 34M200 150q-8 22-32 34" fill="none" stroke="#e2548e" strokeWidth="6" strokeLinecap="round" />
    <ellipse cx="44" cy="142" rx="16" ry="11" fill="#ff5f9e" opacity=".55" /><ellipse cx="176" cy="142" rx="16" ry="11" fill="#ff5f9e" opacity=".55" />
    <g className="animal-pose animal-pose-a">
      <path d="M50 84L92 66M170 84l-42-18" fill="none" stroke="#111214" strokeWidth="9" strokeLinecap="round" />
      <path d="M56 100q19-18 38-2M126 98q19-16 38 2" fill="none" stroke="#111214" strokeWidth="9" strokeLinecap="round" />
      <path d="M62 104q-10 30-4 62M158 104q10 30 4 62" fill="none" stroke="#111214" strokeWidth="19" strokeLinecap="round" />
      <path d="M62 104q-10 30-4 62M158 104q10 30 4 62" fill="none" stroke="#6fd3ff" strokeWidth="10" strokeLinecap="round" />
      <path d="M52 104q-24-8-36 8M168 104q24-8 36 8" fill="none" stroke="#111214" strokeWidth="15" strokeLinecap="round" />
      <path d="M52 104q-24-8-36 8M168 104q24-8 36 8" fill="none" stroke="#6fd3ff" strokeWidth="7" strokeLinecap="round" />
      <ellipse cx="110" cy="128" rx="38" ry="26" fill="#ff78ac" stroke="#111214" strokeWidth="8" />
      <ellipse cx="97" cy="128" rx="7" ry="10" fill="#7c1d48" /><ellipse cx="123" cy="128" rx="7" ry="10" fill="#7c1d48" />
      <path d="M78 180Q110 150 142 180Q138 196 110 196Q82 196 78 180Z" fill="#5b0f2a" stroke="#111214" strokeWidth="7" strokeLinejoin="round" />
      <path d="M93 190Q110 180 127 190Q121 196 110 196Q99 196 93 190Z" fill="#ff5c8a" />
      <circle cx="136" cy="158" r="9" fill="#c8f1ff" stroke="#111214" strokeWidth="4" opacity=".92" />
    </g>
    <g className="animal-pose animal-pose-b">
      <path d="M46 78L92 58M174 78l-46-20" fill="none" stroke="#111214" strokeWidth="10" strokeLinecap="round" />
      <ellipse cx="76" cy="96" rx="19" ry="21" fill="#ffffff" stroke="#111214" strokeWidth="6" /><ellipse cx="144" cy="96" rx="19" ry="21" fill="#ffffff" stroke="#111214" strokeWidth="6" />
      <path d="M60 104q16 12 32 0M128 104q16 12 32 0" fill="#6fd3ff" stroke="#6fd3ff" strokeWidth="4" strokeLinejoin="round" />
      <circle cx="78" cy="90" r="10" fill="#111214" /><circle cx="142" cy="90" r="10" fill="#111214" />
      <circle cx="82" cy="86" r="4" fill="#ffffff" /><circle cx="146" cy="86" r="4" fill="#ffffff" />
      <path d="M58 94Q28 70 14 92M162 94q30-24 44-2" fill="none" stroke="#111214" strokeWidth="17" strokeLinecap="round" />
      <path d="M58 94Q28 70 14 92M162 94q30-24 44-2" fill="none" stroke="#6fd3ff" strokeWidth="9" strokeLinecap="round" />
      <circle cx="16" cy="114" r="8" fill="#6fd3ff" stroke="#111214" strokeWidth="4" /><circle cx="204" cy="114" r="8" fill="#6fd3ff" stroke="#111214" strokeWidth="4" />
      <ellipse cx="110" cy="132" rx="40" ry="27" fill="#ff78ac" stroke="#111214" strokeWidth="8" />
      <ellipse cx="96" cy="132" rx="7" ry="10" fill="#7c1d48" /><ellipse cx="124" cy="132" rx="7" ry="10" fill="#7c1d48" />
      <path d="M84 180q9-9 18 0t18 0t18 0" fill="none" stroke="#111214" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="146" cy="162" r="20" fill="#c8f1ff" stroke="#111214" strokeWidth="4" opacity=".9" />
      <path d="M138 152q5-5 11-3" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
    </g>
  </svg>;
}

export function ChickenFace({ small = false }) {
  return <svg className={animalClass(small)} viewBox="0 0 220 220" aria-label="Cymbal Chicken Gahook" role="img">
    <path d="M83 45q-5-30 18-19 10-24 25-1 25-8 13 24" fill="#ef4444" stroke="#111214" strokeWidth="7" strokeLinejoin="round" />
    <circle cx="110" cy="119" r="76" fill="#fff7df" stroke="#111214" strokeWidth="9" />
    <path d="M74 181l36-18 36 18-36 20z" fill="#246bfe" stroke="#111214" strokeWidth="7" strokeLinejoin="round" />
    <path d="M58 42l-8-17M163 42l8-17" stroke="#facc15" strokeWidth="8" strokeLinecap="round" />
    <g className="animal-pose animal-pose-a">
      <circle cx="79" cy="99" r="26" fill="#ffffff" stroke="#111214" strokeWidth="5" /><circle cx="141" cy="99" r="26" fill="#ffffff" stroke="#111214" strokeWidth="5" />
      <circle cx="86" cy="104" r="8" fill="#111214" /><circle cx="134" cy="104" r="8" fill="#111214" />
      <path d="M91 124h39l-20 30z" fill="#ff8a00" stroke="#111214" strokeWidth="7" strokeLinejoin="round" />
      <path d="M91 161q19 25 38 0" fill="#ef4444" stroke="#111214" strokeWidth="6" />
      <circle cx="30" cy="132" r="29" fill="#facc15" stroke="#111214" strokeWidth="7" /><circle cx="190" cy="132" r="29" fill="#facc15" stroke="#111214" strokeWidth="7" />
      <circle cx="30" cy="132" r="7" fill="#8a5b0b" /><circle cx="190" cy="132" r="7" fill="#8a5b0b" />
      <path d="M48 132h22M150 132h22" stroke="#111214" strokeWidth="8" strokeLinecap="round" />
    </g>
    <g className="animal-pose animal-pose-b">
      <path d="M56 102q23 18 46 0M118 102q23 18 46 0" fill="none" stroke="#111214" strokeWidth="8" strokeLinecap="round" />
      <path d="M85 124h50l-25 36z" fill="#ff8a00" stroke="#111214" strokeWidth="7" strokeLinejoin="round" />
      <path d="M92 163q18 29 36 0" fill="#ef4444" stroke="#111214" strokeWidth="6" />
      <ellipse cx="87" cy="133" rx="30" ry="32" fill="#facc15" stroke="#111214" strokeWidth="7" /><ellipse cx="133" cy="133" rx="30" ry="32" fill="#facc15" stroke="#111214" strokeWidth="7" />
      <circle cx="87" cy="133" r="7" fill="#8a5b0b" /><circle cx="133" cy="133" r="7" fill="#8a5b0b" />
      <path d="M43 133h19M158 133h19" stroke="#111214" strokeWidth="8" strokeLinecap="round" />
      <path d="M110 91v-20M95 97L81 83M125 97l14-14" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" />
      <path d="M27 93L12 76M193 93l15-17M28 169L9 182M192 169l19 13" stroke="#6ee7f9" strokeWidth="7" strokeLinecap="round" />
    </g>
  </svg>;
}

export function BirdIcon() {
  return <svg className="congrats-bird" viewBox="0 0 220 220" aria-label="Congratulations bird" role="img">
      <path d="M40 122c8-45 44-76 92-66 39 8 60 39 55 77-5 41-39 67-84 61-43-6-70-31-63-72z" fill="#20b26b" stroke="#111214" strokeWidth="8" />
      <path d="M92 74c26-27 67-26 93 1-30 3-53 16-70 40z" fill="#8ff0bc" stroke="#111214" strokeWidth="7" strokeLinejoin="round" />
      <path d="M170 106l34 18-35 17" fill="#f2c230" stroke="#111214" strokeWidth="7" strokeLinejoin="round" />
      <path d="M133 101q10 9 20 0" fill="none" stroke="#111214" strokeWidth="7" strokeLinecap="round" />
      <circle cx="132" cy="122" r="8" fill="#ff8fb8" opacity="0.9" />
      <path d="M61 139q38 43 91 4" fill="none" stroke="#111214" strokeWidth="8" strokeLinecap="round" />
      <path d="M94 148q17 18 36-2" fill="#ffffff" stroke="#111214" strokeWidth="5" strokeLinejoin="round" />
      <path d="M67 58c13-17 32-24 58-21" fill="none" stroke="#ff3d8b" strokeWidth="9" strokeLinecap="round" />
      <path d="M48 55l8-11 8 11 12-5-5 14H52z" fill="#ffdf45" stroke="#111214" strokeWidth="5" strokeLinejoin="round" />
      <path d="M186 54c7-12 24-4 17 9l-17 17-17-17c-7-13 10-21 17-9z" fill="#ff3d8b" stroke="#111214" strokeWidth="5" />
    </svg>;
}

export function ThumbsUpIcon() {
  return <svg className="thumbs-up-icon" viewBox="0 0 140 140" aria-hidden="true">
      <path d="M46 58h-23v58h23z" fill="#246bfe" stroke="#111214" strokeWidth="7" strokeLinejoin="round" />
      <path d="M47 61c20-12 23-33 25-44 1-8 12-7 16-1 5 8 2 22-2 33h23c12 0 18 10 14 21l-11 33c-3 9-10 13-20 13H47z" fill="#ffe1a8" stroke="#111214" strokeWidth="7" strokeLinejoin="round" />
      <path d="M80 71h35M76 91h32" stroke="#111214" strokeWidth="6" strokeLinecap="round" />
    </svg>;
}

export function BananaIcon({
  index = 0
}) {
  return <svg className={"banana-icon banana-" + index} viewBox="0 0 120 120" aria-hidden="true">
      <path d="M34 13c30 15 46 46 33 88 29-12 43-42 31-75-6 45-29 72-68 79 11-18 15-37 11-58-3-14-8-25-16-32z" fill="#facc15" stroke="#111214" strokeWidth="7" strokeLinejoin="round" />
      <path d="M31 15c-8 0-13-5-14-12 12-2 18 2 18 11" fill="#854d0e" stroke="#111214" strokeWidth="6" strokeLinejoin="round" />
      <circle cx="55" cy="58" r="5" fill="#111214" />
      <circle cx="75" cy="54" r="5" fill="#111214" />
      <path d="M57 77q12 8 25-3" stroke="#111214" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M48 39c15 7 31 7 48 0" stroke="#fff7ad" strokeWidth="6" strokeLinecap="round" />
    </svg>;
}

export function MonkeyFace({
  small = false
}) {
  return <svg className={small ? "poke-monkey is-small" : "poke-monkey"} viewBox="0 0 220 220" aria-label="Monkey jump scare" role="img">
      <circle cx="65" cy="88" r="42" fill="#6b3b16" />
      <circle cx="155" cy="88" r="42" fill="#6b3b16" />
      <circle cx="110" cy="112" r="78" fill="#8a4f21" />
      <circle cx="80" cy="104" r="24" fill="#f6c78b" />
      <circle cx="140" cy="104" r="24" fill="#f6c78b" />
      <circle cx="82" cy="101" r="13" fill="#111214" />
      <circle cx="138" cy="101" r="13" fill="#111214" />
      <circle cx="86" cy="96" r="4" fill="#ffffff" />
      <circle cx="142" cy="96" r="4" fill="#ffffff" />
      <ellipse cx="110" cy="137" rx="45" ry="34" fill="#f6c78b" />
      <ellipse cx="98" cy="130" rx="8" ry="5" fill="#3a2114" />
      <ellipse cx="122" cy="130" rx="8" ry="5" fill="#3a2114" />
      <path d="M78 149 Q110 183 142 149" fill="none" stroke="#111214" strokeWidth="9" strokeLinecap="round" />
      <path d="M58 55 Q110 5 162 55" fill="none" stroke="#ffdf45" strokeWidth="12" strokeLinecap="round" />
    </svg>;
}
