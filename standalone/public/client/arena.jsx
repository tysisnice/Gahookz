import React, { useEffect, useRef, useState } from "react";
import { GahookOverlayVisual } from "./presentation.jsx";
import { getGahookForm } from "./gahook-forms.js";
import { effectsMuted } from "./preferences.jsx";
import { getAudioContext, playTone, playVictoryPartySound, playGetGotSound, playGahookFormSound, resetPokeSoundChannel } from "./audio.js";

function useArenaClock(duel) {
  const anchor = useRef({ server: duel?.serverTime || Date.now(), local: performance.now() });
  const [clock, setClock] = useState(duel?.serverTime || Date.now());
  useEffect(() => {
    if (duel?.serverTime) anchor.current = { server: duel.serverTime, local: performance.now() };
  }, [duel?.id, duel?.serverTime]);
  useEffect(() => {
    if (!duel || duel.status !== "active") return;
    const tick = () => setClock(anchor.current.server + performance.now() - anchor.current.local);
    tick();
    const timer = setInterval(tick, 50);
    return () => clearInterval(timer);
  }, [duel?.id, duel?.status]);
  return clock;
}

function tapSound(lead) {
  if (effectsMuted()) return;
  const ctx = getAudioContext();
  if (ctx) playTone(ctx, 480 + (lead + 5) * 45, ctx.currentTime, 0.075, "sine", 0.06);
}

// How long a Gahooked button stays on screen after it is pressed. Short enough
// that it never delays the next tap -- the replacement button is already there
// underneath it -- and long enough to read as a hit rather than a flicker.
const TAP_GHOST_MS = 200;

// The lead to win, read from the duel. The server always publishes it; the
// fallback only matters for a snapshot from a build that predates the field,
// and matches ARENA_LEAD_TO_WIN in standalone/server/arena.mjs.
function leadToWinOf(duel) {
  return duel?.leadToWin || 6;
}

// A display-only mirror of pressesRequiredAtLead in standalone/server/arena.mjs.
// The server stays authoritative: it decides what scores, and its numbers
// overwrite anything projected here the moment the acknowledgement lands. This
// exists so the rope moves on the press that earned it instead of one round
// trip later, which is the whole difference between "snappy" and "laggy".
//
// It reads the server's own table (`pressesByLead`, one entry per lead) rather
// than restating the rule, so changing the constants in arena.mjs is enough.
// The fallback is today's rule: the last two points cost two presses each.
function pressesRequiredAtLead(duel, lead) {
  if (lead < 0) return 1;
  const table = duel?.pressesByLead;
  if (Array.isArray(table) && table.length) return table[Math.min(lead, table.length - 1)] || 1;
  return lead >= leadToWinOf(duel) - 2 ? 2 : 1;
}

// Replays the presses that are still in flight over the last confirmed state,
// so the score, the rope and the "presses left" pips all reflect what the
// player has actually done rather than what the server has so far confirmed.
function projectOwnScore(duel, ownId, opponentId, pendingCount) {
  const other = duel.hits[opponentId] || 0;
  let own = duel.hits[ownId] || 0;
  let charge = duel.pressesDone || 0;
  for (let index = 0; index < pendingCount; index += 1) {
    if (charge + 1 >= pressesRequiredAtLead(duel, own - other)) {
      own += 1;
      charge = 0;
    } else {
      charge += 1;
    }
  }
  return { hits: own, charge, required: pressesRequiredAtLead(duel, own - other) };
}

