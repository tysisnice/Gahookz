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
//
// `QuickMenu` (2026-09-25) is the shell of the host, player and join menus in
// the top bar: a dropdown on a wide screen, a modal sheet on a phone.

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useBackToClose, useScrollLock } from "./history.jsx";

const createPortal = (...args) => window.ReactDOM.createPortal(...args);

// The gap kept between a tip and the edge of the screen, and between a tip
// and its (i). Tyson's phone screenshot (25 Sep) showed a tip hanging off the
// left edge; every placement below is clamped to this margin.
const TIP_EDGE_MARGIN = 8;
const TIP_GAP = 8;

/**
 * Put a tip bubble next to its button, fully inside the viewport.
 *
 * The bubble is `position: fixed`, so a scrolling dialog body (Lobby rules)
 * cannot clip it, and it is placed from the button's on-screen rectangle
 * rather than from its parent. Above the button by default; below when there
 * is more room there; clamped left and right so it never leaves the screen.
 *
 * A transformed ancestor turns `fixed` into "relative to that ancestor", so
 * after placing the bubble we measure where it really landed and correct by
 * the difference. That keeps the maths in viewport coordinates whatever the
 * bubble happens to be nested in.
 */
export function placeTipBubble(bubble, anchor, align = "end") {
  if (!bubble || !anchor) return;
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = window.innerHeight;
  const target = anchor.getBoundingClientRect();
  bubble.style.left = "0px";
  bubble.style.top = "0px";
  const size = bubble.getBoundingClientRect();
  const width = Math.min(size.width, viewportWidth - TIP_EDGE_MARGIN * 2);
  const preferredLeft = align === "start" ? target.left - 6 : target.right + 6 - width;
  const left = Math.max(TIP_EDGE_MARGIN, Math.min(preferredLeft, viewportWidth - TIP_EDGE_MARGIN - width));
  const roomAbove = target.top - TIP_GAP - TIP_EDGE_MARGIN;
  const roomBelow = viewportHeight - target.bottom - TIP_GAP - TIP_EDGE_MARGIN;
  const below = size.height > roomAbove && roomBelow > roomAbove;
  let top = below ? target.bottom + TIP_GAP : target.top - TIP_GAP - size.height;
  top = Math.max(TIP_EDGE_MARGIN, Math.min(top, viewportHeight - TIP_EDGE_MARGIN - size.height));
  bubble.style.left = left + "px";
  bubble.style.top = top + "px";
  const landed = bubble.getBoundingClientRect();
  const driftX = left - landed.left;
  const driftY = top - landed.top;
  if (Math.abs(driftX) > 0.5 || Math.abs(driftY) > 0.5) {
    bubble.style.left = left + driftX + "px";
    bubble.style.top = top + driftY + "px";
  }
  bubble.dataset.side = below ? "below" : "above";
}

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
  const buttonRef = useRef(null);
  const bubbleRef = useRef(null);
  const show = open || pinned;

  // Placed before paint, so the bubble never flashes at its old spot. It
  // follows its button while anything scrolls (the page or a dialog body) and
  // when the screen is resized or rotated.
  useLayoutEffect(() => {
    if (!show) return undefined;
    const place = () => placeTipBubble(bubbleRef.current, buttonRef.current, align);
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [show, align]);

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

  return (
    <span
      className={show ? "info-tip is-open" : "info-tip"}
      ref={holderRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}>
      <button
        className="info-tip-button"
        ref={buttonRef}
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
      <span className={"info-tip-bubble is-" + align} id={bubbleId} role="note" hidden={!show} ref={bubbleRef}>
        {children}
      </span>
    </span>);

}

// When the room menus open as a sheet instead of a dropdown: phones, and short
// landscape windows where a dropdown hanging from the top bar would run off
// the bottom of the screen and under the floating chat button.
export const QUICK_MENU_SHEET_QUERY = "(max-width: 720px), (max-height: 560px)";

