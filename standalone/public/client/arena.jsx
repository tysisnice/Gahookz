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
        <strong title={player.name}>{player.name}</strong><b>{hits[player.id] || 0}<small> taps</small></b>
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
    <footer>{duel.status === "active" ? `Pull 5 taps ahead to win · ${Math.max(0, Math.ceil((duel.endsAt - clock) / 1000))}s` : duel.winnerId ? "The crowd goes wild!" : "No five-tap lead this time. Rematch?"}</footer>
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
  const confirmed = duel.hits[ownId] || 0;
  const optimistic = Math.max(confirmed, ...pending.map(target => target.sequence));
  const target = duel.ownTargets?.find(item => item.sequence === optimistic + 1);
  const opponent = duel.players.find(player => player.id !== ownId);
  const me = duel.players.find(player => player.id === ownId);
  const hits = { ...duel.hits, [ownId]: duel.status === "active" ? optimistic : confirmed };
  const lead = hits[ownId] - hits[opponent?.id];
  const finished = duel.status === "finished";
  const countdown = Math.max(1, Math.ceil((duel.gameplayStartsAt - clock) / 1000));

  useEffect(() => () => { mounted.current = false; queue.current = []; }, []);
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
      <p className="arena-instruction" role="status">{finished ? duel.winnerId === ownId ? "YOU GAHOOKED 'EM!" : duel.winnerId ? "YOU GET GOT!" : "WHAT A MATCH. CALL IT A DRAW!" : clock < duel.gameplayStartsAt ? "Tap the Gahook. It moves. Pull 5 ahead!" : Math.abs(lead) >= 4 ? lead > 0 ? "ONE MORE PULL!" : "PULL IT BACK!" : "Tap. Chase. GAHOOK!"}</p>
      {!finished && <span className="arena-timer">{Math.max(0, Math.ceil((duel.endsAt - Math.max(clock, duel.gameplayStartsAt)) / 1000))}s <small>· lead by 5 to win</small></span>}
    </div>
    <div className="arena-playfield">
      <span className="arena-playfield__label" aria-hidden="true">YOUR TAP ZONE</span>
      {finished ? <div className="arena-centre"><b>{duel.winnerId === ownId ? "🏆" : duel.winnerId ? "🍌" : "🤝"}</b><p>{duel.resultReason === "left" ? "Your opponent left the arena." : duel.winnerId ? "Five taps ahead. Bragging rights earned." : "45 seconds. No five-tap lead. Both survive!"}</p><button type="button" onClick={() => setDismissed(true)}>Back to lobby</button></div>
        : clock < duel.gameplayStartsAt ? <div className="arena-centre arena-countdown" role="status"><b key={countdown}>{countdown}</b><p>GET READY TO GAHOOK</p></div>
        : error ? <div className="arena-centre"><p role="status">{error}</p><button type="button" onClick={sync}>Sync & keep playing</button></div>
        : !open ? <div className="arena-centre" role="status"><p>Time! Waiting for the result…</p></div>
        : <div className="arena-target-bounds">
          {target ? <button ref={targetButton} className="arena-target" type="button" data-sequence={target.sequence} style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }}
            onPointerDown={tap} onClick={event => { if (event.detail === 0) tap(event); }} onKeyDown={event => { if (event.repeat && [" ", "Enter"].includes(event.key)) event.preventDefault(); }}
            aria-label="Tap Gahook" key={target.id}>
            <span aria-hidden="true"><GahookOverlayVisual form={getGahookForm(me?.gahookForm)} customGahook={me?.customGahook} small /></span><b>GAHOOK!</b>
          </button> : <div className="arena-centre" role="status">Catching up with your taps…</div>}
        </div>}
    </div>
  </section>;
}
