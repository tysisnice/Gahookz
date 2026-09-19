import React, { useEffect, useRef, useState } from "react";
import { GahookOverlayVisual } from "./presentation.jsx";
import { getGahookForm } from "./gahook-forms.js";
import { effectsMuted } from "./preferences.jsx";
import { getAudioContext, playTone, playVictoryPartySound, playGetGotSound } from "./audio.js";

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

// A display-only mirror of pressesRequiredAtLead in standalone/server/arena.mjs.
// The server stays authoritative: it decides what scores, and its numbers
// overwrite anything projected here the moment the acknowledgement lands. This
// exists so the rope moves on the press that earned it instead of one round
// trip later, which is the whole difference between "snappy" and "laggy".
function pressesRequiredAtLead(lead, limit) {
  if (lead >= limit - 1) return 3;
  if (lead >= limit - 2) return 2;
  return 1;
}

// Replays the presses that are still in flight over the last confirmed state,
// so the score, the rope and the "presses left" pips all reflect what the
// player has actually done rather than what the server has so far confirmed.
function projectOwnScore(duel, ownId, opponentId, pendingCount) {
  const limit = duel.leadToWin || 5;
  const other = duel.hits[opponentId] || 0;
  let own = duel.hits[ownId] || 0;
  let charge = duel.pressesDone || 0;
  for (let index = 0; index < pendingCount; index += 1) {
    if (charge + 1 >= pressesRequiredAtLead(own - other, limit)) {
      own += 1;
      charge = 0;
    } else {
      charge += 1;
    }
  }
  return { hits: own, charge, required: pressesRequiredAtLead(own - other, limit) };
}

export function ArenaScore({ duel, Avatar, hits = duel.hits }) {
  const [first, second] = duel.players || [];
  if (!first || !second) return null;
  const lead = (hits[first.id] || 0) - (hits[second.id] || 0);
  const limit = duel.leadToWin || 5;
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
    <footer>{duel.status === "active" ? `Pull 5 points ahead to win · ${Math.max(0, Math.ceil((duel.endsAt - clock) / 1000))}s` : duel.winnerId ? "The crowd goes wild!" : "No five-point lead this time. Rematch?"}</footer>
  </aside>;
}

export function ArenaOverlay({ duel: incoming, ownPlayer, playerKey, Avatar, request }) {
  if (!incoming?.isParticipant || !ownPlayer || !["active", "finished"].includes(incoming.status)) return null;
  return <TapMatch key={incoming.id} incoming={incoming} ownId={ownPlayer.id} playerKey={playerKey} Avatar={Avatar} request={request} />;
}

function TapMatch({ incoming, ownId, playerKey, Avatar, request }) {
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
      {/* The old copy here said "ONE MORE PULL!" at a lead of four, which
          stopped being true once closing out a win started costing three
          presses. A player who taps and sees nothing move needs to be told the
          point is part-paid, or the rubber band reads as a dropped input. */}
      <p className="arena-instruction" role="status">{finished ? duel.winnerId === ownId ? "YOU GAHOOKED 'EM!" : duel.winnerId ? "YOU GET GOT!" : "WHAT A MATCH. CALL IT A DRAW!"
        : clock < duel.gameplayStartsAt ? "Tap the Gahook. It moves. Pull 5 ahead!"
        : lead > 0 && pressesRequired > 1 ? `${pressesRequired - pressesDone} MORE ${lead >= (duel.leadToWin || 5) - 1 ? "TO WIN" : "FOR THE NEXT POINT"}!`
        : lead <= -4 ? "PULL IT BACK!"
        : "Tap. Chase. GAHOOK!"}</p>
      {!finished && pressesRequired > 1 ? <span className="arena-charge" role="status" aria-label={`${pressesRequired - pressesDone} of ${pressesRequired} presses left for this point`}>
        {Array.from({ length: pressesRequired }, (_, index) => <i className={index < pressesDone ? "is-paid" : ""} key={index} aria-hidden="true" />)}
      </span> : null}
      {!finished && <span className="arena-timer">{Math.max(0, Math.ceil((duel.endsAt - Math.max(clock, duel.gameplayStartsAt)) / 1000))}s <small>· lead by 5 to win</small></span>}
    </div>
    {incomingMinis.length ? <div className="arena-mini-layer" aria-hidden="true">
      {incomingMinis.map(card => <span className="arena-mini-gahook" key={card.key} style={{ left: `${card.left}%`, top: `${card.top}%`, "--mini-rotate": `${card.rotate}deg` }}>
        <GahookOverlayVisual form={getGahookForm(opponent?.gahookForm)} customGahook={opponent?.customGahook} small />
      </span>)}
    </div> : null}
    <div className="arena-playfield">
      <span className="arena-playfield__label" aria-hidden="true">YOUR TAP ZONE</span>
      {finished ? <div className="arena-centre"><b>{duel.winnerId === ownId ? "🏆" : duel.winnerId ? "🍌" : "🤝"}</b><p>{duel.resultReason === "left" ? "Your opponent left the arena." : duel.winnerId ? "Five taps ahead. Bragging rights earned." : "45 seconds. No five-tap lead. Both survive!"}</p><button type="button" onClick={() => setDismissed(true)}>Back to lobby</button></div>
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
  </section>;
}
