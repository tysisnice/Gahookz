// The optional account panel, and the one shared copy of the account status.
//
// Guest play never needs any of this (CLAUDE.md rule 1). When a server offers
// a sign-in -- Google in production once it is provisioned, or the developer
// sign-in on a local server started with GAHOOKZ_DEV_LOGIN=1 -- the panel
// appears on the join screen and in the two lobbies. A signed-in player's look
// (name, picture, Gahook form) and custom Gahooks are saved by the server as
// they play; this module reads them back so the join screen on any device
// starts from the saved look. Every field stays editable for each room.
//
// app.jsx owns the join-screen storage format, so it registers how to apply a
// saved profile on this device (onAccountProfile) rather than this module
// writing app.jsx's localStorage keys itself.

import React, { useEffect, useId, useRef, useState } from "react";
import { getGahookForm } from "./gahook-forms.js";
import { useBackToClose, useScrollLock } from "./history.jsx";

// The import map has no "react-dom" entry; the bundle exposes it globally
// (the same approach as client/history.jsx).
const createPortal = (...args) => window.ReactDOM.createPortal(...args);

export const CAREER_STATS = [
  ["gamesPlayed", "Games"],
  ["wins", "Wins"],
  ["podiums", "Podiums"],
  ["totalScore", "Total points"],
  ["highScore", "Best game"],
  ["answersSubmitted", "Answers"],
  ["correctAnswers", "Quiz correct"],
  ["popularChoices", "Crowd picks"],
  ["questionsAuthored", "Questions"],
  ["herdVotesReceived", "Herd votes"],
  ["gahooksSent", "Gahooks sent"],
  ["gahooksReceived", "Gahooks got"]
];

// Marks which saved profile this device has already applied, so a reload does
// not re-apply an old profile over a change made here since.
const APPLIED_PROFILE_KEY = "gahookz-account-profile-applied";

let currentStatus = null;
let pendingLoad = null;
const statusListeners = new Set();
const profileListeners = new Set();

function publish(status) {
  currentStatus = status;
  statusListeners.forEach((listener) => listener(status));
  const profile = status?.signedIn ? status.account?.profile : null;
  if (!profile?.playerName) return;
  let applied = 0;
  try {
    applied = Number(localStorage.getItem(APPLIED_PROFILE_KEY)) || 0;
  } catch (_error) {}
  if (Number(profile.updatedAt) <= applied) return;
  try {
    localStorage.setItem(APPLIED_PROFILE_KEY, String(Number(profile.updatedAt) || 0));
  } catch (_error) {}
  profileListeners.forEach((listener) => listener(profile));
}

/** Fetch GET /api/account once (or again with force) and share the result. */
export function loadAccountStatus({ force = false } = {}) {
  if (pendingLoad && !force) return pendingLoad;
  pendingLoad = fetch("/api/account", { headers: { accept: "application/json" }, credentials: "same-origin" })
    .then((response) => response.json())
    .catch(() => ({ ok: false, signedIn: false, googleAvailable: false, devLoginAvailable: false }))
    .then((status) => {
      publish(status);
      return status;
    });
  return pendingLoad;
}

/** Register how this device applies a newly saved profile (app.jsx does). */
export function onAccountProfile(listener) {
  profileListeners.add(listener);
  return () => profileListeners.delete(listener);
}

export function useAccountStatus() {
  const [status, setStatus] = useState(currentStatus);
  useEffect(() => {
    statusListeners.add(setStatus);
    if (currentStatus) setStatus(currentStatus);
    else loadAccountStatus();
    return () => statusListeners.delete(setStatus);
  }, []);
  return status;
}

/**
 * Prefill an open join form when a saved profile arrives after it opened --
 * the status was still loading, or the player signed in from this screen.
 * A profile that was already known when the form opened reached it through
 * the device's saved join details instead, so it is not applied twice.
 */
export function useAccountJoinPrefill(enabled, apply) {
  const status = useAccountStatus();
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const atMountRef = useRef(currentStatus?.signedIn ? Number(currentStatus.account?.profile?.updatedAt) || 0 : 0);
  const appliedRef = useRef(false);
  const profile = status?.signedIn ? status.account?.profile : null;
  useEffect(() => {
    if (!enabled || appliedRef.current || !profile?.playerName) return;
    if ((Number(profile.updatedAt) || 0) === atMountRef.current) return;
    appliedRef.current = true;
    applyRef.current?.(profile);
  }, [enabled, profile?.updatedAt, profile?.playerName]);
}

