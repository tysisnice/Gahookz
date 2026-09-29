// A small number picker in the site's own style, used for the Custom game
// length (Quiz questions per player, Herd rounds).
//
// It replaced a bare `<input type="number">`, which rendered as a white box
// with browser spin arrows in the middle of a dark, rounded, gradient panel,
// and on a phone opened a numeric keyboard to change one digit.
//
// Three ways to change the value, all ending in the same `onChange`:
//
//   - swipe the strip of numbers; it snaps, and the number that settles under
//     the highlighted lens is committed once the scroll stops (one request per
//     gesture, not one per number the strip passes);
//   - tap a number, or the - / + buttons either side;
//   - focus the wheel and use the arrow keys, Page Up/Down (5 at a time),
//     Home and End.
//
// The wheel never owns the value. It shows `value` and asks for a new one;
// the parent decides (optimistically, with rollback on a refused request),
// and the wheel re-centres on whatever comes back. That keeps the server
// authoritative: a clamped or rejected setting simply scrolls back.
//
// Accessibility: the wheel itself is the `role="spinbutton"` with
// aria-valuenow/min/max/text, so a screen reader hears one control, not twenty
// numbers. The numbers in the strip are presentation (aria-hidden) and the
// - / + buttons are pointer shortcuts kept out of the tab order, which is the
// usual shape of a spinbutton.

import React, { useEffect, useRef, useState } from "react";

const SETTLE_MS = 140;

function clampTo(value, min, max) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function scrollBehaviour() {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth";
  } catch (_error) {
    return "auto";
  }
}

/**
 * @param {object} props
 * @param {number} props.value     the current, authoritative value
 * @param {number} props.min
 * @param {number} props.max
 * @param {(next: number) => void} props.onChange  asked for a new value
 * @param {string} props.label     accessible name, e.g. "Rounds"
 * @param {string} [props.unit]    singular unit for aria-valuetext, e.g. "round"
 * @param {string} [props.unitPlural]
 * @param {boolean} [props.disabled]
 * @param {string} [props.className]
 * @param {string} [props.labelledBy]  id of a visible label, used instead of `label`
 */