export function useMediaQuery(query) {
  const read = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const list = window.matchMedia(query);
    const sync = () => setMatches(list.matches);
    sync();
    if (list.addEventListener) list.addEventListener("change", sync);
    else list.addListener?.(sync);
    return () => {
      if (list.removeEventListener) list.removeEventListener("change", sync);
      else list.removeListener?.(sync);
    };
  }, [query]);
  return matches;
}

/**
 * The top-bar menu shell used by the host, player and join menus.
 *
 * Tyson (25 Sep): "On mobile, make this player menu appear as an overlay,
 * similar to how the lobby rules works", and "the menu should be over the
 * chat icon". On a phone the menu opens as a modal sheet over a backdrop, like
 * Lobby rules: the page behind stops scrolling, the sheet scrolls inside
 * itself, it has a close button, and Escape, a tap on the backdrop or the
 * browser Back button closes it and puts focus back on the menu button. On a
 * wide screen it stays the dropdown it always was, now also closed by Back
 * and Escape, and capped to the window height.
 *
 * `children` may be a function `({ close }) => ...`, so an action that moves
 * to another screen can close the menu first. The contents stay mounted while
 * the menu is closed (as they did inside <details>), so a dialog opened from
 * the menu -- Settings, the custom Gahook creator -- keeps its state.
 *
 * The trigger stays a <summary> inside a <details>, controlled by React, so
 * the existing styles (the phone hamburger) and tests keep their hooks.
 */
export function QuickMenu({ className = "host-quick-menu", label = "Menu", children }) {
  const [open, setOpen] = useState(false);
  const sheet = useMediaQuery(QUICK_MENU_SHEET_QUERY);
  const holderRef = useRef(null);
  const triggerRef = useRef(null);
  const sheetRef = useRef(null);
  const closeButtonRef = useRef(null);
  const focusTriggerRef = useRef(false);
  const titleId = useId();

  const close = useCallback((options) => {
    focusTriggerRef.current = options?.restoreFocus !== false;
    setOpen(false);
  }, []);
  const isTopmost = useBackToClose(open, () => close());
  useScrollLock(open && sheet);

  // Focus moves into the sheet when it opens and back to the menu button
  // when it closes, unless the menu closed because something else took over.
  useEffect(() => {
    if (open) {
      if (!sheet) return undefined;
      const frame = requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));
      return () => cancelAnimationFrame(frame);
    }
    if (focusTriggerRef.current) {
      focusTriggerRef.current = false;
      if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true });
    }
    return undefined;
  }, [open, sheet]);

  // Escape, the focus trap and (dropdown only) a tap outside. Each acts only
  // while this menu is the top overlay, so Escape in a dialog opened from the
  // menu closes that dialog and leaves the menu where it was.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.defaultPrevented || !isTopmost()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !sheet) return;
      const focusable = Array.from(sheetRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || []).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const inside = sheetRef.current?.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    const onPointerDown = (event) => {
      if (sheet || !isTopmost() || holderRef.current?.contains(event.target)) return;
      close({ restoreFocus: false });
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, sheet, close, isTopmost]);

  const content = typeof children === "function" ? children({ close }) : children;
  return (
    <details className={className} ref={holderRef} open={open && !sheet}>
      <summary
        ref={triggerRef}
        aria-haspopup={sheet ? "dialog" : undefined}
        onClick={(event) => {
          event.preventDefault();
          if (open) close();
          else setOpen(true);
        }}>
        {label}
      </summary>
      {sheet ? null : <div>{content}</div>}
      {sheet ? createPortal(
        <div className="quick-menu-backdrop" hidden={!open} onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}>
          <div className={className + " is-sheet"} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={sheetRef}>
            <div>
              <header className="quick-menu-sheet-header">
                <h2 id={titleId}>{label}</h2>
                <button className="quick-menu-close" type="button" ref={closeButtonRef} aria-label={"Close " + label.toLowerCase()} onClick={() => close()}>
                  <span aria-hidden="true">×</span>
                </button>
              </header>
              {content}
            </div>
          </div>
        </div>, document.body) : null}
    </details>);
}
