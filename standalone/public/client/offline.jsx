import React, { useEffect, useRef, useState } from "react";
import {
  getAudioContext,
  playCongratsSound,
  playGahookFormSound,
  playGahookVoiceCue,
  playNoiseBurst,
  playTone,
  resetPokeSoundChannel
} from "./audio.js";
import {
  GAHOOK_FORMS,
  getGahookForm,
  getStoredGahookForm,
  storeGahookForm
} from "./gahook-forms.js";
import { GahookFormVisual, PokeJumpScare } from "./presentation.jsx";

const OFFLINE_HIGH_SCORE_KEY = "gahookz-offline-high-score";
const HEALTH_CHECK_MS = 4000;
const HEALTH_TIMEOUT_MS = 1400;
const DASH_JUMP_BUFFER_MS = 180;
const EXPECTED_SNAPSHOT_SCHEMA_VERSION = 1;

export function useServerConnection() {
  const startsOffline = typeof navigator !== "undefined" && !navigator.onLine;
  const [state, setState] = useState({ offline: startsOffline, recovered: false, checked: startsOffline, protocolMismatch: null });

  useEffect(() => {
    let active = true;
    let requestController = null;
    let checkInFlight = false;
    let consecutiveHealthFailures = 0;

    const markOffline = () => {
      if (active) setState({ offline: true, recovered: false, checked: true, protocolMismatch: null });
    };

    const checkServer = async () => {
      if (checkInFlight) return;
      if (!navigator.onLine) {
        markOffline();
        return;
      }
      checkInFlight = true;
      requestController = "AbortController" in window ? new AbortController() : null;
      const timeout = requestController ? setTimeout(() => requestController.abort(), HEALTH_TIMEOUT_MS) : null;
      try {
        const response = await fetch("/api/health?now=" + Date.now(), {
          cache: "no-store",
          signal: requestController?.signal
        });
        if (!response.ok) throw new Error("Server unavailable");
        const health = await response.json();
        const actualSchemaVersion = Number(health?.schemaVersion) || null;
        const protocolMismatch = actualSchemaVersion === EXPECTED_SNAPSHOT_SCHEMA_VERSION ? null : {
          expectedSchemaVersion: EXPECTED_SNAPSHOT_SCHEMA_VERSION,
          actualSchemaVersion,
          serverRelease: String(health?.release || "unknown")
        };
        consecutiveHealthFailures = 0;
        if (active) {
          setState((previous) => ({
            offline: false,
            recovered: previous.offline,
            checked: true,
            protocolMismatch
          }));
        }
      } catch (_error) {
        consecutiveHealthFailures += 1;
        if (consecutiveHealthFailures >= 2) markOffline();
      } finally {
        if (timeout) clearTimeout(timeout);
        checkInFlight = false;
        requestController = null;
      }
    };

    const handleOnline = () => checkServer();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", markOffline);
    checkServer();
    const interval = setInterval(checkServer, HEALTH_CHECK_MS);

    return () => {
      active = false;
      requestController?.abort();
      clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  const returnOnline = () => {
    setState({ offline: false, recovered: false, checked: true, protocolMismatch: null });
    window.location.assign("/");
  };

  return { ...state, returnOnline };
}

export function ServerUpdateExperience({ mismatch }) {
  const retry = async () => {
    try {
      const registration = await navigator.serviceWorker?.getRegistration?.("/");
      await registration?.update?.();
    } catch (_error) {}
    window.location.reload();
  };

  return (
    <main className="offline-screen server-update-screen">
      <header className="offline-brand-row">
        <div className="brand-lockup welcome-brand"><strong>Gahookz</strong></div>
        <span className="offline-pill">Updating</span>
      </header>
      <section className="offline-message" role="alert">
        <span>One quick pit stop</span>
        <h1>The game server and this screen are on different releases.</h1>
        <p>Rooms are paused until the server finishes updating. Retry in a moment; no amount of waiting on a loading screen will fix a mismatched release.</p>
        <button type="button" onClick={retry}>Check again</button>
        <small>Expected room protocol {mismatch?.expectedSchemaVersion}; server reported {mismatch?.actualSchemaVersion || "an older protocol"}.</small>
      </section>
    </main>
  );
}

export function usePwaInstall() {
  const [installPrompt, setInstallPrompt] = useState(() => window.gahookzInstallPrompt || null);
  const [installed, setInstalled] = useState(() => window.matchMedia?.("(display-mode: standalone)")?.matches || false);

  useEffect(() => {
    const rememberPrompt = (event) => setInstallPrompt(event.detail || window.gahookzInstallPrompt || null);
    const finishInstall = () => {
      window.gahookzInstallPrompt = null;
      setInstallPrompt(null);
      setInstalled(true);
    };
    window.addEventListener("gahookz-install-ready", rememberPrompt);
    window.addEventListener("appinstalled", finishInstall);
    return () => {
      window.removeEventListener("gahookz-install-ready", rememberPrompt);
      window.removeEventListener("appinstalled", finishInstall);
    };
  }, []);

  const install = async () => {
    const prompt = installPrompt || window.gahookzInstallPrompt;
    if (!prompt) return false;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice?.outcome === "accepted") {
      window.gahookzInstallPrompt = null;
      setInstallPrompt(null);
    }
    return choice?.outcome === "accepted";
  };

  return { canInstall: Boolean(installPrompt) && !installed, installed, install };
}

export function OfflineExperience({ recovered, onReturnOnline }) {
  return (
    <main className="offline-screen">
      <header className="offline-brand-row">
        <div className="brand-lockup welcome-brand"><strong>Gahookz</strong></div>
        <span className="offline-pill">Offline</span>
      </header>

      {recovered ?
        <section className="offline-recovered" role="status" aria-live="assertive">
          <div>
            <span>Server found</span>
            <strong>Gahookz is back online</strong>
          </div>
          <button type="button" onClick={onReturnOnline}>Get back online</button>
        </section> :
        <section className="offline-message" role="status">
          <span>Server down</span>
          <h1>No lobby, still Gahooky.</h1>
          <p>Gahook the dev IRL until the server comes back, or chase a high score while you wait.</p>
        </section>}

      <GahookDash />
    </main>
  );
}

export function GahookDash({ roomMode = false, ownPlayer = null, players = [], onState = null }) {
  const canvasRef = useRef(null);
  const crashTimerRef = useRef(null);
  const onStateRef = useRef(onState);
  const roomPlayersRef = useRef(players);
  const initialFormId = ownPlayer?.gahookForm || getStoredGahookForm();
  const [selectedFormId, setSelectedFormId] = useState(initialFormId);
  const gameRef = useRef(null);
  if (!gameRef.current) gameRef.current = createGameState(false, initialFormId);
  const [status, setStatus] = useState("ready");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => roomMode ? Math.max(0, ownPlayer?.dashTopScore || 0) : readHighScore());
  const [crashPoke, setCrashPoke] = useState(null);
  const interactive = !roomMode || Boolean(ownPlayer?.id && onState);

  onStateRef.current = onState;
  roomPlayersRef.current = players;

  const focusCanvas = (canvas = canvasRef.current) => {
    if (!canvas) return;
    try {
      canvas.focus({ preventScroll: true });
    } catch (_error) {
      canvas.focus();
    }
  };

  useEffect(() => {
    if (!roomMode || !ownPlayer) return;
    const formId = ownPlayer.gahookForm || "monkey";
    setSelectedFormId(formId);
    gameRef.current.playerFormId = formId;
    setHighScore((previous) => Math.max(previous, ownPlayer.dashTopScore || 0));
  }, [roomMode, ownPlayer?.gahookForm, ownPlayer?.dashTopScore, ownPlayer?.id]);

  useEffect(() => () => {
    if (roomMode && gameRef.current?.running) {
      onStateRef.current?.({ running: false, score: Math.floor(gameRef.current.score), playerY: gameRef.current.playerY, runId: gameRef.current.runId });
    }
  }, [roomMode]);

  const startGame = () => {
    if (!interactive) return;
    clearTimeout(crashTimerRef.current);
    setCrashPoke(null);
    gameRef.current = createGameState(true, selectedFormId);
    setScore(0);
    setStatus("running");
    if (roomMode) onStateRef.current?.({ running: true, score: 0, playerY: 0, runId: gameRef.current.runId });
    playDashStartSound();
    requestAnimationFrame(() => focusCanvas());
  };

  const beginJump = () => {
    const game = gameRef.current;
    if (!game.running) return;
    if (game.playerY < -0.5) {
      game.jumpQueuedUntil = game.elapsed + DASH_JUMP_BUFFER_MS;
      return;
    }
    game.jumpQueuedUntil = 0;
    game.jumpHeld = true;
    game.jumpHoldMs = 0;
    game.playerVelocity = -500;
    game.playerY = -1;
    playDashJumpSound();
  };

  const releaseJump = () => {
    const game = gameRef.current;
    if (!game.jumpHeld) return;
    const wasLongJump = game.jumpHoldMs >= 105;
    game.jumpHeld = false;
    if (wasLongJump) playDashBoostSound();
  };

  const handlePointerDown = (event) => {
    event.preventDefault();
    focusCanvas();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch (_error) {}
    beginJump();
  };

  const handleKeyDown = (event) => {
    if (event.code !== "Space" && event.code !== "ArrowUp") return;
    if (!interactive || !gameRef.current.running) return;
    event.preventDefault();
    if (!event.repeat) beginJump();
  };

  const handleKeyUp = (event) => {
    if (event.code !== "Space" && event.code !== "ArrowUp") return;
    if (!interactive || (!gameRef.current.running && !gameRef.current.jumpHeld)) return;
    event.preventDefault();
    releaseJump();
  };

  const chooseCharacter = (formId) => {
    if (status === "running" || status === "gahooked") return;
    const stored = storeGahookForm(formId);
    setSelectedFormId(stored);
    gameRef.current.playerFormId = stored;
    gameRef.current.obstacleSequence = createDashObstacleSequence(0);
    gameRef.current.obstacleSequenceIndex = 0;
    playDashCharacterSound(stored);
  };

  useEffect(() => () => clearTimeout(crashTimerRef.current), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return undefined;
    let frame = 0;
    let lastUiScore = -1;
    let lastRoomReportAt = 0;

    const resize = () => {
      const width = Math.max(280, parent.clientWidth);
      const height = Math.max(250, Math.min(390, Math.round(width * 0.47)));
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.height = height + "px";
      canvas.dataset.cssWidth = String(width);
      canvas.dataset.cssHeight = String(height);
    };
    resize();
    const observer = "ResizeObserver" in window ? new ResizeObserver(resize) : null;
    observer?.observe(parent);
    window.addEventListener("resize", resize);

    const render = (time) => {
      const width = Number(canvas.dataset.cssWidth) || parent.clientWidth;
      const height = Number(canvas.dataset.cssHeight) || 300;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const context = canvas.getContext("2d");
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const game = gameRef.current;
      updateOfflineGame(game, time, width, height);
      drawOfflineGame(context, game, width, height, time, roomMode ? roomPlayersRef.current : [], ownPlayer?.id || "");

      const nextScore = Math.floor(game.score);
      if (nextScore !== lastUiScore && nextScore % 2 === 0) {
        lastUiScore = nextScore;
        setScore(nextScore);
        setHighScore((previous) => Math.max(previous, nextScore));
      }
      if (roomMode && game.running && time - lastRoomReportAt >= 220) {
        lastRoomReportAt = time;
        onStateRef.current?.({ running: true, score: nextScore, playerY: game.playerY, runId: game.runId });
      }
      if (game.crashed && status === "running") {
        game.crashed = false;
        const finalScore = Math.floor(game.score);
        const hitFormId = game.hitFormId || "monkey";
        const hitIsBird = game.hitKind === "congrats";
        const poke = {
          id: "offline-crash-" + Date.now(),
          createdAt: Date.now(),
          from: hitIsBird ? "Congratulations Bird" : getGahookForm(hitFormId).label,
          message: "Caught you in Gahook Dash",
          kind: hitIsBird ? "congrats" : "normal",
          gahookForm: hitFormId
        };
        setScore(finalScore);
        setStatus("gahooked");
        setCrashPoke(poke);
        playDashCrashSound(hitFormId, hitIsBird);
        setHighScore((previous) => {
          const next = Math.max(previous, finalScore);
          if (!roomMode) writeHighScore(next);
          return next;
        });
        if (roomMode) onStateRef.current?.({ running: false, crashed: true, score: finalScore, playerY: game.playerY, runId: game.runId });
        navigator.vibrate?.([70, 35, 110]);
        crashTimerRef.current = setTimeout(() => {
          setCrashPoke(null);
          setStatus("crashed");
        }, 1150);
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [status, roomMode, ownPlayer?.id]);

  const selectorDisabled = status === "running" || status === "gahooked";
  const selectedForm = getGahookForm(selectedFormId);
  const roomScores = roomMode ? [...players].sort((a, b) => (b.dashTopScore || 0) - (a.dashTopScore || 0) || a.name.localeCompare(b.name)) : [];

  return (
    <section className={roomMode ? "offline-game-card room-dash-card" : "offline-game-card"}>
      <div className="offline-game-heading">
        <div>
          <span>{roomMode ? "Room game" : "Offline game"}</span>
          <h2>Gahook Dash</h2>
        </div>
        <div className="offline-scoreboard" aria-live="polite">
          <span><small>Score</small><strong>{score}</strong></span>
          <span><small>Best</small><strong>{highScore}</strong></span>
        </div>
      </div>

      {!roomMode ? <div className="offline-character-area">
        <strong>Choose your runner</strong>
        <div className="offline-character-picker" role="group" aria-label="Choose your Gahook Dash character">
          {GAHOOK_FORMS.map((form) => (
            <button
              type="button"
              key={form.id}
              className={(selectedFormId === form.id ? "selected " : "") + "offline-character-" + form.id}
              aria-pressed={selectedFormId === form.id}
              disabled={selectorDisabled}
              onClick={() => chooseCharacter(form.id)}
            >
              <GahookFormVisual form={form} small />
              <span>{form.label}</span>
            </button>
          ))}
        </div>
      </div> : ownPlayer ? <div className="room-dash-runner"><GahookFormVisual form={selectedForm} small /><span>Running as <strong>{selectedForm.label}</strong></span></div> : null}

      <div className="offline-canvas-wrap">
        <canvas
          ref={canvasRef}
          tabIndex={interactive ? 0 : -1}
          onPointerDown={handlePointerDown}
          onPointerUp={releaseJump}
          onPointerCancel={releaseJump}
          onLostPointerCapture={releaseJump}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onBlur={releaseJump}
          onContextMenu={(event) => event.preventDefault()}
          aria-keyshortcuts="Space ArrowUp"
          aria-label="Gahook Dash game. Tap lightly for a small jump or hold for a full jump. Focus this game to use Space or Arrow Up."
        />
        {status === "ready" || status === "crashed" ?
          <div className="offline-game-overlay">
            <strong>{!interactive ? "Join as a player to run" : status === "crashed" ? "YOU GOT GOT" : "Ready to Gahook?"}</strong>
            {interactive ? <button type="button" onClick={startGame}>{status === "crashed" ? "Run again" : "Start game"}</button> : null}
          </div> : null}
      </div>
      <p
        className={`offline-game-hint ${interactive ? "is-interactive" : ""}`}
        role="button"
        tabIndex={interactive ? 0 : -1}
        aria-label="Jump in Gahook Dash. Tap for a hop or hold for a full jump."
        aria-disabled={!interactive}
        onPointerDown={handlePointerDown}
        onPointerUp={releaseJump}
        onPointerCancel={releaseJump}
        onLostPointerCapture={releaseJump}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onBlur={releaseJump}
      ><strong>Tap</strong> for a hop. <strong>Hold</strong> for a full jump. Space works too.</p>
      {roomMode ? <div className="room-dash-scores" aria-label="Room Gahook Dash top scores">
        <strong>Room bests</strong>
        <div>{roomScores.map((player) => <span key={player.id}><GahookFormVisual form={getGahookForm(player.gahookForm)} small /><b>{player.name}</b><em>{player.dashTopScore || 0}</em></span>)}</div>
      </div> : null}
      {crashPoke ? <PokeJumpScare poke={crashPoke} /> : null}
    </section>
  );
}

function createGameState(running = false, playerFormId = "monkey") {
  return {
    running,
    runId: "dash-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    crashed: false,
    lastTime: 0,
    playerFormId,
    playerY: 0,
    playerVelocity: 0,
    jumpHeld: false,
    jumpHoldMs: 0,
    jumpQueuedUntil: 0,
    score: 0,
    obstacles: [],
    obstacleSequence: createDashObstacleSequence(0),
    obstacleSequenceIndex: 0,
    obstacleCycle: 0,
    nextObstacleAt: 940,
    nextScoreSound: 25,
    elapsed: 0,
    groundPulse: 0,
    hitFormId: null,
    hitKind: null
  };
}

function updateOfflineGame(game, time, width, height) {
  if (!game.lastTime) game.lastTime = time;
  const delta = Math.min(0.035, Math.max(0, (time - game.lastTime) / 1000));
  game.lastTime = time;
  if (!game.running) return;

  game.elapsed += delta * 1000;
  game.score += delta * 12;
  game.groundPulse += delta;
  const groundY = height - 49;
  const playerHeight = 56;
  if (game.jumpHeld && game.jumpHoldMs < 180 && game.playerVelocity < 0) {
    game.jumpHoldMs += delta * 1000;
    game.playerVelocity += 600 * delta;
  } else {
    game.jumpHeld = false;
    game.playerVelocity += 1840 * delta;
  }
  game.playerY += game.playerVelocity * delta;
  if (game.playerY > 0) {
    const useQueuedJump = game.jumpQueuedUntil >= game.elapsed;
    game.jumpQueuedUntil = 0;
    if (useQueuedJump) {
      game.playerY = -1;
      game.playerVelocity = -500;
      game.jumpHeld = false;
      game.jumpHoldMs = 0;
      playDashJumpSound();
    } else {
      game.playerY = 0;
      game.playerVelocity = 0;
      game.jumpHeld = false;
    }
  }

  if (game.score >= game.nextScoreSound) {
    playDashScoreSound();
    game.nextScoreSound += 25;
  }

  const speed = Math.min(540, 275 + game.score * 0.72);
  game.nextObstacleAt -= delta * 1000;
  if (game.nextObstacleAt <= 0) {
    const obstacle = createDashObstacle(game, width);
    game.obstacles.push(obstacle);
    if (obstacle.flying) playDashBirdSound(obstacle.kind === "congrats");
    game.nextObstacleAt = Math.max(690, 1370 - game.score * 2.25) + Math.random() * 520;
  }

  const playerX = Math.max(34, Math.min(86, width * 0.16));
  game.obstacles.forEach((obstacle) => {
    if (obstacle.formId === "croc" && obstacle.x > playerX + 175 && game.elapsed >= obstacle.nextSpeedChangeAt) {
      obstacle.speedMultiplier = 0.72 + Math.random() * 0.72;
      obstacle.nextSpeedChangeAt = game.elapsed + 170 + Math.random() * 360;
    } else if (obstacle.formId === "croc" && obstacle.x <= playerX + 175) {
      obstacle.speedMultiplier = 1;
    }
    obstacle.x -= speed * (obstacle.speedMultiplier || 1) * delta;
    if (obstacle.formId === "chicken") {
      const transitionSpan = Math.max(210, width * 0.42);
      const progress = Math.max(0, Math.min(1, (obstacle.transitionStartX - obstacle.x) / transitionSpan));
      obstacle.airborneHeight = obstacle.startsFlying ? obstacle.flightHeight * (1 - progress) : obstacle.flightHeight * progress;
      obstacle.flying = obstacle.airborneHeight > 12;
    }
    obstacle.bob = obstacle.flying ? Math.sin(game.elapsed * 0.008 + obstacle.bobPhase) * 7 : 0;
  });
  game.obstacles = game.obstacles.filter((obstacle) => obstacle.x + obstacle.width > -28);

  const playerTop = groundY - playerHeight + game.playerY;
  const playerBox = { x: playerX + 7, y: playerTop + 7, width: 40, height: 44 };
  const hit = game.obstacles.find((obstacle) => {
    const obstacleTop = getDashObstacleTop(obstacle, groundY);
    const obstacleBox = {
      x: obstacle.x + 6,
      y: obstacleTop + 5,
      width: obstacle.width - 12,
      height: obstacle.height - 9
    };
    return boxesOverlap(playerBox, obstacleBox);
  });
  if (hit) {
    game.running = false;
    game.jumpHeld = false;
    game.jumpQueuedUntil = 0;
    game.crashed = true;
    game.hitFormId = hit.formId;
    game.hitKind = hit.kind;
  }
}

function createDashObstacle(game, width) {
  const obstacleType = chooseDashObstacleForm(game);
  if (obstacleType === "bird") {
    return {
      x: width + 50,
      width: 66,
      height: 43,
      formId: "monkey",
      kind: "congrats",
      flying: true,
      flightHeight: Math.random() > 0.5 ? 112 : 142,
      bob: 0,
      bobPhase: Math.random() * Math.PI * 2
    };
  }
  const formId = obstacleType;
  const isChicken = formId === "chicken";
  const startsFlying = isChicken && Math.random() > 0.5;
  const sizeScale = formId === "gorilla" ? 1.3 : formId === "croc" ? 1.2 : 1;
  const widthScale = formId === "koala" ? 1.5 : sizeScale;
  const heightScale = formId === "koala" ? 0.9 : sizeScale;
  return {
    x: width + 45,
    width: Math.round((isChicken ? 64 : 58) * widthScale),
    height: Math.round((isChicken ? 52 : 56) * heightScale),
    formId,
    kind: "gahook",
    flying: startsFlying,
    sleeping: formId === "koala",
    startsFlying,
    airborneHeight: startsFlying ? (Math.random() > 0.5 ? 110 : 140) : 0,
    flightHeight: isChicken ? (Math.random() > 0.5 ? 110 : 140) : 0,
    transitionStartX: width * (0.7 + Math.random() * 0.08),
    speedMultiplier: formId === "gorilla" ? 1.3 : formId === "croc" ? 0.82 + Math.random() * 0.5 : 1,
    nextSpeedChangeAt: game.elapsed + 150 + Math.random() * 300,
    bob: 0,
    bobPhase: Math.random() * Math.PI * 2
  };
}

function chooseDashObstacleForm(game) {
  if (!Array.isArray(game.obstacleSequence) || game.obstacleSequenceIndex >= game.obstacleSequence.length) {
    game.obstacleCycle += 1;
    game.obstacleSequence = createDashObstacleSequence(game.obstacleCycle);
    game.obstacleSequenceIndex = 0;
  }
  const formId = game.obstacleSequence[game.obstacleSequenceIndex] || "monkey";
  game.obstacleSequenceIndex += 1;
  return formId;
}

function shuffleDashForms(values) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function createDashObstacleSequence(cycle = 0) {
  const all = ["monkey", "capybara", "bird", "koala", "gorilla", "chicken", "croc"];
  if (cycle > 0) {
    return shuffleDashForms([...all, ...Array.from({ length: 5 }, () => all[Math.floor(Math.random() * all.length)])]);
  }

  const sequence = Array(12).fill("");
  sequence[0] = Math.random() > 0.5 ? "monkey" : "capybara";
  sequence[1] = Math.random() > 0.5 ? "bird" : "koala";
  sequence[5] = "chicken";
  sequence[9] = "croc";
  const missing = shuffleDashForms(all.filter((id) => !sequence.includes(id)));
  const earlySlots = [2, 3, 4];
  const laterSlots = [6, 7, 8, 10, 11];
  [...earlySlots, ...laterSlots].forEach((slot) => {
    const allowed = slot < 5 ? all.filter((id) => id !== "chicken" && id !== "croc") : slot < 9 ? all.filter((id) => id !== "croc") : all;
    const requiredIndex = missing.findIndex((id) => allowed.includes(id));
    sequence[slot] = requiredIndex >= 0 ? missing.splice(requiredIndex, 1)[0] : allowed[Math.floor(Math.random() * allowed.length)];
  });
  return sequence;
}

function getDashObstacleTop(obstacle, groundY) {
  if (obstacle.kind === "congrats") return groundY - obstacle.flightHeight + obstacle.bob;
  if (obstacle.formId === "chicken") return groundY - obstacle.height - (obstacle.airborneHeight || 0) + obstacle.bob;
  return groundY - obstacle.height;
}

function boxesOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function drawOfflineGame(context, game, width, height, time, roomPlayers = [], ownPlayerId = "") {
  context.clearRect(0, 0, width, height);
  const sky = context.createLinearGradient(0, 0, width, height);
  sky.addColorStop(0, "#251430");
  sky.addColorStop(0.52, "#073b59");
  sky.addColorStop(1, "#08745f");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  drawSpeedLines(context, width, height, time, game.running);
  const groundY = height - 49;
  context.fillStyle = "rgba(7, 16, 28, 0.88)";
  context.fillRect(0, groundY, width, height - groundY);
  context.fillStyle = "#ffdf45";
  context.fillRect(0, groundY, width, 5);
  context.fillStyle = "rgba(0, 191, 216, 0.34)";
  for (let x = -40 + ((time * 0.18) % 40); x < width + 40; x += 40) {
    context.fillRect(x, groundY + 21, 23, 4);
  }

  game.obstacles.forEach((obstacle) => drawDashObstacle(context, obstacle, groundY, time));
  const playerX = Math.max(34, Math.min(86, width * 0.16));
  drawRemoteDashPlayers(context, roomPlayers, ownPlayerId, playerX, groundY, time);
  const playerTop = groundY - 56 + game.playerY;
  drawDashCharacter(context, game.playerFormId, playerX, playerTop, time, game.playerY < -2, 1);

  if (!game.running && !game.score) {
    context.fillStyle = "rgba(255,255,255,0.58)";
    context.font = "900 14px system-ui";
    context.textAlign = "right";
    context.fillText(roomPlayers.length ? "ROOM TRACK" : "OFFLINE TRACK", width - 18, 27);
  }
}

function drawSpeedLines(context, width, height, time, moving) {
  const shift = moving ? (time * 0.13) % 170 : 0;
  context.save();
  context.globalAlpha = 0.18;
  context.lineWidth = 4;
  ["#ff3d8b", "#00bfd8", "#ffdf45"].forEach((color, index) => {
    context.strokeStyle = color;
    for (let line = 0; line < 4; line += 1) {
      const y = 58 + index * 47 + line * 73;
      const x = width - ((shift + line * 170 + index * 48) % (width + 170));
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + 72, y);
      context.stroke();
    }
  });
  context.restore();
}

function drawDashObstacle(context, obstacle, groundY, time) {
  const top = getDashObstacleTop(obstacle, groundY);
  if (obstacle.kind === "congrats") {
    drawCongratsBird(context, obstacle.x, top, time, obstacle.width / 66);
    return;
  }
  if (obstacle.formId === "koala" && obstacle.sleeping) {
    drawSleepingKoala(context, obstacle.x, top, time, obstacle.width / 87);
    return;
  }
  if (obstacle.formId === "chicken" && obstacle.flying) {
    drawFlyingChicken(context, obstacle.x, top, time, obstacle.width / 64);
    return;
  }
  drawDashCharacter(context, obstacle.formId, obstacle.x, top, time, false, obstacle.width / 58);
}

function drawRemoteDashPlayers(context, players, ownPlayerId, playerX, groundY, time) {
  const runners = players.filter((player) => player.id !== ownPlayerId && player.connected && player.dashRunning).slice(0, 7);
  runners.forEach((player, index) => {
    const scale = Math.max(0.58, 0.76 - index * 0.025);
    const x = Math.max(8, playerX - 24 - index * 17);
    const y = groundY - 56 * scale + Math.max(-230, Math.min(0, player.dashPlayerY || 0));
    context.save();
    context.globalAlpha = 0.72;
    drawDashCharacter(context, player.gahookForm || "monkey", x, y, time - index * 70, (player.dashPlayerY || 0) < -2, scale);
    context.fillStyle = "rgba(9, 12, 20, 0.82)";
    context.font = "900 10px system-ui";
    context.textAlign = "center";
    const label = String(player.name || "Runner").slice(0, 10);
    context.fillText(label, x + 29 * scale, Math.max(12, y - 5));
    context.restore();
  });
}

function drawSleepingKoala(context, x, y, time, scale = 1) {
  const breathe = Math.sin(time * 0.006) * 1.5;
  context.save();
  context.translate(x, y + 10 - breathe);
  context.scale(scale, scale);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.fillStyle = "#aeb7c0";
  context.strokeStyle = "#171019";
  context.lineWidth = 4;
  context.beginPath();
  context.ellipse(47, 28, 38, 20 + breathe * 0.25, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#7d8793";
  context.beginPath();
  context.arc(14, 20, 13, 0, Math.PI * 2);
  context.arc(37, 17, 12, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#cbd2d8";
  context.beginPath();
  context.ellipse(27, 25, 22, 18, -0.1, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.strokeStyle = "#30343a";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(19, 25, 5, 0.18, Math.PI - 0.18);
  context.arc(34, 23, 5, 0.18, Math.PI - 0.18);
  context.stroke();
  context.fillStyle = "#30343a";
  context.beginPath();
  context.ellipse(29, 32, 6, 5, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "rgba(255,255,255,0.82)";
  context.font = "1000 11px system-ui";
  context.fillText("z", 56, 6 + Math.sin(time * 0.004) * 2);
  context.fillText("Z", 70, -2 + Math.sin(time * 0.004 + 1) * 3);
  context.restore();
}

function drawDashCharacter(context, formId, x, y, time, airborne, scale = 1) {
  const step = Math.sin(time * 0.022) * 5;
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "#171019";
  context.lineWidth = 6;
  context.beginPath();
  context.moveTo(19, 44);
  context.lineTo(airborne ? 10 : 13 + step, airborne ? 51 : 56);
  context.moveTo(39, 44);
  context.lineTo(airborne ? 48 : 45 - step, airborne ? 51 : 56);
  context.stroke();

  if (formId === "gorilla") drawDashGorilla(context);
  else if (formId === "koala") drawDashKoala(context);
  else if (formId === "croc") drawDashCroc(context);
  else if (formId === "capybara") drawDashCapybara(context);
  else if (formId === "chicken") drawDashChicken(context, time);
  else drawDashMonkey(context);
  context.restore();
}

function drawDashMonkey(context) {
  context.fillStyle = "#7a4a27";
  context.strokeStyle = "#171019";
  context.lineWidth = 4;
  context.beginPath();
  context.arc(8, 21, 10, 0, Math.PI * 2);
  context.arc(50, 21, 10, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#9a5e32";
  roundedRect(context, 6, 6, 46, 43, 18);
  context.fill();
  context.stroke();
  context.fillStyle = "#f1c69a";
  context.beginPath();
  context.ellipse(29, 29, 17, 14, 0, 0, Math.PI * 2);
  context.fill();
  drawDashEyes(context, 22, 35, 22);
  context.beginPath();
  context.arc(29, 31, 4, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#171019";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(29, 32, 9, 0.2, Math.PI - 0.2);
  context.stroke();
  context.fillStyle = "#ff3d8b";
  context.fillRect(38, 2, 14, 8);
  context.fillStyle = "#ffdf45";
  context.fillRect(42, -3, 6, 13);
}

function drawDashGorilla(context) {
  context.fillStyle = "#3a2024";
  context.strokeStyle = "#0f0b0d";
  context.lineWidth = 5;
  context.beginPath();
  context.arc(7, 23, 11, 0, Math.PI * 2);
  context.arc(51, 23, 11, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#5b2d32";
  roundedRect(context, 5, 4, 48, 46, 17);
  context.fill();
  context.stroke();
  context.fillStyle = "#ba6d62";
  context.beginPath();
  context.ellipse(29, 32, 18, 13, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#171019";
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(14, 17);
  context.lineTo(25, 21);
  context.moveTo(44, 17);
  context.lineTo(33, 21);
  context.stroke();
  context.fillStyle = "#ff564f";
  context.beginPath();
  context.arc(22, 23, 3, 0, Math.PI * 2);
  context.arc(36, 23, 3, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#171019";
  roundedRect(context, 20, 34, 18, 7, 3);
  context.fill();
}

function drawDashKoala(context) {
  context.fillStyle = "#aeb7c0";
  context.strokeStyle = "#171019";
  context.lineWidth = 4;
  context.beginPath();
  context.arc(8, 19, 13, 0, Math.PI * 2);
  context.arc(50, 19, 13, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#7d8793";
  context.beginPath();
  context.arc(8, 19, 7, 0, Math.PI * 2);
  context.arc(50, 19, 7, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#cbd2d8";
  roundedRect(context, 5, 5, 48, 45, 20);
  context.fill();
  context.stroke();
  drawDashEyes(context, 21, 37, 22);
  context.fillStyle = "#30343a";
  context.beginPath();
  context.ellipse(29, 31, 7, 9, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#4c9a55";
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(47, 39);
  context.lineTo(56, 52);
  context.stroke();
}

function drawDashCroc(context) {
  context.fillStyle = "#45b978";
  context.strokeStyle = "#10241a";
  context.lineWidth = 4;
  roundedRect(context, 2, 9, 56, 39, 15);
  context.fill();
  context.stroke();
  context.fillStyle = "#83e4a8";
  roundedRect(context, 20, 27, 38, 18, 8);
  context.fill();
  context.stroke();
  context.fillStyle = "#0b1720";
  roundedRect(context, 9, 16, 19, 10, 4);
  context.fill();
  roundedRect(context, 31, 16, 19, 10, 4);
  context.fill();
  context.strokeStyle = "#0b1720";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(27, 20);
  context.lineTo(32, 20);
  context.stroke();
  context.fillStyle = "#ffffff";
  for (let tooth = 0; tooth < 4; tooth += 1) {
    context.beginPath();
    context.moveTo(28 + tooth * 7, 39);
    context.lineTo(31 + tooth * 7, 45);
    context.lineTo(34 + tooth * 7, 39);
    context.fill();
  }
  context.strokeStyle = "#f2c43d";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(37, 8);
  context.lineTo(49, -1);
  context.stroke();
}

function drawDashCapybara(context) {
  context.fillStyle = "#a66b3f";
  context.strokeStyle = "#21150e";
  context.lineWidth = 4;
  context.beginPath();
  context.arc(12, 13, 7, 0, Math.PI * 2);
  context.arc(44, 13, 7, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  roundedRect(context, 5, 7, 49, 42, 16);
  context.fill();
  context.stroke();
  context.fillStyle = "#d99a66";
  roundedRect(context, 25, 28, 34, 17, 8);
  context.fill();
  context.stroke();
  drawDashEyes(context, 20, 39, 22);
  context.fillStyle = "#21150e";
  context.beginPath();
  context.arc(51, 35, 4, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#ffdf45";
  context.strokeStyle = "#21150e";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(1, 28);
  context.lineTo(-10, 23);
  context.lineTo(-10, 37);
  context.closePath();
  context.fill();
  context.stroke();
}

function drawDashChicken(context, time) {
  const wing = Math.sin(time * 0.025) * 4;
  context.fillStyle = "#fffbe8";
  context.strokeStyle = "#171019";
  context.lineWidth = 4;
  context.beginPath();
  context.arc(28, 28, 24, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#ffcf1c";
  context.beginPath();
  context.arc(7, 34 + wing, 10, 0, Math.PI * 2);
  context.arc(49, 34 - wing, 10, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#ef3d37";
  context.beginPath();
  context.arc(20, 4, 7, 0, Math.PI * 2);
  context.arc(29, 1, 8, 0, Math.PI * 2);
  context.arc(38, 5, 7, 0, Math.PI * 2);
  context.fill();
  drawDashEyes(context, 21, 36, 22);
  context.fillStyle = "#ff8a00";
  context.beginPath();
  context.moveTo(24, 30);
  context.lineTo(40, 34);
  context.lineTo(24, 39);
  context.closePath();
  context.fill();
  context.stroke();
}

function drawDashEyes(context, leftX, rightX, y) {
  context.fillStyle = "#171019";
  context.beginPath();
  context.arc(leftX, y, 3, 0, Math.PI * 2);
  context.arc(rightX, y, 3, 0, Math.PI * 2);
  context.fill();
}

function drawFlyingChicken(context, x, y, time, scale = 1) {
  const flap = Math.sin(time * 0.035) * 12;
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  context.fillStyle = "#ffcf1c";
  context.strokeStyle = "#171019";
  context.lineWidth = 4;
  context.beginPath();
  context.ellipse(8, 25, 17, 8 + Math.abs(flap) * 0.3, -0.38, 0, Math.PI * 2);
  context.ellipse(52, 25, 17, 8 + Math.abs(flap) * 0.3, 0.38, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  drawDashChicken(context, time);
  context.restore();
}

function drawCongratsBird(context, x, y, time, scale = 1) {
  const flap = Math.sin(time * 0.036) * 13;
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  context.strokeStyle = "#13121b";
  context.lineWidth = 4;
  context.fillStyle = "#40c9e8";
  context.beginPath();
  context.ellipse(8, 25, 19, 7 + Math.abs(flap) * 0.32, -0.45, 0, Math.PI * 2);
  context.ellipse(55, 25, 19, 7 + Math.abs(flap) * 0.32, 0.45, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#89e5f6";
  context.beginPath();
  context.ellipse(31, 25, 25, 20, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(24, 20, 6, 0, Math.PI * 2);
  context.arc(38, 20, 6, 0, Math.PI * 2);
  context.fill();
  drawDashEyes(context, 24, 38, 20);
  context.fillStyle = "#ffdf45";
  context.beginPath();
  context.moveTo(27, 28);
  context.lineTo(42, 32);
  context.lineTo(27, 36);
  context.closePath();
  context.fill();
  context.stroke();
  context.strokeStyle = "#ff3d8b";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(31, 28, 13, 0.3, Math.PI - 0.3);
  context.stroke();
  context.restore();
}

function playDashStartSound() {
  const context = getAudioContext();
  if (!context) return;
  context.resume?.();
  const start = context.currentTime + 0.01;
  [330, 494, 659].forEach((frequency, index) => playTone(context, frequency, start + index * 0.06, 0.11, "square", 0.055));
}

function playDashJumpSound() {
  const context = getAudioContext();
  if (!context) return;
  context.resume?.();
  const start = context.currentTime + 0.005;
  playTone(context, 260, start, 0.11, "square", 0.055);
  playTone(context, 520, start + 0.035, 0.1, "triangle", 0.05);
}

function playDashBoostSound() {
  const context = getAudioContext();
  if (!context) return;
  const start = context.currentTime + 0.005;
  playTone(context, 620, start, 0.09, "triangle", 0.035);
  playTone(context, 880, start + 0.035, 0.08, "sine", 0.03);
}

function playDashBirdSound(congratsBird) {
  const context = getAudioContext();
  if (!context) return;
  context.resume?.();
  const start = context.currentTime + 0.01;
  const base = congratsBird ? 920 : 680;
  playTone(context, base, start, 0.08, "triangle", 0.025);
  playTone(context, base * 1.38, start + 0.055, 0.1, "triangle", 0.025);
}

function playDashScoreSound() {
  const context = getAudioContext();
  if (!context) return;
  const start = context.currentTime + 0.005;
  playTone(context, 880, start, 0.08, "sine", 0.026);
  playTone(context, 1175, start + 0.05, 0.09, "triangle", 0.028);
}

function playDashCharacterSound(formId) {
  const context = getAudioContext();
  if (!context) return;
  context.resume?.();
  const index = Math.max(0, GAHOOK_FORMS.findIndex((form) => form.id === formId));
  const start = context.currentTime + 0.005;
  playTone(context, 310 + index * 75, start, 0.1, "triangle", 0.035);
  playNoiseBurst(context, start + 0.04, 0.055, 0.025);
}

function playDashCrashSound(formId, congratsBird) {
  const channel = resetPokeSoundChannel();
  if (congratsBird) {
    playCongratsSound(channel);
    return;
  }
  playGahookFormSound(formId, channel);
  playGahookVoiceCue(channel);
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function readHighScore() {
  try {
    return Math.max(0, Number(localStorage.getItem(OFFLINE_HIGH_SCORE_KEY)) || 0);
  } catch (_error) {
    return 0;
  }
}

function writeHighScore(score) {
  try {
    localStorage.setItem(OFFLINE_HIGH_SCORE_KEY, String(score));
  } catch (_error) {
    return;
  }
}