export function NumberWheel({ value, min = 1, max = 10, onChange, label = "", unit = "", unitPlural = "", disabled = false, className = "", labelledBy = "" }) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  const current = clampTo(value, low, high);
  const numbers = [];
  for (let number = low; number <= high; number += 1) numbers.push(number);

  // The number under the lens while the strip is moving; equal to `current`
  // at rest.
  const [lensValue, setLensValue] = useState(current);
  const stripRef = useRef(null);
  const settleTimerRef = useRef(0);
  const verifyTimerRef = useRef(0);
  const touchingRef = useRef(false);
  const userScrollRef = useRef(false);
  const mountedRef = useRef(false);
  const currentRef = useRef(current);
  currentRef.current = current;

  const cellFor = (number) => stripRef.current?.querySelector(`[data-wheel-value="${number}"]`) || null;

  const centreOn = (number, behavior = "auto") => {
    const strip = stripRef.current;
    const cell = cellFor(number);
    if (!strip || !cell) return;
    const left = cell.offsetLeft - (strip.clientWidth - cell.offsetWidth) / 2;
    if (Math.abs(strip.scrollLeft - left) < 1) return;
    if (typeof strip.scrollTo === "function") strip.scrollTo({ left, behavior });
    else strip.scrollLeft = left;
  };

  const nearestToCentre = () => {
    const strip = stripRef.current;
    if (!strip) return currentRef.current;
    const middle = strip.scrollLeft + strip.clientWidth / 2;
    let best = currentRef.current;
    let bestDistance = Infinity;
    for (const cell of strip.querySelectorAll("[data-wheel-value]")) {
      const distance = Math.abs(cell.offsetLeft + cell.offsetWidth / 2 - middle);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = Number(cell.getAttribute("data-wheel-value"));
      }
    }
    return best;
  };

  const request = (next) => {
    const wanted = clampTo(next, low, high);
    if (disabled || wanted === currentRef.current) {
      // Nothing to ask for, but a swipe that ended on the same number may
      // still be resting off-centre.
      centreOn(currentRef.current, scrollBehaviour());
      return;
    }
    setLensValue(wanted);
    onChange?.(wanted);
    // The parent normally adopts the value at once (optimistically) and puts
    // it back if the server refuses it, and the effect below follows either.
    // If it never adopts it at all, return to what is really set rather than
    // leaving a number under the lens that is not the setting.
    clearTimeout(verifyTimerRef.current);
    verifyTimerRef.current = setTimeout(() => {
      if (touchingRef.current || userScrollRef.current || currentRef.current === wanted) return;
      setLensValue(currentRef.current);
      centreOn(currentRef.current, scrollBehaviour());
    }, 1500);
  };

  // Follow the authoritative value. Skipped while a finger is on the strip so
  // an update arriving mid-swipe does not yank it away from the player.
  useEffect(() => {
    setLensValue(current);
    if (touchingRef.current || userScrollRef.current) return;
    centreOn(current, mountedRef.current ? scrollBehaviour() : "auto");
    mountedRef.current = true;
  }, [current, low, high]);

  // A rotation or a panel resize moves the centre line.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(() => centreOn(currentRef.current, "auto"));
    observer.observe(strip);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    clearTimeout(settleTimerRef.current);
    clearTimeout(verifyTimerRef.current);
  }, []);

  const settle = () => {
    clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      if (touchingRef.current) return;
      if (!userScrollRef.current) return;
      userScrollRef.current = false;
      request(nearestToCentre());
    }, SETTLE_MS);
  };

  const onScroll = () => {
    if (!userScrollRef.current) return;
    setLensValue(nearestToCentre());
    settle();
  };

  const beginUserScroll = () => {
    userScrollRef.current = true;
  };

  const onKeyDown = (event) => {
    const steps = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 };
    if (Object.prototype.hasOwnProperty.call(steps, event.key)) {
      event.preventDefault();
      request(currentRef.current + steps[event.key]);
    } else if (event.key === "Home") {
      event.preventDefault();
      request(low);
    } else if (event.key === "End") {
      event.preventDefault();
      request(high);
    }
  };

  const plural = unitPlural || (unit ? unit + "s" : "");
  const valueText = unit ? `${current} ${current === 1 ? unit : plural}` : String(current);

  return (
    <div className={["number-wheel", disabled ? "is-disabled" : "", className].filter(Boolean).join(" ")}>
      <button className="number-wheel__step" type="button" tabIndex={-1} aria-label={"Fewer " + (plural || label)} disabled={disabled || current <= low} onClick={() => request(current - 1)}>
        <span aria-hidden="true">−</span>
      </button>
      <div
        className="number-wheel__window"
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy || undefined}
        aria-valuenow={current}
        aria-valuemin={low}
        aria-valuemax={high}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}>
        <span className="number-wheel__lens" aria-hidden="true" />
        <div
          className="number-wheel__strip"
          ref={stripRef}
          aria-hidden="true"
          onScroll={onScroll}
          onTouchStart={() => {
            touchingRef.current = true;
            beginUserScroll();
          }}
          onTouchEnd={() => {
            touchingRef.current = false;
            settle();
          }}
          onTouchCancel={() => {
            touchingRef.current = false;
            settle();
          }}
          onWheel={(event) => {
            // Only a sideways trackpad swipe moves this strip; a vertical
            // wheel over it is the page scrolling past.
            if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
            beginUserScroll();
            settle();
          }}>
          {numbers.map((number) => {
            const distance = Math.abs(number - lensValue);
            return (
              <span
                className={"number-wheel__cell" + (distance === 0 ? " is-selected" : distance === 1 ? " is-near" : "")}
                data-wheel-value={number}
                key={number}
                onClick={() => request(number)}>
                {number}
              </span>);
          })}
        </div>
      </div>
      <button className="number-wheel__step" type="button" tabIndex={-1} aria-label={"More " + (plural || label)} disabled={disabled || current >= high} onClick={() => request(current + 1)}>
        <span aria-hidden="true">+</span>
      </button>
    </div>);
}