function accountLoginHref() {
  const returnUrl = new URL(window.location.href);
  returnUrl.hash = "";
  returnUrl.searchParams.delete("account");
  return "/auth/google/start?returnTo=" + encodeURIComponent(returnUrl.pathname + returnUrl.search);
}

// The ?account= result from the Google redirect is read once per page load,
// whichever panel happens to mount first.
let redirectResultHandled = false;

/**
 * @param {object} props
 * @param {(path: string, payload?: object, options?: object) => Promise<any>} props.api  app.jsx's room API client
 * @param {(message: string) => void} props.notify   shows a toast
 * @param {(profile: object) => any} [props.renderAvatar]  draws a saved look's picture
 */
export function AccountPanelView({ api, notify, renderAvatar }) {
  const status = useAccountStatus();
  const [busy, setBusy] = useState(false);
  const [devName, setDevName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // After signing in from inside a room, attach the account to the seat this
  // device already holds. Outside a room, or before joining, there is no seat
  // and the next join links it instead.
  const linkCurrentSeat = async () => {
    const result = await api("/api/account/link", {}, { refresh: false });
    if (result?.ok && result.linked) window.gahookzRefreshSnapshot?.();
  };

  // Each screen that shows the panel refreshes the shared status once, so the
  // lobby shows the look the join just saved. (The very first mount is
  // already loading it through useAccountStatus.)
  useEffect(() => {
    if (currentStatus) loadAccountStatus({ force: true });
  }, []);

  useEffect(() => {
    if (redirectResultHandled) return;
    const accountMessage = new URL(window.location.href).searchParams.get("account");
    if (!accountMessage) return;
    redirectResultHandled = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("account");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    if (accountMessage === "connected") {
      notify("Google account connected. Your look, stats and custom Gahooks can now follow you.");
      loadAccountStatus({ force: true }).then(linkCurrentSeat);
    }
    if (accountMessage === "error") notify("Google sign-in did not finish. Guest play still works.");
  }, []);

  const signOut = async () => {
    setBusy(true);
    const result = await api("/api/account/logout", {}, { refresh: false });
    setBusy(false);
    if (!result.ok) {
      notify(result.error);
      return;
    }
    await loadAccountStatus({ force: true });
  };

  const devSignIn = async (event) => {
    event.preventDefault();
    if (!devName.trim() || busy) return;
    setBusy(true);
    const result = await api("/api/account/dev-login", { displayName: devName.trim() }, { refresh: false });
    if (!result.ok) {
      setBusy(false);
      notify(result.error || "Developer sign-in failed.");
      return;
    }
    await loadAccountStatus({ force: true });
    await linkCurrentSeat();
    setBusy(false);
    setDevName("");
  };

  const deleteAccount = async () => {
    setBusy(true);
    const result = await api("/api/account/delete", { confirm: "DELETE" }, { refresh: false });
    setBusy(false);
    setConfirmingDelete(false);
    if (!result.ok) {
      notify(result.error || "Your account could not be deleted. Try again.");
      return;
    }
    try {
      localStorage.removeItem(APPLIED_PROFILE_KEY);
    } catch (_error) {}
    notify("Your account and everything saved with it were deleted. You can keep playing as a guest.");
    await loadAccountStatus({ force: true });
    window.gahookzRefreshSnapshot?.();
  };

  if (!status) return null;

  if (status.signedIn && status.account) {
    const account = status.account;
    const profile = account.profile;
    const savedGahooks = Array.isArray(account.savedCustomGahooks) ? account.savedCustomGahooks : [];
    const slotCount = Math.max(1, Number(account.customGahookSlots) || 1);
    return (
      <section className="account-panel account-panel-signed-in" aria-label="Gahookz account">
        <header>
          <div className="account-avatar" aria-hidden="true">
            {profile && renderAvatar ? renderAvatar(profile) : <span>{account.displayName.slice(0, 1).toUpperCase()}</span>}
          </div>
          <div>
            <small>{account.developer ? "Developer account" : "Career profile"}</small>
            <h2>{account.displayName}</h2>
            <p>{slotCount} saved custom Gahook {slotCount === 1 ? "slot" : "slots"}</p>
          </div>
          <button type="button" onClick={signOut} disabled={busy}>Sign out</button>
        </header>
        <div className="account-saved">
          <div className="account-saved-look">
            <small>Saved player</small>
            {profile ?
              <p><strong>{profile.playerName}</strong> <span>with {getGahookForm(profile.gahookForm).label}</span></p> :
              <p>Join a room while signed in and your name, picture and Gahook are saved here.</p>}
          </div>
          <ul className="account-saved-gahooks" aria-label="Saved custom Gahooks">
            {Array.from({ length: slotCount }, (_value, slot) => {
              const saved = savedGahooks.find((item) => item.slot === slot);
              return (
                <li key={slot} className={saved ? "is-saved" : "is-empty"}>
                  {saved?.previewFrame ? <img src={saved.previewFrame} alt="" /> : <span aria-hidden="true">{slot + 1}</span>}
                  <em>{saved ? saved.name : "Empty slot"}</em>
                </li>);
            })}
          </ul>
        </div>
        <div className="career-stat-grid">
          {CAREER_STATS.map(([key, label]) => <div key={key}><strong>{Number(account.stats?.[key] || 0).toLocaleString()}</strong><span>{label}</span></div>)}
        </div>
        <footer className="account-panel-footer">
          <p className="account-privacy-note">Signing in saves your player look, career totals and custom Gahooks. A room still works for every guest.</p>
          <button className="account-delete-button" type="button" onClick={() => setConfirmingDelete(true)} disabled={busy}>Delete my account</button>
        </footer>
        {confirmingDelete ? <DeleteAccountDialog busy={busy} onCancel={() => setConfirmingDelete(false)} onConfirm={deleteAccount} /> : null}
      </section>);
  }

  // A server without a verified identity provider and durable storage cannot
  // keep the promise this panel makes, so it offers nothing rather than
  // advertising career stats that would not survive the next restart. The
  // developer sign-in is the deliberate exception: it exists to test exactly
  // that, and only on a local development server.
  if (!status.googleAvailable && !status.devLoginAvailable) return null;
  return (
    <section className="account-panel account-panel-guest" aria-label="Optional Gahookz account">
      <div><small>Optional player profile</small><h2>Keep your look, wins and custom Gahooks</h2><p>Guest play stays instant. Sign in only if you want them to follow you to other devices.</p></div>
      <div className="account-sign-in-options">
        {status.googleAvailable ? <a className="google-sign-in-button" href={accountLoginHref()}>Continue with Google</a> : null}
        {status.devLoginAvailable ?
          <form className="account-dev-login" onSubmit={devSignIn}>
            <label>
              <span>Developer sign-in</span>
              <input value={devName} onChange={(event) => setDevName(event.target.value)} maxLength="40" placeholder="Test account name" autoComplete="off" />
            </label>
            <button type="submit" disabled={busy || !devName.trim()}>Developer sign-in</button>
            <small>Local testing only: makes a pretend account from this name. Never available on gahookz.com.</small>
          </form> : null}
      </div>
    </section>);
}

// Shaped like the "Leave game?" confirmation (client/history.jsx) and reusing
// its styles: Back or Escape keeps the account, and the safe button has focus.
function DeleteAccountDialog({ busy, onCancel, onConfirm }) {
  const titleId = useId();
  const textId = useId();
  const keepRef = useRef(null);
  const dialogRef = useRef(null);
  useBackToClose(true, onCancel);
  useScrollLock(true);

  useEffect(() => {
    const focusFrame = requestAnimationFrame(() => keepRef.current?.focus());
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
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
  }, [onCancel]);

  return createPortal(
    <div className="leave-game-backdrop account-delete-backdrop" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel();
    }}>
      <section className="leave-game-dialog account-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={textId} ref={dialogRef}>
        <h2 id={titleId}>Delete your account?</h2>
        <p id={textId}>
          This permanently deletes your saved player look, custom Gahooks, career stats and unlocks,
          and signs you out on every device. You can keep playing as a guest. It cannot be undone.
        </p>
        <div className="leave-game-actions">
          <button className="secondary-button" type="button" ref={keepRef} onClick={onCancel} disabled={busy}>Keep my account</button>
          <button className="primary-button account-delete-confirm" type="button" onClick={onConfirm} disabled={busy}>{busy ? "Deleting" : "Delete forever"}</button>
        </div>
      </section>
    </div>, document.body);
}