export function ArenaScore({ duel, Avatar, hits = duel.hits }) {
  const [first, second] = duel.players || [];
  if (!first || !second) return null;
  const lead = (hits[first.id] || 0) - (hits[second.id] || 0);
  const limit = leadToWinOf(duel);
  const winner = duel.players.find(player => player.id === duel.winnerId);
  const leader = lead > 0 ? first : second;
  const description = duel.status === "finished"
    ? winner ? `${winner.name} wins!${duel.resultReason === "left" ? " Opponent left." : ""}` : "Evenly matched. It's a draw!"
    : lead === 0 ? "All tied up!" : `${leader.name} leads by ${Math.abs(lead)}`;
  return <section className="arena-score" aria-label="Gahook tug of war">
    <div className="arena-score__players">
      {[first, second].map((player, index) => <div className={`arena-player arena-player--${index} ${duel.winnerId === player.id ? "is-winner" : ""}`} key={player.id}>
        <span className={`arena-player__portrait ${(hits[player.id] || 0) > 0 ? "is-hit" : ""}`} key={`${player.id}-${hits[player.id] || 0}`}><Avatar player={player} /></span>
        <strong title={player.name}>{player.name}</strong><b>{hits[player.id] || 0}<small> points</small></b>
      </div>)}
      <span className="arena-score__vs" aria-hidden="true">VS</span>
    </div>
    <div className="arena-rope" role="meter" aria-label={`${first.name} versus ${second.name}`} aria-valuemin={-limit} aria-valuemax={limit} aria-valuenow={Math.max(-limit, Math.min(limit, lead))} aria-valuetext={description}>
      <span className="arena-rope__ticks" aria-hidden="true" />
      <span className="arena-rope__knot" style={{ left: `${50 - Math.max(-limit, Math.min(limit, lead)) / limit * 44}%` }} aria-hidden="true">⚡</span>
    </div>
    <p className="arena-score__status">{description}</p>
  </section>;
}

export function ArenaSpectator({ duel, Avatar }) {
  const clock = useArenaClock(duel);
  if (!duel || !["active", "finished"].includes(duel.status)) return null;
  const countdown = Math.ceil((duel.gameplayStartsAt - clock) / 1000);
  return <aside className="arena-spectator" aria-label="Live Gahook Arena">
    <header><strong>GAHOOK ARENA <span>· TUG OF WAR</span></strong><b>{duel.status === "finished" ? "FINAL" : countdown > 0 ? `STARTS IN ${countdown}` : "LIVE"}</b></header>
    <ArenaScore duel={duel} Avatar={Avatar} />
    {/* "taps" was accurate when every tap scored. Points and presses are no
        longer the same thing, so the crowd is told about points. */}
    <footer>{duel.status === "active" ? `Pull ${leadToWinOf(duel)} points ahead to win · ${Math.max(0, Math.ceil((duel.endsAt - clock) / 1000))}s` : duel.winnerId ? "The crowd goes wild!" : `No ${leadToWinOf(duel)}-point lead this time. Rematch?`}</footer>
  </aside>;
}

export function ArenaOverlay({ duel: incoming, ownPlayer, ownPoke, playerKey, Avatar, request }) {
  if (!incoming?.isParticipant || !ownPlayer || !["active", "finished"].includes(incoming.status)) return null;
  return <TapMatch key={incoming.id} incoming={incoming} ownId={ownPlayer.id} ownPoke={ownPoke} playerKey={playerKey} Avatar={Avatar} request={request} />;
}

// Gahooks thrown at a duelist -------------------------------------------------
//
// Anyone in the room can Gahook a player who is mid-1v1. Those used to go to a
// small card in PlayerView's own layer, which sat *underneath* this overlay
// (z-index 70 against 94), so a duelist heard them but never saw them.
//
// Since 2026-09-25 (Tyson: "make it so the mini gahookz appear randomly but
// can also appear in the bottom half of the players screen ... players can tap
// on these mini gahookz to gahook the player that sent it") the arena draws
// them itself, inside its own stacking context, so no global z-index moves:
//
// - they land anywhere below the score, including over the tap zone, so they
//   genuinely get in the way; the score header always stays readable;
// - each one is a real button: tapping it Gahooks the sender back through the
//   ordinary /api/player/poke route, so every server rule (effects policy,
//   rate limits, spam, Ultimate, counter offers) applies exactly as it would
//   from the roster;
// - a tap on one never reaches the arena target and does not move focus away
//   from it, and the layer itself lets taps through wherever no mini sits.
//
// The opponent's own presses (incomingMinis in TapMatch) stay decorative and
// in the top band. They arrive several times a second; if those obstructed the
// tap zone the duel would be unplayable.
export const ARENA_THROWN_MINI_MS = 2400;
const THROWN_MINI_LIMIT = 4;
const THROWN_MINI_SIZE = 84;
const THROWN_POP_MS = 650;
const THROWN_STALE_MS = 4500;

