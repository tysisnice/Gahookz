// Back button and overlay plumbing for every in-room screen (UI 1, ui-shell).
//
// The rules live in client/back-stack.ts; this file connects them to React
// and to the real window.history. Three exports:
//
//   useBackToClose(open, onClose)  one line in any overlay: while `open`,
//       browser/Android Back (and iOS swipe-back) calls onClose instead of
//       leaving the room. Closing it any other way consumes its history
//       entry, so history never grows. Returns isTopmost() for Escape and
//       outside-click handlers that must only act on the top overlay.
//
//   useScrollLock(active)  a reference-counted body scroll lock, so a dialog
//       opened from a sheet does not reset the page's scroll when either
//       closes.
//
//   <LeaveGameGuard active onLeave />  while `active` (the player or host is
//       in a room), Back with nothing open shows "Leave game? / Are you
//       sure?" with No and Yes. No stays and restores the history entry;
//       Yes calls onLeave (navigateTo("/"), exactly like Exit Lobby).

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createBackStack } from "./back-stack.ts";

const createPortal = (...args) => window.ReactDOM.createPortal(...args);

let sharedStack = null;

function backStack() {
  if (!sharedStack) {
    sharedStack = createBackStack({
      history: window.history,
      location: window.location,
      listen(onPopState) {
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
      },
      setTimeout: (handler, ms) => window.setTimeout(handler, ms),
      clearTimeout: (handle) => window.clearTimeout(handle),
      defer: (task) => (typeof queueMicrotask === "function" ? queueMicrotask(task) : Promise.resolve().then(task))
    });
  }
  return sharedStack;
}

/**
 * While `open`, the browser Back button closes this overlay.
 *
 * `onClose` may change between renders; the latest one is used. Returns a
 * stable `isTopmost()` so an Escape or outside-click handler can leave the
 * event to a dialog stacked above it.
 */
export function useBackToClose(open, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const idRef = useRef(0);

  useEffect(() => {
    if (!open) return undefined;
    const stack = backStack();
    const id = stack.open(() => onCloseRef.current?.());
    idRef.current = id;
    return () => {
      idRef.current = 0;
      stack.close(id);
    };
  }, [open]);

  return useCallback(() => idRef.current !== 0 && backStack().isTop(idRef.current), []);
}

let scrollLocks = 0;
let savedScroll = null;

function lockBodyScroll() {
  if (scrollLocks === 0) {
    const root = document.documentElement;
    const body = document.body;
    savedScroll = {
      scrollY: window.scrollY,
      rootOverflow: root.style.overflow,
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width
    };
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${savedScroll.scrollY}px`;
    body.style.width = "100%";
  }
  scrollLocks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLocks -= 1;
    if (scrollLocks > 0 || !savedScroll) return;
    const root = document.documentElement;
    const body = document.body;
    const previous = savedScroll;
    savedScroll = null;
    root.style.overflow = previous.rootOverflow;
    body.style.overflow = previous.overflow;
    body.style.position = previous.position;
    body.style.top = previous.top;
    body.style.width = previous.width;
    window.scrollTo(0, previous.scrollY);
  };
}

/** Freezes the page behind a sheet or dialog. Nested locks share one freeze. */
export function useScrollLock(active) {
  useEffect(() => (active ? lockBodyScroll() : undefined), [active]);
}

/**
 * Asks before Back leaves a room.
 *
 * Mounted once, by App, while a room is on screen. It renders nothing until
 * Back is pressed with no overlay open.
 */
export function LeaveGameGuard({ active, onLeave }) {
  const [asking, setAsking] = useState(false);
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;
  const noRef = useRef(null);
  const dialogRef = useRef(null);
  const titleId = useId();
  const textId = useId();

  useEffect(() => {
    if (!active) {
      setAsking(false);
      return undefined;
    }
    return backStack().guard(() => setAsking(true));
  }, [active]);

  useScrollLock(asking);

  const stay = useCallback(() => {
    setAsking(false);
    backStack().restoreGuard();
  }, []);

  const leave = () => {
    setAsking(false);
    onLeaveRef.current?.();
  };

  useEffect(() => {
    if (!asking) return undefined;
    // No is the safe answer, so it takes focus: Enter on an accidental Back
    // keeps the player in the room.
    const focusFrame = requestAnimationFrame(() => noRef.current?.focus());
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        stay();
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = dialogRef.current?.querySelectorAll("button") || [];
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [asking, stay]);

  if (!asking) return null;
  return createPortal(
    <div className="leave-game-backdrop" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget) stay();
    }}>
      <section className="leave-game-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={textId} ref={dialogRef}>
        <h2 id={titleId}>Leave game?</h2>
        <p id={textId}>Are you sure?</p>
        <div className="leave-game-actions">
          <button className="secondary-button leave-game-no" type="button" ref={noRef} onClick={stay}>No</button>
          <button className="primary-button leave-game-yes" type="button" onClick={leave}>Yes</button>
        </div>
      </section>
    </div>, document.body);
}
