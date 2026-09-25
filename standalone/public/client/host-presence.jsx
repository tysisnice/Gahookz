// Tells the room what happened to its host.
//
// The server keeps a room alive for a grace period after its host's live
// connection drops, and if the host is still gone when it runs out, passes the
// host role to a connected player (standalone/server/host-presence.mjs). Three
// snapshot fields describe that, and this module is the only thing that reads
// them:
//
//   hostPresence     the host is away; everybody else sees a countdown
//   hostChange       somebody became host in the last few seconds
//   ownHostReplaced  only for the host who was replaced: why they are not host
//
// It renders as a small fixed stack under the top bar with pointer events off,
// so it can never cover a button a player needs mid-round. It is mounted once
// per screen tree: in PlayerView (which also hosts the join screen and the
// party view) and beside HostView in HostMode.

import React, { useEffect, useState } from "react";

// A host who refreshes closes and reopens their stream within a second or two,
// and the server marks them away after its own short debounce. Showing the
// banner immediately would flash it at every player on every host refresh.
const AWAY_BANNER_DELAY_MS = 2500;
// The server publishes a change for ten seconds; fade a little before that so
// a late snapshot cannot bring the notice back.
const HOST_CHANGE_VISIBLE_MS = 8000;
// The replaced host may come back long after the change, so their notice is
// timed from when they first see it, not from when it happened.
const REPLACED_VISIBLE_MS = 20000;
const DISMISSED_KEY = "gahookz-host-replaced-dismissed";

function serverNow() {
  const offset = typeof window !== "undefined" ? Number(window.gahookzServerClockOffset || 0) : 0;
  return Date.now() + offset;
}

/** 47_000 -> "0:47". Never negative. */
export function formatHostCountdown(remainingMs) {
  const totalSeconds = Math.max(0, Math.ceil(Number(remainingMs || 0) / 1000));
  return Math.floor(totalSeconds / 60) + ":" + String(totalSeconds % 60).padStart(2, "0");
}

function useServerClock(active) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!active) return undefined;
    setNow(serverNow());
    const timer = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function readDismissedId() {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) || "";
  } catch (_error) {
    return "";
  }
}

function replacedFollowUp(lobby) {
  if (lobby.ownPlayer) return "You're still in the game as a player.";
  if (lobby.phase === "finished") return "You can join as a player when the next game starts.";
  return "Join below to keep playing.";
}

export function HostPresenceNotices({ lobby }) {
  const presence = lobby?.hostPresence || null;
  const change = lobby?.hostChange || null;
  const replaced = lobby?.ownHostReplaced || null;
  const [dismissedId, setDismissedId] = useState(readDismissedId);
  const [replacedSeen, setReplacedSeen] = useState({ id: "", at: 0 });
  const replacedPending = Boolean(replaced && replaced.id !== dismissedId);
  const now = useServerClock(Boolean(presence || change || replacedPending));

  useEffect(() => {
    if (replaced?.id && replaced.id !== replacedSeen.id) setReplacedSeen({ id: replaced.id, at: Date.now() });
  }, [replaced?.id]);

  if (!lobby) return null;

  const dismissReplaced = () => {
    if (!replaced) return;
    setDismissedId(replaced.id);
    try {
      sessionStorage.setItem(DISMISSED_KEY, replaced.id);
    } catch (_error) {
      // Still dismissed for this page view.
    }
  };

  const showAway = Boolean(presence?.away) && !lobby.isHost && now - presence.since >= AWAY_BANNER_DELAY_MS;
  const showReplaced = replacedPending && replacedSeen.id === replaced.id && Date.now() - replacedSeen.at < REPLACED_VISIBLE_MS;
  // The replaced host gets their own, fuller notice instead of the general one.
  const showChange = Boolean(change) && now - change.at < HOST_CHANGE_VISIBLE_MS && !(replaced && replaced.id === change.id);
  if (!showAway && !showReplaced && !showChange) return null;

  const hostName = presence?.hostName || "The host";
  const remainingMs = presence ? presence.promoteAt - now : 0;
  const isOwnPromotion = Boolean(change && lobby.ownPlayer?.id && change.playerId === lobby.ownPlayer.id);

  return (
    <div className="host-presence-layer" role="status" aria-live="polite">
      {showAway ? <p className="host-presence-notice is-away">
          <span className="host-presence-dot" aria-hidden="true" />
          <span className="host-presence-text">
            {hostName} disconnected — waiting for them to come back
            {remainingMs > 0 ? <span className="host-presence-time" aria-hidden="true"> ({formatHostCountdown(remainingMs)})</span> : null}
          </span>
        </p> : null}
      {showChange ? <p className="host-presence-notice is-change">
          <span className="host-presence-dot" aria-hidden="true" />
          <span className="host-presence-text">
            {isOwnPromotion ? change.reason === "host-away" ? "You're the host now — the host was away." : "You're the host now." : change.name + " is now the host"}
          </span>
        </p> : null}
      {showReplaced ? <div className="host-presence-notice is-replaced">
          <span className="host-presence-dot" aria-hidden="true" />
          <span className="host-presence-text">You were away, so {replaced.name} is now the host. {replacedFollowUp(lobby)}</span>
          <button className="host-presence-dismiss" type="button" onClick={dismissReplaced} aria-label="Dismiss">×</button>
        </div> : null}
    </div>);
}