// Which Gahooks the arena draws as tappable minis. Ordinary and Ultimate
// Gahooks are thrown by someone and can be thrown back; the ceremonial and
// interactive kinds (Get Got, congratulations, boos, counters, challenges)
// keep their own treatment. Ultimate is included because spam escalates into
// it: leaving it out would make the minis stop exactly when the spam got worse.
// PlayerView and HostLobbyPokeEffects use this same test to stand aside.
export function isArenaThrownGahook(poke) {
  const kind = poke?.kind || "normal";
  return kind === "normal" || kind === "ultimate";
}

// A centre, in percent of the overlay, that keeps the whole card on screen
// (320px wide included) and below the score. A few samples keep a new mini off
// the ones already showing, bounded so a fixed random source still terminates.
function placeThrownMini(overlay, existing, random = Math.random) {
  const box = overlay?.getBoundingClientRect?.();
  const width = box?.width || window.innerWidth;
  const height = box?.height || window.innerHeight;
  const score = overlay?.querySelector?.(".arena-score")?.getBoundingClientRect?.();
  // Half the card plus room for its tilt, so a rotated corner stays inside.
  const half = THROWN_MINI_SIZE / 2 + 8;
  const scoreBottom = score && box ? score.bottom - box.top : height * 0.3;
  const minX = half;
  const maxX = Math.max(minX, width - half);
  const maxY = Math.max(half, height - half - 10);
  const minY = Math.min(maxY, scoreBottom + half);
  let best = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const x = minX + random() * (maxX - minX);
    const y = minY + random() * (maxY - minY);
    const clearance = existing.reduce((closest, item) => Math.min(closest, Math.hypot(item.x / 100 * width - x, item.y / 100 * height - y)), Infinity);
    if (!best || clearance > best.clearance) best = { x, y, clearance };
    if (clearance >= THROWN_MINI_SIZE) break;
  }
  return { x: best.x / width * 100, y: best.y / height * 100 };
}

