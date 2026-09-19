// The two controls the menus ask for over and over, built once.
//
// Both were already in the app as one-off markup inside `MajorityScoringToggle`
// and as a scattering of inline explainer paragraphs. Every menu that wanted
// the same affordance re-implemented it slightly differently, so the checkbox
// rows in the host menu, the switch in Majority Rulez and the various "what
// does this do" links all behaved differently under a keyboard.
//
// Accessibility is the whole reason these are components rather than CSS.
// `ToggleSwitch` is a real `role="switch"` with `aria-checked`, so a screen
// reader announces the state rather than reading a decorative pill. `InfoTip`
// opens on hover *and* on focus and closes on Escape, because a hover-only
// tooltip is unreachable by keyboard and invisible on a touch screen — which
// is how most people meet this game.

import React, { useEffect, useId, useRef, useState } from "react";

/**
 * An on/off switch.
 *
 * Deliberately labelled twice: the visible pill reads On or Off, and
 * `aria-checked` carries the same state for assistive technology. The visible
 * text is what Tyson picked out of the Majority Rulez row and asked to reuse,
 * so it stays text rather than becoming a bare sliding knob.
 */
export function ToggleSwitch({ on = false, onChange, label = "", disabled = false, size = "regular" }) {
  const className = [
    "toggle-switch",
    size === "compact" ? "is-compact" : "",
    on ? "is-on" : ""].
    filter(Boolean).join(" ");
  return (
    <button
      className={className}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label || undefined}
      disabled={disabled}
      onClick={() => onChange?.(!on)}>
      <span className="toggle-switch-track" aria-hidden="true"><span className="toggle-switch-knob" /></span>
      <span className="toggle-switch-text">{on ? "On" : "Off"}</span>
    </button>);

}

/**
 * A small `(i)` that reveals an explanation.
 *
 * Replaces the inline explainer paragraphs, which took a whole line of a menu
 * to say something most people only need once. Pointer users get it on hover,
 * keyboard users on focus, touch users on tap — all three paths set the same
 * state, so there is no mode where the text cannot be reached.
 */
export function InfoTip({ label = "More information", children, align = "end" }) {
  const bubbleId = useId();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const holderRef = useRef(null);

  // A tip pinned open by a tap or a click has to be dismissable without
  // finding the same tiny target again.
  useEffect(() => {
    if (!pinned) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") {
        setPinned(false);
        setOpen(false);
      }
    };
    const onPointerDown = (event) => {
      if (!holderRef.current?.contains(event.target)) {
        setPinned(false);
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [pinned]);

  const show = open || pinned;
  return (
    <span
      className={show ? "info-tip is-open" : "info-tip"}
      ref={holderRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}>
      <button
        className="info-tip-button"
        type="button"
        aria-label={label}
        aria-expanded={show}
        aria-describedby={show ? bubbleId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => {
          setPinned((was) => !was);
          setOpen(true);
        }}>
        <span aria-hidden="true">i</span>
      </button>
      {/* Always in the tree, so a screen reader can reach the text even when
          the bubble is visually hidden. */}
      <span className={"info-tip-bubble is-" + align} id={bubbleId} role="note" hidden={!show}>
        {children}
      </span>
    </span>);

}