function ThrownMiniLayer({ ownPoke, active, ownId, playerKey, request, overlayRef, serverNow, onReturnFocus }) {
  const [minis, setMinis] = useState([]);
  const [announcement, setAnnouncement] = useState("");
  // Whatever Gahook was current when the match opened is history, not a throw.
  const seenRef = useRef(ownPoke?.id || "");
  const timers = useRef(new Map());
  const mounted = useRef(true);
  const minisRef = useRef(minis);
  minisRef.current = minis;

  useEffect(() => () => {
    mounted.current = false;
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);

  const later = (key, ms, action) => {
    clearTimeout(timers.current.get(key));
    timers.current.set(key, setTimeout(() => {
      timers.current.delete(key);
      if (mounted.current) action();
    }, ms));
  };
  const remove = key => setMinis(list => list.filter(item => item.key !== key));

  useEffect(() => {
    const poke = ownPoke;
    if (!poke?.id || seenRef.current === poke.id) return;
    seenRef.current = poke.id;
    if (!active || !isArenaThrownGahook(poke)) return;
    // Read against the server's clock, so a skewed phone neither drops fresh
    // Gahooks nor replays old ones after a reconnect.
    if (poke.createdAt && serverNow() - poke.createdAt > THROWN_STALE_MS) return;
    const live = minisRef.current.filter(item => item.state === "live");
    // Bounded: the oldest live mini makes way rather than the pile growing.
    const dropped = live.slice(0, Math.max(0, live.length - THROWN_MINI_LIMIT + 1)).map(item => item.key);
    dropped.forEach(key => {
      clearTimeout(timers.current.get(key));
      timers.current.delete(key);
    });
    const mini = {
      key: poke.id,
      senderId: poke.senderPlayerId && poke.senderPlayerId !== ownId ? poke.senderPlayerId : "",
      from: poke.from || "Someone",
      form: getGahookForm(poke.gahookForm),
      customGahook: poke.customGahook || null,
      ultimate: poke.kind === "ultimate",
      state: "live",
      rotate: -10 + Math.random() * 20,
      ...placeThrownMini(overlayRef.current, live.filter(item => !dropped.includes(item.key)))
    };
    setMinis(list => [...list.filter(item => !dropped.includes(item.key)), mini]);
    later(mini.key, ARENA_THROWN_MINI_MS, () => remove(mini.key));
    playGahookFormSound(poke.gahookForm, resetPokeSoundChannel(), poke.customGahook, 1450);
  }, [ownPoke?.id]);

  function gahookBack(event, mini) {
    if (event.type === "pointerdown" && (event.button !== 0 || !event.isPrimary)) return;
    event.preventDefault();
    event.stopPropagation();
    // A keyboard press, or a pointer that managed to focus the mini, would
    // otherwise leave focus on a button that is about to disappear.
    const returnFocus = event.type !== "pointerdown" || document.activeElement === event.currentTarget;
    const canReply = Boolean(mini.senderId);
    setMinis(list => list.map(item => item.key === mini.key ? { ...item, state: canReply ? "sent" : "dismissed" } : item));
    setAnnouncement(canReply ? `Gahooked ${mini.from} back!` : "");
    later(mini.key, THROWN_POP_MS, () => remove(mini.key));
    if (returnFocus) onReturnFocus();
    if (!canReply) return;
    request("/api/player/poke", { playerKey, playerId: mini.senderId }, { refresh: false, timeoutMs: 1800 }).then(result => {
      if (!mounted.current || result?.ok) return;
      // The sender left, or the room refused it. Nothing was sent, so say so
      // briefly rather than leaving "Gahooked back!" standing.
      setMinis(list => list.map(item => item.key === mini.key ? { ...item, state: "failed" } : item));
      setAnnouncement(`Could not Gahook ${mini.from} back.`);
    });
  }

  return <div className="arena-thrown-layer">
    {minis.map(mini => {
      const position = { left: `${mini.x}%`, top: `${mini.y}%`, "--mini-rotate": `${mini.rotate}deg` };
      if (mini.state !== "live") {
        return <span className={`arena-thrown-mini is-${mini.state}`} key={mini.key} style={position} aria-hidden="true">
          <b>{mini.state === "sent" ? "Gahooked back!" : mini.state === "failed" ? "Can't Gahook back" : "Poof!"}</b>
        </span>;
      }
      return <button type="button" className={`arena-thrown-mini${mini.ultimate ? " is-ultimate" : ""}`} key={mini.key}
        style={{ ...position, "--thrown-life": `${ARENA_THROWN_MINI_MS}ms` }}
        data-sender-id={mini.senderId || undefined}
        aria-label={mini.senderId ? `Gahook ${mini.from} back` : `Dismiss ${mini.from}'s Gahook`}
        onPointerDown={event => gahookBack(event, mini)}
        onMouseDown={event => event.preventDefault()}
        onClick={event => { if (event.detail === 0) gahookBack(event, mini); }}>
        <span className="arena-thrown-mini__art" aria-hidden="true"><GahookOverlayVisual form={mini.form} customGahook={mini.customGahook} small /></span>
        <b aria-hidden="true">by {mini.from}</b>
        {mini.senderId ? <i aria-hidden="true">↩</i> : null}
      </button>;
    })}
    <span className="sr-only" role="status">{announcement}</span>
  </div>;
}

function TapMatch({ incoming, ownId, ownPoke, playerKey, Avatar, request }) {
  const [ack, setAck] = useState(null);
  const [pending, setPending] = useState([]);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [ghosts, setGhosts] = useState([]);
  const [incomingMinis, setIncomingMinis] = useState([]);
  const ghostTimers = useRef([]);
  const incomingTimers = useRef([]);
  const seenHitRef = useRef("");
  const lastIncomingAtRef = useRef(0);
  const queue = useRef([]);
  const sending = useRef(false);
  const mounted = useRef(true);
  const targetButton = useRef(null);
  const dialog = useRef(null);
  const keyboard = useRef(false);
  const duel = ack && ack.revision > incoming.revision ? ack : incoming;
  const current = useRef(duel);
  current.current = duel;
  const clock = useArenaClock(duel);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const open = duel.status === "active" && clock >= duel.gameplayStartsAt && clock < duel.endsAt;
  const opponent = duel.players.find(player => player.id !== ownId);
  const me = duel.players.find(player => player.id === ownId);
  // Targets are numbered by presses, not by points, because a press close to
  // the win may not score. Asking for the next target by point would stall the
  // button the moment the rubber band engaged.
  const confirmedPresses = duel.ownPresses || 0;
  const pressed = Math.max(confirmedPresses, ...pending.map(target => target.sequence));
  const target = duel.ownTargets?.find(item => item.sequence === pressed + 1);
  const projected = projectOwnScore(duel, ownId, opponent?.id, pressed - confirmedPresses);
  const hits = { ...duel.hits, [ownId]: duel.status === "active" ? projected.hits : (duel.hits[ownId] || 0) };
  const lead = hits[ownId] - hits[opponent?.id];
  const pressesRequired = duel.status === "active" ? projected.required : 1;
  const pressesDone = duel.status === "active" ? projected.charge : 0;
  const finished = duel.status === "finished";
  const leadToWin = leadToWinOf(duel);
  const countdown = Math.max(1, Math.ceil((duel.gameplayStartsAt - clock) / 1000));

  useEffect(() => () => {
    mounted.current = false;
    queue.current = [];
    ghostTimers.current.forEach(clearTimeout);
    ghostTimers.current = [];
    incomingTimers.current.forEach(clearTimeout);
    incomingTimers.current = [];
  }, []);

  // Every press the opponent makes lands here as a mini Gahook.
  //
  // This is derived from `lastHit`, which the duel already carries, rather than
  // sent as its own poke. That matters: at four taps a second each, routing
  // these through the poke system would be sixty extra fan-outs a second in the
  // one place the game can least afford them, and the server's broadcast floor
  // already coalesces `lastHit` to at most one per flush. So the information is
  // free, and the volume is bounded before it ever reaches the client.
  //
  // It is throttled again here anyway, because "bounded" is not the same as
  // "readable": more than one card every 150ms is noise, not feedback.
  useEffect(() => {
    const hit = duel.lastHit;
    if (!hit?.id || hit.playerId === ownId || seenHitRef.current === hit.id) return undefined;
    seenHitRef.current = hit.id;
    const now = Date.now();
    if (now - lastIncomingAtRef.current < 150) return undefined;
    lastIncomingAtRef.current = now;
    const card = {
      key: hit.id,
      left: 8 + Math.random() * 72,
      top: 8 + Math.random() * 30,
      rotate: -12 + Math.random() * 24
    };
    setIncomingMinis(list => [...list.slice(-2), card]);
    const timer = setTimeout(() => {
      incomingTimers.current = incomingTimers.current.filter(item => item !== timer);
      if (!mounted.current) return;
      setIncomingMinis(list => list.filter(item => item.key !== card.key));
    }, 900);
    incomingTimers.current.push(timer);
    return undefined;
  }, [duel.lastHit?.id, ownId]);
  useEffect(() => {
    if (dismissed) return;
    const previous = document.activeElement;
    dialog.current?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus?.({ preventScroll: true }); };
  }, [dismissed]);
  useEffect(() => {
    if (keyboard.current) targetButton.current?.focus({ preventScroll: true });
  }, [target?.id]);
  useEffect(() => {
    if (!finished) return;
    queue.current = [];
    setPending([]);
    setError("");
    if (duel.winnerId === ownId) playVictoryPartySound();
    else if (duel.loserId === ownId) playGetGotSound();
  }, [finished]);

  async function drain() {
    if (sending.current) return;
    sending.current = true;
    try {
      while (mounted.current && queue.current.length && current.current.status === "active") {
        const next = queue.current[0];
        const payload = { playerKey, duelId: incoming.id, targetId: next.id };
        let result = await request("/api/player/duel-tap", payload, { refresh: false, timeoutMs: 1800 });
        // Retrying the same issued target is idempotent, including a winning tap.
        if (!result.ok && !result.duel) result = await request("/api/player/duel-tap", payload, { refresh: false, timeoutMs: 1800 });
        if (!mounted.current) return;
        if (result.duel) {
          setAck(previous => !previous || result.duel.revision >= previous.revision ? result.duel : previous);
          if (result.duel.revision >= current.current.revision) current.current = result.duel;
        }
        if (!result.ok) {
          queue.current = [];
          setPending([]);
          if (current.current.status === "active") setError("Connection hiccup. Sync your target to keep playing.");
          window.gahookzRefreshSnapshot?.();
          return;
        }
        queue.current = queue.current.filter(item => item.id !== next.id);
        setPending([...queue.current]);
      }
    } finally { sending.current = false; }
  }

  function tap(event) {
    if (event.type === "pointerdown" && (event.button !== 0 || !event.isPrimary)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!open || !target || error || queue.current.some(item => item.id === target.id)) return;
    keyboard.current = event.type !== "pointerdown";
    // The Gahooked button is left behind where it was pressed and fades out on
    // its own while the replacement is already live underneath it. Firing this
    // at press time rather than on acknowledgement is deliberate: waiting for
    // the server would put a round trip between the finger and the feedback,
    // which is exactly the lag this is supposed to hide.
    const ghost = { key: target.id, x: target.x, y: target.y };
    setGhosts(list => [...list, ghost]);
    const timer = setTimeout(() => {
      ghostTimers.current = ghostTimers.current.filter(item => item !== timer);
      if (!mounted.current) return;
      setGhosts(list => list.filter(item => item.key !== ghost.key));
    }, TAP_GHOST_MS);
    ghostTimers.current.push(timer);
    queue.current.push(target);
    setPending([...queue.current]);
    tapSound(lead);
    drain();
  }

  async function sync() {
    const result = await request("/api/state", { playerKey, role: "player" }, { refresh: false, timeoutMs: 1800 });
    if (!mounted.current) return;
    if (result.gahookDuel?.id === incoming.id) {
      setAck(result.gahookDuel);
      setError("");
    }
    window.gahookzRefreshSnapshot?.();
  }

  if (dismissed) return null;
  return <section ref={dialog} tabIndex={-1} className={`arena-overlay ${finished ? "is-finished" : ""}`} role="dialog" aria-modal="true" aria-label="Gahook Arena tug of war" onKeyDown={event => {
    if (event.key !== "Tab") return;
    const buttons = [...dialog.current.querySelectorAll("button:not(:disabled)")];
    const index = buttons.indexOf(document.activeElement);
    event.preventDefault();
    keyboard.current = true;
    if (buttons.length) buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
  }}>
    <div className="arena-overlay__top">
      <header><span>1V1 · GAHOOK ARENA</span><b>TUG OF WAR</b></header>
      <ArenaScore duel={duel} Avatar={Avatar} hits={hits} />
      {/* The old copy here said "ONE MORE PULL!" one point from the win,
          which stopped being true once closing out a win started costing
          more than one press (two since 2026-09-25). A player who taps and
          sees nothing move needs to be told the point is part-paid, or the
          rubber band reads as a dropped input. */}
      <p className="arena-instruction" role="status">{finished ? duel.winnerId === ownId ? "YOU GAHOOKED 'EM!" : duel.winnerId ? "YOU GET GOT!" : "WHAT A MATCH. CALL IT A DRAW!"
        : clock < duel.gameplayStartsAt ? `Tap the Gahook. It moves. Pull ${leadToWin} ahead!`
        : lead > 0 && pressesRequired > 1 ? `${pressesRequired - pressesDone} MORE ${lead >= leadToWin - 1 ? "TO WIN" : "FOR THE NEXT POINT"}!`
        : lead <= -4 ? "PULL IT BACK!"
        : "Tap. Chase. GAHOOK!"}</p>
      {!finished && pressesRequired > 1 ? <span className="arena-charge" role="status" aria-label={`${pressesRequired - pressesDone} of ${pressesRequired} presses left for this point`}>
        {Array.from({ length: pressesRequired }, (_, index) => <i className={index < pressesDone ? "is-paid" : ""} key={index} aria-hidden="true" />)}
      </span> : null}
      {!finished && <span className="arena-timer">{Math.max(0, Math.ceil((duel.endsAt - Math.max(clock, duel.gameplayStartsAt)) / 1000))}s <small>· lead by {leadToWin} to win</small></span>}
    </div>
    {incomingMinis.length ? <div className="arena-mini-layer" aria-hidden="true">
      {incomingMinis.map(card => <span className="arena-mini-gahook" key={card.key} style={{ left: `${card.left}%`, top: `${card.top}%`, "--mini-rotate": `${card.rotate}deg` }}>
        <GahookOverlayVisual form={getGahookForm(opponent?.gahookForm)} customGahook={opponent?.customGahook} small />
      </span>)}
    </div> : null}
    <div className="arena-playfield">
      <span className="arena-playfield__label" aria-hidden="true">YOUR TAP ZONE</span>
      {finished ? <div className="arena-centre"><b>{duel.winnerId === ownId ? "🏆" : duel.winnerId ? "🍌" : "🤝"}</b><p>{duel.resultReason === "left" ? "Your opponent left the arena." : duel.winnerId ? `${leadToWin} points ahead. Bragging rights earned.` : `45 seconds. No ${leadToWin}-point lead. Both survive!`}</p><button type="button" onClick={() => setDismissed(true)}>Back to lobby</button></div>
        : clock < duel.gameplayStartsAt ? <div className="arena-centre arena-countdown" role="status"><b key={countdown}>{countdown}</b><p>GET READY TO GAHOOK</p></div>
        : error ? <div className="arena-centre"><p role="status">{error}</p><button type="button" onClick={sync}>Sync & keep playing</button></div>
        : !open ? <div className="arena-centre" role="status"><p>Time! Waiting for the result…</p></div>
        : <div className="arena-target-bounds">
          {ghosts.map(ghost => <span className="arena-target-ghost" aria-hidden="true" key={ghost.key} style={{ left: `${ghost.x * 100}%`, top: `${ghost.y * 100}%` }}>
            <span><GahookOverlayVisual form={getGahookForm(me?.gahookForm)} customGahook={me?.customGahook} small /></span>
          </span>)}
          {target ? <button ref={targetButton} className="arena-target" type="button" data-sequence={target.sequence} style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }}
            onPointerDown={tap} onClick={event => { if (event.detail === 0) tap(event); }} onKeyDown={event => { if (event.repeat && [" ", "Enter"].includes(event.key)) event.preventDefault(); }}
            aria-label="Tap Gahook" key={target.id}>
            <span aria-hidden="true"><GahookOverlayVisual form={getGahookForm(me?.gahookForm)} customGahook={me?.customGahook} small /></span><b>GAHOOK!</b>
          </button> : <div className="arena-centre" role="status">Catching up with your taps…</div>}
        </div>}
    </div>
    {/* After the playfield, so Tab reaches the target first and the minis sit
        above it inside this overlay's own stacking context. */}
    <ThrownMiniLayer ownPoke={ownPoke} active={duel.status === "active"} ownId={ownId} playerKey={playerKey} request={request}
      overlayRef={dialog} serverNow={() => clockRef.current}
      onReturnFocus={() => (targetButton.current || dialog.current)?.focus({ preventScroll: true })} />
  </section>;
}
