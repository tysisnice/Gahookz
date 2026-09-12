import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Provider, useDispatch, useSelector } from "react-redux";
import { createStore } from "redux";
import { effectsMuted, setEffectsMuted, setEffectsReducedPreference, useMutePreference, useReducedEffectsPreference } from "./client/preferences.jsx";
import { OfflineExperience, ServerUpdateExperience, useServerConnection } from "./client/offline.jsx";
import { GAHOOK_FORMS, getGahookForm, getStoredGahookForm, storeGahookForm } from "./client/gahook-forms.js";
import { createApiClient, createLiveConnection, createSnapshotGate, connectionMessage, describeSnapshotCompatibility, nextClockOffset } from "./client/net.ts";
import { FactCheckPanel, HerdRevealBreakdown, MajorityRevealBreakdown, PromptText, tieBreakLabel } from "./client/reveal.jsx";
import {
  installGahookWarmup,
  playAnswerOohSound,
  playBooSound,
  playCongratsSound,
  playCounterGahookSound,
  playGahookFormSound,
  playGahookVoiceCue,
  playGetGotSound,
  playMonkeyPokeSound,
  playUltimateExtraGahookSound,
  playUltimateCongratsExtraSound,
  playUltimateCongratsSound,
  playUltimateGahookSound,
  playVictoryPartySound,
  resetPokeSoundChannel,
  setGameMusicState,
  stopCustomGahookAudio,
  speakText
} from "./client/audio.js";
import { GahookFormVisual, GahookOverlayVisual, PokeJumpScare } from "./client/presentation.jsx";
import { ArenaSpectator, ArenaOverlay } from "./client/arena.jsx";
import { GameTutorial } from "./client/tutorial.jsx";
import { SimplePaintEditor } from "./client/drawing.jsx";
import { WaitingRoomSocial } from "./client/social.jsx";
import { RoomQrCode } from "./client/qr.jsx";
import { CustomGahookCreator } from "./client/custom-gahook.jsx";
import { InformationHub } from "./client/information.jsx";
import { LegalHub } from "./client/legal.jsx";

const CLIENT_KEY = "gahookz-client-key";
const createPortal = (...args) => window.ReactDOM.createPortal(...args);
const JOIN_KEY = "gahookz-last-join";
const ULTIMATE_GAHOOK_GRACE_MS = 1000;
const GET_GOT_OVERLAY_MS = 3000;
const GAHOOK_STEAL_POINTS = 50;
const CONGRATS_OVERLAY_MS = 1800;
const BOO_OVERLAY_MS = 1600;
// Must match SNAPSHOT_SCHEMA_VERSION in packages/contracts.
const SNAPSHOT_SCHEMA_VERSION = 1;
const SNAPSHOT_CATCHUP_MS = 0;
// The adapter in ./client/net.ts takes its timers as a dependency so its
// ordering and cleanup can be tested without a browser. These are the real
// ones; the tests pass fakes.
const browserTimers = {
  setTimeout: (handler, ms) => window.setTimeout(handler, ms),
  clearTimeout: (handle) => window.clearTimeout(handle),
  setInterval: (handler, ms) => window.setInterval(handler, ms),
  clearInterval: (handle) => window.clearInterval(handle)
};
const STALE_GAHOOK_MS = 4500;
const REVEAL_ANSWER_SPOTLIGHT_MS = 4500;
const ANSWER_IDS = ["red", "blue", "yellow", "green"];

function useModalBodyLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    const scrollY = window.scrollY;
    const root = document.documentElement;
    const previous = {
      rootOverflow: root.style.overflow,
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width
    };
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    return () => {
      root.style.overflow = previous.rootOverflow;
      document.body.style.overflow = previous.overflow;
      document.body.style.position = previous.position;
      document.body.style.top = previous.top;
      document.body.style.width = previous.width;
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}

function pokeOverlayDurationMs(poke) {
  const now = Date.now();
  if ((poke?.counterOfferUntil || 0) > now) return Math.max(950, poke.counterOfferUntil - now);
  if (poke?.kind === "ultimate-congrats") return Math.max(ULTIMATE_GAHOOK_GRACE_MS, (poke.ultimateUntil || now + ULTIMATE_GAHOOK_GRACE_MS) - now);
  if (poke?.kind === "congrats") return CONGRATS_OVERLAY_MS;
  if (poke?.kind === "boo") return BOO_OVERLAY_MS;
  if (poke?.kind === "counter") return 2750;
  if (poke?.kind === "duel-challenge") return Math.max(0, (poke.duelChallengeUntil || now + 6500) - now);
  if (poke?.kind === "get-got") return Math.max(0, (poke.getGotUntil || now + GET_GOT_OVERLAY_MS) - now);
  if (poke?.kind === "ultimate") return Math.max(ULTIMATE_GAHOOK_GRACE_MS, (poke.ultimateUntil || now + ULTIMATE_GAHOOK_GRACE_MS) - now);
  return 950;
}
const AVATAR_BASE = [
{ id: "zap", label: "Zap", mark: "ZP", background: "#ff3d8b", accent: "#ffdf45", art: "zap" },
{ id: "pop", label: "Pop", mark: "PP", background: "#00bfd8", accent: "#ff8a00", art: "pop" },
{ id: "star", label: "Star", mark: "ST", background: "#246bfe", accent: "#f2c230", art: "star" },
{ id: "bolt", label: "Robot", mark: "RB", background: "#7c3aed", accent: "#98f5ff", art: "robot" },
{ id: "disco", label: "Disco", mark: "DC", background: "#111214", accent: "#d8f7ff", art: "disco" },
{ id: "rocket", label: "Rocket", mark: "RK", background: "#20b26b", accent: "#ff5c5c", art: "rocket" },
{ id: "crown", label: "Crown", mark: "CR", background: "#ff8a00", accent: "#ffe66d", art: "crown" },
{ id: "pizza", label: "Pizza", mark: "PZ", background: "#ef4444", accent: "#ffd36a", art: "pizza" },
{ id: "gamepad", label: "Gamepad", mark: "GP", background: "#063352", accent: "#9dff7a", art: "gamepad" },
{ id: "gem", label: "Gem", mark: "GM", background: "#06b6d4", accent: "#f0fdff", art: "gem" },
{ id: "panda", label: "Panda", mark: "PD", background: "#e7f5ff", accent: "#111214", art: "animal-panda" },
{ id: "tiger", label: "Tiger", mark: "TG", background: "#ff8a00", accent: "#2a1708", art: "animal-tiger" },
{ id: "koala", label: "Koala", mark: "KL", background: "#98a2b3", accent: "#344054", art: "animal-koala" },
{ id: "fox", label: "Fox", mark: "FX", background: "#f97316", accent: "#7c2d12", art: "animal-fox" },
{ id: "frog", label: "Frog", mark: "FG", background: "#20b26b", accent: "#063b20", art: "animal-frog" },
{ id: "owl", label: "Owl", mark: "OW", background: "#7c3aed", accent: "#3b1f0f", art: "animal-owl" },
{ id: "whale", label: "Whale", mark: "WH", background: "#00bfd8", accent: "#075985", art: "animal-whale" },
{ id: "bee", label: "Bee", mark: "BE", background: "#f2c230", accent: "#111214", art: "animal-bee" },
{ id: "bunny", label: "Bunny", mark: "BN", background: "#f9a8d4", accent: "#7f1d1d", art: "animal-bunny" },
{ id: "turtle", label: "Turtle", mark: "TT", background: "#16a34a", accent: "#14532d", art: "animal-turtle" },
{ id: "poop", label: "Poop", mark: "PP", background: "#fef3c7", accent: "#7c2d12", art: "poop" },
{ id: "caseoh", label: "CaseOh-ish", mark: "CO", background: "#f97316", accent: "#111214", art: "caseoh" },
{ id: "banana", label: "Banana", mark: "BA", background: "#fff7ad", accent: "#111214", art: "banana" }];

const AVATAR_PRESETS = AVATAR_BASE.map((avatar) => ({ ...avatar, image: makeAvatarImage(avatar) }));
const FUNNY_CODES = [
"GOOK", "BONK", "YEET", "ZOOT", "NOOB", "BOOP", "WOOT", "YOIN", "GONK", "DOOF",
"POOP", "FART", "BURP", "GOOF", "MOOP", "ZONK", "WOMP", "GLOP", "BORK", "MEEP",
"HONK", "CHON", "BLAP", "DUNK", "SUSY", "YUCK", "WACK", "PFFT", "GULP", "NOMS"];

const FUNNY_ANIMAL_NAMES = [
"Wobbly Wombat", "Disco Dingo", "Sneaky Quokka", "Turbo Turtle", "Party Platypus",
"Bouncy Bilby", "Dizzy Dolphin", "Fancy Ferret", "Grumpy Gecko", "Jazzy Jackal",
"Loopy Llama", "Mighty Meerkat", "Noodle Narwhal", "Pogo Penguin", "Rowdy Raccoon",
"Sassy Salamander", "Toasty Toucan", "Wacky Wallaby", "Zippy Zebra", "Cheeky Capybara"];

// The prompt banks that used to live here are now in packages/content, served
// through /api/question/suggest. Keeping a copy in the browser is what let the
// client and the server pick content by different rules, and it shipped every
// educational answer to every player's bundle.

const GAME_MODES = [
{ id: "quiz", title: "Quiz", subtitle: "Classic Gahookz answers", art: "quiz", available: true },
{ id: "majority", title: "Majority Rulz", subtitle: "Pick what the room will pick", art: "majority", available: true },
{ id: "herd", title: "Herd", subtitle: "Write the room's answers", art: "herd", available: true }];

// The selector shows two games. Majority is a scoring rule inside Quiz, not a
// third game, so it lives on a toggle rather than a button. GAME_MODES above is
// kept for tutorials, mode art and historical records that still speak in the
// legacy three-value spelling.
const GAME_FAMILIES = [
{ id: "quiz", title: "Quiz", subtitle: "Answer the room's questions", art: "quiz", available: true },
{ id: "herd", title: "Herd", subtitle: "Write the room's answers", art: "herd", available: true }];

// Older snapshots carry only gameMode, so the canonical pair is derived when
// the server has not sent it yet.
function familyOf(lobby) {
  return lobby?.gameFamily || (lobby?.gameMode === "herd" ? "herd" : "quiz");
}
function scoringOf(lobby) {
  return lobby?.quizScoring || (lobby?.gameMode === "majority" ? "majority" : "classic");
}
function scoringLabelFor(lobby) {
  if (familyOf(lobby) === "herd") return "Herd";
  return scoringOf(lobby) === "majority" ? "Quiz · Majority Rulez" : "Quiz · Classic";
}

const ROUND_PRESETS = [
{ id: "quick", title: "Quick", subtitle: "Fast party hit", detail: "1 question each · up to 10 rounds" },
{ id: "standard", title: "Standard", subtitle: "Full game night", detail: "1–3 each · up to 18 rounds" },
{ id: "custom", title: "Custom", subtitle: "Choose the size", detail: "1–5 questions per player" }
];



const emptyLobby = {
  code: "----",
  isHost: false,
  gameMode: "quiz",
  hasPassword: false,
  approveQuestions: false,
  allowCustomProfiles: true,
  allowCustomGahooks: true,
  promptStyle: "fun",
  phase: "lobby",
  phaseEndsAt: null,
  phaseWaitingForProgress: false,
  paused: false,
  pausedRemainingMs: 0,
  players: [],
  bannedPlayers: [],
  pendingQuestions: [],
  leaderboard: [],
  questionCount: 0,
  roundPreset: "standard",
  maxQuestionsPerPlayer: 3,
  plannedTotalQuestions: 0,
  availableQuestionCount: 0,
  estimatedDurationMs: 0,
  unusedQuestionCount: 0,
  currentQuestionIndex: -1,
  totalQuestions: 0,
  canStart: false,
  activePlayerCount: 0,
  answerCount: 0,
  answerSelections: [],
  currentQuestion: null,
  ownPlayer: null,
  ownQuestions: [],
  ownHerdAssignments: [],
  herdAnswerReview: [],
  herdPreparation: null,
  ownPoke: null,
  ownCounterOffer: null,
  gahookDuel: null,
  ownAnswer: null,
  ownGahookUses: { question: [], round: [], reveal: [] },
  phaseDurations: {
    reading: 5000,
    answering: 14000,
    reveal: 12000
  }
};

function roundPresetTitle(preset = "standard") {
  return ROUND_PRESETS.find((option) => option.id === preset)?.title || "Standard";
}

function questionsPerPlayerForPreset(preset, playerCount, customLimit = 3) {
  if (preset === "quick") return 1;
  if (preset === "custom") return Math.max(1, Math.min(5, Number(customLimit) || 3));
  if (!playerCount) return 3;
  return Math.max(1, Math.min(3, Math.floor(18 / playerCount)));
}

function plannedQuestionsForLobby(lobby, playerCount = lobby.players.filter((player) => player.connected).length) {
  const serverPlan = Number(lobby.plannedTotalQuestions);
  if (serverPlan > 0 || !playerCount) return Math.max(0, serverPlan || 0);
  if (lobby.gameMode === "herd") return playerCount;
  const perPlayer = questionsPerPlayerForPreset(lobby.roundPreset, playerCount, lobby.maxQuestionsPerPlayer);
  const submittedPlan = playerCount * perPlayer;
  if (lobby.roundPreset === "quick") return Math.min(10, submittedPlan);
  if (lobby.roundPreset === "standard") return Math.min(18, submittedPlan);
  return submittedPlan;
}

function estimatedRoundDurationMs(lobby, totalQuestions = plannedQuestionsForLobby(lobby)) {
  if (Number(lobby.estimatedDurationMs) > 0) return Number(lobby.estimatedDurationMs);
  const durations = lobby.phaseDurations || emptyLobby.phaseDurations;
  const phases = ["reading", "answering", "reveal"];
  return totalQuestions * phases.reduce((total, phase) => total + Number(durations[phase] || 0), 0);
}

function formatDurationEstimate(durationMs, totalQuestions) {
  if (!totalQuestions) return "Add players for an estimate";
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return `About ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function questionUseIds(lobby) {
  const uses = lobby.ownGahookUses || {};
  return [...new Set([...(uses.question || []), ...(uses.round || []), ...(uses.reveal || [])])];
}

function applyOptimisticQuestionLimit(lobby, value) {
  const nextLimit = Math.max(1, Math.min(5, Number(value) || lobby.maxQuestionsPerPlayer || 3));
  const updateReadiness = (player) => {
    if (!player) {
      return player;
    }
    const questionsSubmitted = Math.min(player.questionsSubmitted || 0, nextLimit);
    return {
      ...player,
      questionsSubmitted,
      ready: questionsSubmitted >= nextLimit ? player.ready : false
    };
  };
  const players = lobby.players.map(updateReadiness);
  const connectedPlayers = players.filter((player) => player.connected);
  const questionCount = Math.min(lobby.questionCount || 0, players.reduce((total, player) => total + (player.questionsSubmitted || 0), 0));
  const canStart = lobby.phase === "building" &&
  connectedPlayers.length > 0 &&
  questionCount > 0 &&
  connectedPlayers.every((player) => player.name && player.ready && (player.questionsSubmitted || 0) >= nextLimit);

  return {
    ...lobby,
    maxQuestionsPerPlayer: nextLimit,
    questionCount,
    players,
    leaderboard: lobby.leaderboard.map(updateReadiness),
    ownPlayer: lobby.ownPlayer ? updateReadiness(lobby.ownPlayer) : null,
    canStart
  };
}

function updateServerClockOffset(serverTime) {
  if (typeof window === "undefined" || !serverTime) {
    return;
  }
  window.gahookzServerClockOffset = nextClockOffset(
    serverTime,
    Date.now(),
    Number(window.gahookzServerClockOffset || 0)
  );
}

function reducer(state = { connected: false, connectionError: "", error: "", lobby: emptyLobby }, action) {
  if (action.type === "CONNECTED") {
    return { ...state, connected: action.value };
  }
  if (action.type === "ROOM_CONNECTION_RESET") {
    return { ...state, connectionError: "" };
  }
  if (action.type === "ROOM_CONNECTION_ERROR") {
    return { ...state, connected: false, connectionError: action.value || "The room could not be loaded." };
  }
  if (action.type === "SNAPSHOT") {
    const incomingLobby = { ...emptyLobby, ...action.value };
    updateServerClockOffset(incomingLobby.serverTime);
    const forceRollback = typeof window !== "undefined" && Date.now() < (window.gahookzForceSnapshotRollbackUntil || 0);
    const now = Date.now();
    const currentPlayers = new Map(state.lobby.players.map((player) => [player.id, player]));
    const preserveNewerPoke = (player) => {
      const current = currentPlayers.get(player?.id);
      const isLocalPoke = String(current?.latestPokeId || "").startsWith("local-poke-");
      const isFreshLocalPoke = isLocalPoke && now - (current.latestPokeAt || 0) < 1600;
      const incomingPokeAt = player?.latestPokeAt || 0;
      const currentPokeAt = current?.latestPokeAt || 0;
      const incomingSpecial = ["ultimate", "ultimate-congrats", "get-got", "congrats", "boo", "counter", "duel-challenge"].includes(player?.latestPokeKind || "");
      const shouldPreserveLocalPoke = !incomingSpecial && isFreshLocalPoke && (!player?.latestPokeId || incomingPokeAt < currentPokeAt);
      if (forceRollback || !current || !shouldPreserveLocalPoke) {
        return player;
      }
      return {
        ...player,
        pokeCount: current.pokeCount,
        latestPokeId: current.latestPokeId,
        latestPokeAt: current.latestPokeAt,
        latestPokeKind: current.latestPokeKind,
        latestPokeUltimateStack: current.latestPokeUltimateStack,
        latestPokeUltimateUntil: current.latestPokeUltimateUntil,
        ultimateGahookUntil: current.ultimateGahookUntil,
        ultimateGahookStack: current.ultimateGahookStack,
        congratulationsCount: current.congratulationsCount,
        ultimateCongratulationsUntil: current.ultimateCongratulationsUntil,
        ultimateCongratulationsStack: current.ultimateCongratulationsStack
      };
    };
    const ownAnswer = state.lobby.ownAnswer?.optimistic && !incomingLobby.ownAnswer && incomingLobby.phase === "answering" ?
    state.lobby.ownAnswer :
    incomingLobby.ownAnswer;
    const answerCount = ownAnswer?.optimistic ? Math.max(incomingLobby.answerCount, state.lobby.answerCount) : incomingLobby.answerCount;
    const isOwnLocalPoke = String(state.lobby.ownPoke?.id || "").startsWith("local-poke-");
    const isFreshOwnLocalPoke = isOwnLocalPoke && now - (state.lobby.ownPoke?.createdAt || 0) < 1600;
    const incomingOwnPokeAt = incomingLobby.ownPoke?.createdAt || 0;
    const currentOwnPokeAt = state.lobby.ownPoke?.createdAt || 0;
    const incomingOwnSpecial = ["ultimate", "ultimate-congrats", "get-got", "congrats", "boo", "counter", "duel-challenge"].includes(incomingLobby.ownPoke?.kind || "");
    const ownLocalPokeEcho = !incomingOwnSpecial && isFreshOwnLocalPoke && (!incomingLobby.ownPoke?.id || incomingOwnPokeAt < currentOwnPokeAt);
    const ownPoke = !forceRollback && ownLocalPokeEcho ?
    state.lobby.ownPoke :
    incomingLobby.ownPoke;
    const mergedLobby = {
      ...incomingLobby,
      players: incomingLobby.players.map(preserveNewerPoke),
      leaderboard: incomingLobby.leaderboard.map(preserveNewerPoke),
      ownPlayer: incomingLobby.ownPlayer ? preserveNewerPoke(incomingLobby.ownPlayer) : null,
      ownPoke,
      ownAnswer,
      answerCount
    };
    return { ...state, connectionError: "", lobby: mergedLobby };
  }
  if (action.type === "OPTIMISTIC_POKE") {
    const poke = action.value || {};
    const createdAt = poke.createdAt || Date.now();
    const pokeId = poke.pokeId || "local-poke-" + createdAt + "-" + Math.random();
    const scoreAdjustment = Number(poke.scoreAdjustment ?? poke.pointsStolen ?? 0);
    const bumpPlayer = (player) => {
      if (!player) {
        return player;
      }
      if (scoreAdjustment && player.id === poke.senderPlayerId && poke.senderPlayerId !== poke.playerId) {
        return { ...player, score: Number(player.score || 0) + scoreAdjustment };
      }
      if (player.id !== poke.playerId) return player;
      const nextCount = (player.pokeCount || 0) + 1;
      const isActiveUltimate = (player.ultimateGahookUntil || 0) > createdAt;
      const kind = poke.kind || (isActiveUltimate ? "ultimate" : "normal");
      const isCongrats = kind === "congrats" || kind === "ultimate-congrats";
      const activeUltimateCongrats = (player.ultimateCongratulationsUntil || 0) > createdAt;
      const ultimateGahookUntil = kind === "ultimate" ?
      isActiveUltimate ? Math.max(player.ultimateGahookUntil || 0, poke.ultimateUntil || 0, createdAt + ULTIMATE_GAHOOK_GRACE_MS) : poke.ultimateUntil || createdAt + ULTIMATE_GAHOOK_GRACE_MS :
      0;
      const ultimateGahookStack = kind === "ultimate" ?
      isActiveUltimate ? (player.ultimateGahookStack || 0) + 1 : poke.ultimateStack || 0 :
      0;
      const ultimateCongratulationsUntil = kind === "ultimate-congrats" ? Math.max(player.ultimateCongratulationsUntil || 0, poke.ultimateUntil || 0, createdAt + ULTIMATE_GAHOOK_GRACE_MS) : 0;
      const ultimateCongratulationsStack = kind === "ultimate-congrats" ? activeUltimateCongrats ? (player.ultimateCongratulationsStack || 0) + 1 : poke.ultimateStack || 0 : 0;
      const latestUltimateUntil = kind === "ultimate-congrats" ? ultimateCongratulationsUntil : ultimateGahookUntil;
      const latestUltimateStack = kind === "ultimate-congrats" ? ultimateCongratulationsStack : ultimateGahookStack;
      return {
        ...player,
        score: Number(player.score || 0) - scoreAdjustment,
        pokeCount: nextCount,
        latestPokeId: pokeId,
        latestPokeAt: createdAt,
        latestPokeKind: kind,
        latestPokeUltimateStack: latestUltimateStack,
        latestPokeUltimateUntil: latestUltimateUntil,
        ultimateGahookUntil,
        ultimateGahookStack,
        congratulationsCount: (player.congratulationsCount || 0) + (isCongrats ? 1 : 0),
        ultimateCongratulationsUntil,
        ultimateCongratulationsStack
      };
    };
    const updatePlayer = bumpPlayer;
    const ownPlayer = state.lobby.ownPlayer ? updatePlayer(state.lobby.ownPlayer) : null;
    const ownPoke = state.lobby.ownPlayer?.id === poke.playerId ?
    {
      id: pokeId,
      playerId: poke.playerId,
      senderPlayerId: poke.senderPlayerId || "",
      createdAt,
      from: poke.from || "Someone",
      kind: ownPlayer?.latestPokeKind || poke.kind || "normal",
      ultimateStack: ownPlayer?.latestPokeUltimateStack || poke.ultimateStack || 0,
      ultimateUntil: ownPlayer?.latestPokeUltimateUntil || poke.ultimateUntil || 0,
      scorePenalty: poke.scorePenalty || 0,
      pointsStolen: poke.pointsStolen || 0,
      message: poke.message || "",
      gahookForm: poke.gahookForm || ownPlayer?.gahookForm || "monkey",
      customGahook: poke.customGahook || null
    } :
    state.lobby.ownPoke;
    const markScope = poke.markUseScope;
    const ownGahookUses = markScope && poke.playerId ?
    {
      ...(state.lobby.ownGahookUses || { question: [], round: [], reveal: [] }),
      [markScope]: Array.from(new Set([...(state.lobby.ownGahookUses?.[markScope] || []), poke.playerId]))
    } :
    state.lobby.ownGahookUses;
    return {
      ...state,
      lobby: {
        ...state.lobby,
        players: state.lobby.players.map(updatePlayer),
        leaderboard: state.lobby.leaderboard.map(updatePlayer),
        ownPlayer,
        ownPoke,
        ownGahookUses
      }
    };
  }
  if (action.type === "OPTIMISTIC_ANSWER") {
    if (state.lobby.ownAnswer) {
      return state;
    }
    return {
      ...state,
      lobby: {
        ...state.lobby,
        answerCount: state.lobby.answerCount + 1,
        ownAnswer: {
          answerId: action.value?.answerId,
          answerText: action.value?.answerText,
          correct: null,
          points: null,
          elapsedMs: 0,
          answeredAt: Date.now(),
          optimistic: true
        }
      }
    };
  }
  if (action.type === "ROLLBACK_OPTIMISTIC_ANSWER") {
    if (!state.lobby.ownAnswer?.optimistic) {
      return state;
    }
    return {
      ...state,
      lobby: {
        ...state.lobby,
        answerCount: Math.max(0, state.lobby.answerCount - 1),
        ownAnswer: null
      }
    };
  }
  if (action.type === "OPTIMISTIC_READY") {
    const ownId = state.lobby.ownPlayer?.id;
    const ready = Boolean(action.value);
    const updatePlayer = (player) => player?.id === ownId ? { ...player, ready } : player;
    const players = state.lobby.players.map(updatePlayer);
    const connectedPlayers = players.filter((player) => player.connected);
    const canStart = state.lobby.phase === "building" &&
    connectedPlayers.length > 0 &&
    state.lobby.questionCount > 0 &&
    connectedPlayers.every((player) => player.name && player.ready && (player.questionsSubmitted || 0) >= state.lobby.maxQuestionsPerPlayer && (player.questionsPending || 0) === 0);
    return {
      ...state,
      lobby: {
        ...state.lobby,
        players,
        leaderboard: state.lobby.leaderboard.map(updatePlayer),
        ownPlayer: state.lobby.ownPlayer ? updatePlayer(state.lobby.ownPlayer) : null,
        canStart
      }
    };
  }
  if (action.type === "OPTIMISTIC_VOTE") {
    return { ...state, lobby: { ...state.lobby, ownVote: action.value } };
  }
  if (action.type === "OPTIMISTIC_HOST_SETTINGS") {
    return { ...state, lobby: { ...state.lobby, ...(action.value || {}) } };
  }
  if (action.type === "OPTIMISTIC_GAHOOK_FORM") {
    const gahookForm = action.value || "monkey";
    const ownId = state.lobby.ownPlayer?.id;
    const updatePlayer = (player) => player?.id === ownId ? { ...player, gahookForm } : player;
    return {
      ...state,
      lobby: {
        ...state.lobby,
        players: state.lobby.players.map(updatePlayer),
        leaderboard: state.lobby.leaderboard.map(updatePlayer),
        ownPlayer: state.lobby.ownPlayer ? { ...state.lobby.ownPlayer, gahookForm } : null
      }
    };
  }
  if (action.type === "OPTIMISTIC_CUSTOM_GAHOOK") {
    const customGahook = action.value || null;
    const ownId = state.lobby.ownPlayer?.id;
    const updatePlayer = (player) => player?.id === ownId ? { ...player, gahookForm: "custom" } : player;
    return {
      ...state,
      lobby: {
        ...state.lobby,
        ownCustomGahook: customGahook,
        players: state.lobby.players.map(updatePlayer),
        leaderboard: state.lobby.leaderboard.map(updatePlayer),
        ownPlayer: state.lobby.ownPlayer ? { ...state.lobby.ownPlayer, gahookForm: "custom" } : null
      }
    };
  }
  if (action.type === "APPLY_PLAYER_IDENTITY") {
    const identity = action.value || {};
    const updatePlayer = (player) => player?.id === identity.playerId ?
    { ...player, name: identity.name || player.name, avatarId: identity.avatarId || player.avatarId, avatarImageDataUrl: "" } :
    player;
    const updateQuestion = (question) => question?.authorId === identity.playerId ?
    {
      ...question,
      authorName: identity.name || question.authorName,
      author: question.author ? { ...question.author, name: identity.name || question.author.name, avatarId: identity.avatarId || question.author.avatarId, avatarImageDataUrl: "" } : question.author
    } :
    question;
    return {
      ...state,
      lobby: {
        ...state.lobby,
        players: state.lobby.players.map(updatePlayer),
        leaderboard: state.lobby.leaderboard.map(updatePlayer),
        ownPlayer: state.lobby.ownPlayer ? updatePlayer(state.lobby.ownPlayer) : null,
        pendingQuestions: state.lobby.pendingQuestions.map(updateQuestion),
        currentQuestion: updateQuestion(state.lobby.currentQuestion),
        ownQuestions: state.lobby.ownQuestions.map(updateQuestion)
      }
    };
  }
  if (action.type === "OPTIMISTIC_PLAYER_PROFILE") {
    const profile = action.value || {};
    const updatePlayer = (player) => player?.id === profile.playerId ? {
      ...player,
      name: profile.name || player.name,
      avatarId: profile.avatarId || player.avatarId,
      avatarImageDataUrl: profile.avatarImageDataUrl || ""
    } : player;
    const updateQuestion = (question) => question?.authorId === profile.playerId ? {
      ...question,
      authorName: profile.name || question.authorName,
      author: question.author ? {
        ...question.author,
        name: profile.name || question.author.name,
        avatarId: profile.avatarId || question.author.avatarId,
        avatarImageDataUrl: profile.avatarImageDataUrl || ""
      } : question.author
    } : question;
    return {
      ...state,
      lobby: {
        ...state.lobby,
        players: state.lobby.players.map(updatePlayer),
        leaderboard: state.lobby.leaderboard.map(updatePlayer),
        ownPlayer: state.lobby.ownPlayer ? updatePlayer(state.lobby.ownPlayer) : null,
        pendingQuestions: state.lobby.pendingQuestions.map(updateQuestion),
        currentQuestion: updateQuestion(state.lobby.currentQuestion),
        ownQuestions: state.lobby.ownQuestions.map(updateQuestion)
      }
    };
  }
  if (action.type === "HOST_PLAYER_KICKED") {
    const kickedPlayer = action.value;
    if (!kickedPlayer?.id) return state;
    return {
      ...state,
      lobby: {
        ...state.lobby,
        players: state.lobby.players.filter((player) => player.id !== kickedPlayer.id),
        leaderboard: state.lobby.leaderboard.filter((player) => player.id !== kickedPlayer.id),
        answerSelections: state.lobby.answerSelections.filter((selection) => selection.playerId !== kickedPlayer.id),
        bannedPlayers: [{ ...kickedPlayer, kickedAt: Date.now() }, ...state.lobby.bannedPlayers.filter((player) => player.id !== kickedPlayer.id)],
        activePlayerCount: Math.max(0, state.lobby.activePlayerCount - (kickedPlayer.connected ? 1 : 0))
      }
    };
  }
  if (action.type === "HOST_EXITED_PLAYER") {
    const playerId = action.value?.playerId || state.lobby.ownPlayer?.id;
    if (!playerId) return state;
    const removedQuestions = state.lobby.ownQuestions.filter((question) => question.status !== "pending").length;
    return {
      ...state,
      lobby: {
        ...state.lobby,
        players: state.lobby.players.filter((player) => player.id !== playerId),
        leaderboard: state.lobby.leaderboard.filter((player) => player.id !== playerId),
        pendingQuestions: state.lobby.pendingQuestions.filter((question) => question.authorId !== playerId),
        answerSelections: state.lobby.answerSelections.filter((selection) => selection.playerId !== playerId),
        questionCount: Math.max(0, state.lobby.questionCount - removedQuestions),
        activePlayerCount: Math.max(0, state.lobby.activePlayerCount - 1),
        ownPlayer: null,
        ownQuestions: [],
        ownPoke: null,
        ownAnswer: null
      }
    };
  }
  if (action.type === "HOST_TRANSFERRED") {
    const nextHostId = action.value?.playerId;
    if (!nextHostId) return state;
    const updatePlayer = (player) => player ? { ...player, isHost: player.id === nextHostId } : player;
    return {
      ...state,
      lobby: {
        ...state.lobby,
        isHost: false,
        players: state.lobby.players.map(updatePlayer),
        leaderboard: state.lobby.leaderboard.map(updatePlayer),
        ownPlayer: state.lobby.ownPlayer ? updatePlayer(state.lobby.ownPlayer) : null
      }
    };
  }
  if (action.type === "OPTIMISTIC_QUESTION_SUBMITTED") {
    const ownId = state.lobby.ownPlayer?.id;
    const bumpQuestions = (player) => player?.id === ownId ? { ...player, questionsSubmitted: (player.questionsSubmitted || 0) + 1 } : player;
    return {
      ...state,
      lobby: {
        ...state.lobby,
        questionCount: state.lobby.questionCount + 1,
        ownPlayer: state.lobby.ownPlayer ? bumpQuestions(state.lobby.ownPlayer) : null,
        players: state.lobby.players.map(bumpQuestions),
        leaderboard: state.lobby.leaderboard.map(bumpQuestions)
      }
    };
  }
  if (action.type === "ROLLBACK_OPTIMISTIC_QUESTION") {
    const ownId = state.lobby.ownPlayer?.id;
    const unbumpQuestions = (player) => player?.id === ownId ? { ...player, questionsSubmitted: Math.max(0, (player.questionsSubmitted || 0) - 1) } : player;
    return {
      ...state,
      lobby: {
        ...state.lobby,
        questionCount: Math.max(0, state.lobby.questionCount - 1),
        ownPlayer: state.lobby.ownPlayer ? unbumpQuestions(state.lobby.ownPlayer) : null,
        players: state.lobby.players.map(unbumpQuestions),
        leaderboard: state.lobby.leaderboard.map(unbumpQuestions)
      }
    };
  }
  if (action.type === "OPTIMISTIC_QUESTION_LIMIT") {
    return {
      ...state,
      lobby: applyOptimisticQuestionLimit(state.lobby, action.value)
    };
  }
  if (action.type === "ROLLBACK_QUESTION_LIMIT") {
    return {
      ...state,
      lobby: applyOptimisticQuestionLimit(state.lobby, action.value)
    };
  }
  if (action.type === "ERROR") {
    return { ...state, error: action.value || "Something went wrong." };
  }
  if (action.type === "CLEAR_ERROR") {
    return { ...state, error: "" };
  }
  return state;
}

const store = createStore(reducer);

function getClientKey() {
  try {
    const existing = localStorage.getItem(CLIENT_KEY);
    if (existing) {
      return existing;
    }
    const next = crypto.randomUUID ? crypto.randomUUID() : "player-" + Date.now() + "-" + Math.random();
    localStorage.setItem(CLIENT_KEY, next);
    return next;
  } catch (_error) {
    return "player-" + Date.now() + "-" + Math.random();
  }
}

function getSavedJoin() {
  try {
    const saved = JSON.parse(localStorage.getItem(JOIN_KEY) || "{}") || {};
    if (Object.prototype.hasOwnProperty.call(saved, "password")) {
      const { password: _password, ...safeJoin } = saved;
      localStorage.setItem(JOIN_KEY, JSON.stringify(safeJoin));
      return safeJoin;
    }
    return saved;
  } catch (_error) {
    return {};
  }
}

function saveJoinSession(join) {
  try {
    const { password: _password, ...safeJoin } = join || {};
    localStorage.setItem(JOIN_KEY, JSON.stringify(safeJoin));
  } catch (_error) {
    return;
  }
}

function roomPasswordKey(code) {
  return "gahookz-room-password-" + normaliseRoomCode(code);
}

let migratedUrlPassword;

function getUrlPassword() {
  if (migratedUrlPassword !== undefined) return migratedUrlPassword;
  try {
    const url = new URL(window.location.href);
    migratedUrlPassword = url.searchParams.get("pwd") || url.searchParams.get("pw") || "";
    if (migratedUrlPassword) {
      url.searchParams.delete("pwd");
      url.searchParams.delete("pw");
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    }
    return migratedUrlPassword;
  } catch (_error) {
    migratedUrlPassword = "";
    return "";
  }
}

function getWelcomePrefill() {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      code: normaliseRoomCode(params.get("room")),
      password: getUrlPassword(),
      locked: params.get("locked") === "1"
    };
  } catch (_error) {
    return { code: "", password: "", locked: false };
  }
}

function saveRoomPassword(code, password) {
  const cleanCode = normaliseRoomCode(code);
  if (!cleanCode) {
    return;
  }
  try {
    if (password) {
      sessionStorage.setItem(roomPasswordKey(cleanCode), password);
    } else {
      sessionStorage.removeItem(roomPasswordKey(cleanCode));
    }
  } catch (_error) {
    return;
  }
}

function getSavedRoomPassword(code) {
  const cleanCode = normaliseRoomCode(code);
  if (!cleanCode) {
    return "";
  }
  try {
    return sessionStorage.getItem(roomPasswordKey(cleanCode)) || "";
  } catch (_error) {
    return "";
  }
}

function buildRoomPath(code) {
  const cleanCode = normaliseRoomCode(code);
  return "/" + cleanCode;
}

function buildWelcomePath(code, { locked = false } = {}) {
  const params = new URLSearchParams();
  const cleanCode = normaliseRoomCode(code);
  if (cleanCode) params.set("room", cleanCode);
  if (locked) params.set("locked", "1");
  const query = params.toString();
  return "/" + (query ? "?" + query : "");
}

function buildRoomLink(code) {
  return window.location.origin + buildRoomPath(code);
}

function scheduleSnapshotRefresh(delayMs = 1000) {
  setTimeout(() => window.gahookzRefreshSnapshot?.(), delayMs);
}

function forceSnapshotRevert(delayMs = 1000) {
  window.gahookzForceSnapshotRollbackUntil = Date.now() + delayMs + 800;
  scheduleSnapshotRefresh(delayMs);
}

function optimisticPokePayload(player, from, kindOverride = "", message = "", gahookForm = getStoredGahookForm(), customGahook = null) {
  const createdAt = Date.now();
  const isActiveUltimate = (player?.ultimateGahookUntil || 0) > createdAt;
  const isActiveUltimateCongrats = kindOverride === "congrats" && (player?.ultimateCongratulationsUntil || 0) > createdAt;
  const kind = isActiveUltimateCongrats ? "ultimate-congrats" : kindOverride || (isActiveUltimate ? "ultimate" : "normal");
  const ultimateUntil = kind === "ultimate" ?
  isActiveUltimate ? Math.max(player.ultimateGahookUntil || 0, createdAt + ULTIMATE_GAHOOK_GRACE_MS) : createdAt + ULTIMATE_GAHOOK_GRACE_MS :
  kind === "ultimate-congrats" ? Math.max(player.ultimateCongratulationsUntil || 0, createdAt + ULTIMATE_GAHOOK_GRACE_MS) :
  0;
  const ultimateStack = kind === "ultimate" ?
  isActiveUltimate ? (player.ultimateGahookStack || 0) + 1 : 0 :
  kind === "ultimate-congrats" ? (player.ultimateCongratulationsStack || 0) + 1 :
  0;
  let resolvedCustomGahook = customGahook;
  if (gahookForm === "custom" && !resolvedCustomGahook) {
    try {
      resolvedCustomGahook = store.getState().lobby.ownCustomGahook || null;
    } catch (_error) {}
  }
  return {
    playerId: player?.id,
    from,
    pokeId: "local-poke-" + createdAt + "-" + Math.random(),
    createdAt,
    kind,
    ultimateStack,
    ultimateUntil,
    message,
    gahookForm,
    ...(resolvedCustomGahook ? { customGahook: resolvedCustomGahook } : {})
  };
}

function triggerClientOnlySelfGahook(dispatch, player, ownPlayer, from) {
  if (!player?.id || player.id !== ownPlayer?.id) {
    return false;
  }
  dispatch({ type: "OPTIMISTIC_POKE", value: optimisticPokePayload(player, from, "", "", ownPlayer.gahookForm || getStoredGahookForm()) });
  return true;
}

function normaliseRoomCode(value) {
  return String(value || "").
  replace(/[^a-z]/gi, "").
  slice(0, 4).
  toUpperCase();
}

function getRoute() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0]?.toLowerCase() === "information") {
    return { mode: "information", code: "" };
  }
  if (parts[0]?.toLowerCase() === "legal") {
    return { mode: "legal", code: "" };
  }
  if (parts[0] === "host" && parts[1]) {
    return { mode: "room", code: normaliseRoomCode(parts[1]) };
  }
  if (parts[0] === "player" && parts[1]) {
    return { mode: "room", code: normaliseRoomCode(parts[1]) };
  }
  if (parts[1] === "host") {
    return { mode: "room", code: normaliseRoomCode(parts[0]) };
  }
  if (parts[1] === "player") {
    return { mode: "room", code: normaliseRoomCode(parts[0]) };
  }
  if (parts[0] && normaliseRoomCode(parts[0]) === parts[0].toUpperCase()) {
    return { mode: "room", code: normaliseRoomCode(parts[0]) };
  }
  return { mode: "welcome", code: "" };
}

function navigateTo(path) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function hostPlayKey(code) {
  return "gahookz-host-play-" + code;
}

function randomClientCode() {
  return FUNNY_CODES[Math.floor(Math.random() * FUNNY_CODES.length)] || "GOOK";
}

function randomFunnyAnimalName() {
  return FUNNY_ANIMAL_NAMES[Math.floor(Math.random() * FUNNY_ANIMAL_NAMES.length)] || "Wobbly Wombat";
}

function useCloseMenuOnOutside() {
  const ref = useRef(null);

  useEffect(() => {
    const closeWhenOutside = (event) => {
      const menu = ref.current;
      if (!menu?.open || menu.contains(event.target)) {
        return;
      }
      menu.open = false;
    };
    document.addEventListener("pointerdown", closeWhenOutside, true);
    return () => document.removeEventListener("pointerdown", closeWhenOutside, true);
  }, []);

  return ref;
}

function useDetailsMenu() {
  const ref = useCloseMenuOnOutside();
  const closeMenu = () => {
    if (ref.current) {
      ref.current.open = false;
    }
  };
  return [ref, closeMenu];
}

const apiClient = createApiClient({
  fetch: (url, init) => fetch(url, init),
  timers: browserTimers,
  context: () => ({ code: getRoute().code || "", playerKey: getClientKey() }),
  onSettled: () => window.setTimeout(() => window.gahookzRefreshSnapshot?.(), 0)
});

// Kept as a hoisted declaration so call ordering elsewhere is unchanged.
async function api(path, payload = {}, options = {}) {
  return apiClient(path, payload, options);
}

function useEvents(mode, code, playerKey) {
  const dispatch = useDispatch();

  useEffect(() => {
    if (!code || mode === "welcome") {
      return undefined;
    }

    let active = true;
    let consecutiveFailures = 0;
    const nowMs = () => typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    let lastActivityAt = nowMs();

    dispatch({ type: "ROOM_CONNECTION_RESET" });

    const reportFailure = (error, { immediate = false } = {}) => {
      consecutiveFailures += 1;
      if (immediate || consecutiveFailures >= 2) {
        dispatch({ type: "ROOM_CONNECTION_ERROR", value: connectionMessage(error) });
      }
    };

    // Ordering and coalescing live in ./client/net.ts, where they are unit
    // tested against out-of-order arrival; two sources push state here.
    const gate = createSnapshotGate({
      catchUpMs: SNAPSHOT_CATCHUP_MS,
      timers: browserTimers,
      apply: (snapshot) => {
        if (!active) return;
        lastActivityAt = nowMs();
        // A snapshot this client cannot render must produce an explanation, not
        // a half-drawn room. Happens mid-deploy, and is not a room fault.
        const compatibility = describeSnapshotCompatibility(snapshot, SNAPSHOT_SCHEMA_VERSION);
        if (!compatibility.supported) {
          dispatch({ type: "ROOM_CONNECTION_ERROR", value: compatibility.message });
          return;
        }
        consecutiveFailures = 0;
        dispatch({ type: "CONNECTED", value: true });
        dispatch({ type: "SNAPSHOT", value: snapshot });
      }
    });
    const queueSnapshot = (snapshot) => {
      if (!active) return;
      gate.offer(snapshot);
    };

    // A protected room stops answering this credential whenever the server has
    // forgotten it - a restart, or a password added mid-session. Re-present the
    // password this device already holds before sending the player back out.
    let readmitting = false;
    const recoverLockedRoom = async () => {
      if (readmitting) return;
      readmitting = true;
      const knownPassword = getSavedRoomPassword(code) || getUrlPassword();
      if (knownPassword) {
        const readmit = await api("/api/room", { code, playerKey, intent: "join", password: knownPassword }, { refresh: false });
        readmitting = false;
        if (!active) return;
        if (readmit.ok) {
          fetchSnapshot();
          connectEvents();
          return;
        }
      }
      readmitting = false;
      if (active) navigateTo(buildWelcomePath(code, { locked: true }));
    };

    const fetchSnapshot = async () => {
      try {
        const response = await fetch("/api/state", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Gahookz-Room": code },
          body: JSON.stringify({ code, role: mode, playerKey }),
          cache: "no-store"
        });
        const snapshot = await response.json();
        if (response.status === 404 && snapshot?.roomMissing) {
          if (active) {
            navigateTo(buildWelcomePath(code));
          }
          return;
        }
        if (snapshot?.roomLocked || snapshot?.banned) {
          if (active) {
            dispatch({ type: "CONNECTED", value: false });
            if (snapshot.banned) navigateTo(buildWelcomePath(code));
            else await recoverLockedRoom();
          }
          return;
        }
        if (!response.ok) {
          reportFailure(snapshot, { immediate: response.status >= 400 && response.status < 500 });
          return;
        }
        queueSnapshot(snapshot);
      } catch (error) {
        if (active) {
          dispatch({ type: "CONNECTED", value: false });
          reportFailure(error);
        }
      }
    };
    window.gahookzRefreshSnapshot = fetchSnapshot;

    // The stream lifecycle lives in ./client/net.ts so that "exactly one open
    // stream" is a property with tests behind it rather than an intention.
    const live = createLiveConnection({
      api,
      createEventSource: (url) => new EventSource(url),
      timers: browserTimers,
      reconnectMs: 1500,
      room: { code, role: mode, playerKey },
      onSnapshot: queueSnapshot,
      onConnected: (value) => {
        if (value) lastActivityAt = nowMs();
        dispatch({ type: "CONNECTED", value });
      },
      onFailure: reportFailure,
      onRoomMissing: () => navigateTo(buildWelcomePath(code)),
      onBanned: () => navigateTo(buildWelcomePath(code)),
      onRoomLocked: () => recoverLockedRoom()
    });
    const connectEvents = () => live.connect();

    connectEvents();
    fetchSnapshot();

    // Recovery polling used to run every 1.8 seconds forever, whether or not
    // the live stream was working. On a healthy connection that is pure waste:
    // every tab in the room asked for the whole room state 33 times a minute
    // and threw almost all of it away.
    //
    // The stream sends a keepalive every 15 seconds, so silence past that plus
    // a margin is the signal that something is wrong. Only then is a snapshot
    // worth fetching.
    const SERVER_HEARTBEAT_MS = 15_000;
    const SILENCE_BEFORE_RECOVERY_MS = SERVER_HEARTBEAT_MS + 10_000;
    const RECOVERY_CHECK_MS = 5_000;

    const recoverIfStale = () => {
      if (!active) return;
      // Monotonic where available: a device clock that jumps must not make the
      // stream look dead, or resuming from sleep triggers a stampede.
      const elapsed = nowMs() - lastActivityAt;
      if (elapsed >= SILENCE_BEFORE_RECOVERY_MS) fetchSnapshot();
    };
    const interval = setInterval(recoverIfStale, RECOVERY_CHECK_MS);

    // Coming back to a backgrounded tab is the one moment a snapshot is always
    // worth it: timers are throttled while hidden, so the stream may have been
    // starved regardless of its health.
    const onVisible = () => {
      if (!active || document.visibilityState !== "visible") return;
      lastActivityAt = nowMs();
      fetchSnapshot();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      if (window.gahookzRefreshSnapshot === fetchSnapshot) {
        delete window.gahookzRefreshSnapshot;
      }
      // Both own their own timers and stream, and both are safe to call twice.
      gate.dispose();
      live.close();
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, [mode, code, playerKey, dispatch]);
}

function App() {
  const [route, setRoute] = useState(getRoute);
  const mode = route.mode;
  const playerKey = getClientKey();
  const error = useSelector((state) => state.error);
  const connectionError = useSelector((state) => state.connectionError);
  const lobby = useSelector((state) => state.lobby);
  const dispatch = useDispatch();
  const serverConnection = useServerConnection();

  useEvents(serverConnection.offline || serverConnection.protocolMismatch ? "welcome" : mode, route.code, playerKey);

  useEffect(() => {
    installGahookWarmup();
  }, []);

  useEffect(() => {
    if (serverConnection.offline) {
      setGameMusicState("off");
      return;
    }
    if (mode === "welcome" || mode === "information" || mode === "legal") {
      setGameMusicState("welcome");
      return;
    }
    if (lobby.phase === "lobby") setGameMusicState("lobby");
    else if (lobby.phase === "building" || lobby.phase === "herd-writing") setGameMusicState("prep");
    else if (lobby.phase === "finished") setGameMusicState("finale");
    else setGameMusicState("live");
  }, [mode, lobby.phase, serverConnection.offline]);

  useEffect(() => {
    if (!error) {
      return undefined;
    }
    const timer = setTimeout(() => dispatch({ type: "CLEAR_ERROR" }), 5000);
    return () => clearTimeout(timer);
  }, [error, dispatch]);

  useEffect(() => {
    document.title = mode === "room" ? "Gahookz " + (route.code || "") : mode === "information" ? "Gahookz Information" : mode === "legal" ? "Gahookz Rules and Privacy" : "Gahookz";
  }, [mode, route.code]);

  useEffect(() => {
    if (!["reading", "answering", "reveal", "finished"].includes(lobby.phase)) {
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [lobby.code, lobby.phase, lobby.currentQuestionIndex, lobby.currentQuestion?.id]);

  useEffect(() => {
    const syncRoute = () => setRoute(getRoute());
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  if (serverConnection.offline && mode !== "information" && mode !== "legal") {
    return <OfflineExperience recovered={serverConnection.recovered} onReturnOnline={serverConnection.returnOnline} />;
  }

  if (serverConnection.protocolMismatch && mode !== "information" && mode !== "legal") {
    return <ServerUpdateExperience mismatch={serverConnection.protocolMismatch} />;
  }

  return (
    <>
      {mode === "information" ? <InformationHub /> : mode === "legal" ? <LegalHub /> : mode === "welcome" ? <WelcomeScreen /> : lobby.code !== route.code ? <RoomLoading code={route.code} error={connectionError} /> : lobby.isHost ? <HostMode playerKey={playerKey} code={route.code} /> : <PlayerView playerKey={playerKey} />}
      {mode === "room" && lobby.code === route.code ? <GahookArenaCrowdControls duel={lobby.gahookDuel} ownPlayer={lobby.ownPlayer} playerKey={playerKey} /> : null}
      {error ?
      <div className="toast" role="status" key={error}>
          <span>{error}</span>
          <button className="icon-button toast-close" type="button" onClick={() => dispatch({ type: "CLEAR_ERROR" })} aria-label="Dismiss">x</button>
        </div> :
      null}
    </>);

}

function RoomLoading({ code, error = "" }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), 6500);
    return () => clearTimeout(timer);
  }, [code]);

  const retry = async () => {
    if (error.includes("newer than the game server")) {
      try {
        const registration = await navigator.serviceWorker?.getRegistration?.("/");
        await registration?.update?.();
      } catch (_error) {}
      window.location.reload();
      return;
    }
    setSlow(false);
    window.gahookzRefreshSnapshot?.();
  };

  const problem = error || (slow ? "The room is taking longer than expected. The server may be restarting or this screen may need a newer release." : "");
  return (
    <main className="room-loading">
      <div className="brand-lockup welcome-brand"><strong>Gahookz</strong></div>
      <p>{problem ? "Room " + code + " isn't ready" : "Loading " + code}</p>
      {problem ? <section className="room-loading-status" role="alert"><span>{problem}</span><div><button type="button" onClick={retry}>Retry</button><button type="button" onClick={() => navigateTo(buildWelcomePath(code))}>Back to home</button></div></section> : null}
    </main>);

}

function WelcomeScreen() {
  const dispatch = useDispatch();
  const welcomePrefill = getWelcomePrefill();
  const [entryIntent, setEntryIntent] = useState("join");
  const [roomCode, setRoomCode] = useState(() => welcomePrefill.code || "");
  const [roomPlaceholder] = useState(() => randomClientCode());
  const [passwordEnabled, setPasswordEnabled] = useState(() => Boolean(welcomePrefill.password || welcomePrefill.locked));
  const [password, setPassword] = useState(() => welcomePrefill.password);
  const [wrongPasswordPoke, setWrongPasswordPoke] = useState(null);
  const [creating, setCreating] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  const togglePassword = (enabled) => {
    setPasswordEnabled(enabled);
    if (!enabled) {
      setPassword("");
      saveRoomPassword(roomCode, "");
    }
  };

  const selectEntryIntent = (intent) => {
    setEntryIntent(intent);
    if (intent === "host" && normaliseRoomCode(roomCode).length !== 4) {
      setRoomCode(randomClientCode());
    }
  };

  const openRoom = async (event) => {
    event.preventDefault();
    const code = normaliseRoomCode(roomCode);
    if (code.length !== 4) {
      dispatch({ type: "ERROR", value: "Enter a four-letter room word." });
      return;
    }
    setCreating(true);
    const result = await api("/api/room", { code, playerKey: getClientKey(), passwordEnabled, password, intent: entryIntent });
    setCreating(false);
    if (!result.ok) {
      if (result.wrongPassword) {
        setWrongPasswordPoke({
          id: "wrong-password-" + Date.now(),
          createdAt: Date.now(),
          from: "Wrong password",
          message: "Wrong password",
          kind: "normal"
        });
        const soundChannel = resetPokeSoundChannel();
        playMonkeyPokeSound(soundChannel);
        playGahookVoiceCue(soundChannel);
        setTimeout(() => setWrongPasswordPoke(null), 1100);
      }
      dispatch({ type: "ERROR", value: result.error });
      return;
    }
    if (password) {
      saveRoomPassword(result.code, password);
      saveJoinSession({ ...getSavedJoin(), code: result.code });
    }
    navigateTo(buildRoomPath(result.code, password));
  };

  return (
    <main className="welcome-screen">
      <section className="welcome-hero">
        <div className="brand-lockup welcome-brand"><strong>Gahookz</strong></div>
        <h1>Make a room, drop a code, GAHOOK.</h1>
      </section>
      <section className="welcome-actions">
        <form className="welcome-panel welcome-panel-single" onSubmit={openRoom}>
          <div className="welcome-intent-selector" role="group" aria-label="Join or host">
            <button className={entryIntent === "join" ? "is-selected" : ""} type="button" aria-pressed={entryIntent === "join"} onClick={() => selectEntryIntent("join")}><EntryModeArt art="join" /><span><strong>Join</strong><small>Enter a friend's room</small></span></button>
            <button className={entryIntent === "host" ? "is-selected" : ""} type="button" aria-pressed={entryIntent === "host"} onClick={() => selectEntryIntent("host")}><EntryModeArt art="host" /><span><strong>Host</strong><small>Make a new room</small></span></button>
          </div>
          <label><span>Room word</span><input value={roomCode} onChange={(event) => setRoomCode(normaliseRoomCode(event.target.value))} maxLength="4" placeholder={roomPlaceholder} autoComplete="off" /></label>
          <label className="password-toggle"><input type="checkbox" checked={passwordEnabled} onChange={(event) => togglePassword(event.target.checked)} /><span>Use password</span></label>
          {passwordEnabled ? <label><span>Password</span><input value={password} onChange={(event) => setPassword(event.target.value)} maxLength="80" placeholder="Room password" type="password" /></label> : null}
          <button className="join-code-button" type="submit" disabled={creating || normaliseRoomCode(roomCode).length !== 4}>{creating ? "Opening" : entryIntent === "join" ? "Join room" : "Create room"}</button>
        </form>
      </section>
      <footer className="welcome-footer">
        <button className="welcome-tutorial-link" type="button" onClick={() => setShowTutorial(true)}>How to play &amp; tutorials</button>
        <a className="welcome-legal-link" href="/legal">Rules, terms &amp; privacy</a>
      </footer>
      <GameTutorial
        mode="overview"
        open={showTutorial}
        onClose={() => setShowTutorial(false)}
        includeHost
        allowedModes={["overview", "quiz", "majority", "herd", "host"]}
      />
      {wrongPasswordPoke ? <PokeJumpScare key={wrongPasswordPoke.id} poke={wrongPasswordPoke} /> : null}
    </main>);

}

const CAREER_STATS = [
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

function accountLoginHref() {
  const returnUrl = new URL(window.location.href);
  returnUrl.hash = "";
  returnUrl.searchParams.delete("account");
  return "/auth/google/start?returnTo=" + encodeURIComponent(returnUrl.pathname + returnUrl.search);
}

function AccountPanel() {
  const dispatch = useDispatch();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const accountMessage = new URL(window.location.href).searchParams.get("account");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/account", { headers: { accept: "application/json" } });
      setStatus(await response.json());
    } catch {
      setStatus({ ok: false, signedIn: false, googleAvailable: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (accountMessage) {
      const url = new URL(window.location.href);
      url.searchParams.delete("account");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      if (accountMessage === "connected") dispatch({ type: "ERROR", value: "Google account connected. Your game stats can now follow you." });
      if (accountMessage === "error") dispatch({ type: "ERROR", value: "Google sign-in did not finish. Guest play still works." });
    }
  }, []);

  const signOut = async () => {
    const result = await api("/api/account/logout", {}, { refresh: false });
    if (!result.ok) {
      dispatch({ type: "ERROR", value: result.error });
      return;
    }
    await load();
  };

  if (loading) return null;
  if (status?.signedIn && status.account) {
    const account = status.account;
    return (
      <section className="account-panel account-panel-signed-in" aria-label="Gahookz account">
        <header>
          <div className="account-avatar" aria-hidden="true"><span>{account.displayName.slice(0, 1).toUpperCase()}</span></div>
          <div><small>Career profile</small><h2>{account.displayName}</h2><p>{account.customGahookSlots} cloud Gahook {account.customGahookSlots === 1 ? "slot" : "slots"}</p></div>
          <button type="button" onClick={signOut}>Sign out</button>
        </header>
        <div className="career-stat-grid">
          {CAREER_STATS.map(([key, label]) => <div key={key}><strong>{Number(account.stats?.[key] || 0).toLocaleString()}</strong><span>{label}</span></div>)}
        </div>
        <p className="account-privacy-note">Signing in saves career totals and custom Gahooks. A room still works for every guest.</p>
      </section>);
  }
  // A server without a verified identity provider and durable storage cannot
  // keep the promise this panel makes, so it offers nothing rather than
  // advertising career stats that would not survive the next restart.
  if (!status?.googleAvailable) return null;
  return (
    <section className="account-panel account-panel-guest" aria-label="Optional Gahookz account">
      <div><small>Optional player profile</small><h2>Keep your wins and custom Gahooks</h2><p>Guest play stays instant. Sign in only if you want stats and unlocks to follow you.</p></div>
      <a className="google-sign-in-button" href={accountLoginHref()}>Continue with Google</a>
    </section>);
}

function EntryModeArt({ art }) {
  return art === "host" ?
  <svg className="entry-mode-art" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 9v46M9 32h46" /><circle cx="32" cy="32" r="23" /></svg> :
  <svg className="entry-mode-art" viewBox="0 0 64 64" aria-hidden="true"><path d="M9 32h34M31 19l13 13-13 13" /><path d="M38 11h15v42H38" /></svg>;
}

function LobbyCodeBand({ code, playerLink, shareNotice, onClick, className = "" }) {
  return (
    <button className={["code-band", className].filter(Boolean).join(" ")} type="button" aria-label="Share lobby link" onClick={onClick}>
      <span className="code-band__layout">
        <span className="code-band__text">
          <span>Lobby code</span>
          <strong>{code}</strong>
          <small>{playerLink}</small>
        </span>
        <RoomQrCode value={playerLink} />
      </span>
      {shareNotice ? <em>{shareNotice}</em> : null}
    </button>
  );
}

function PreviousGameSummary({ summary, ownPlayerId = "" }) {
  const leaderboard = summary?.leaderboard || [];
  if (!leaderboard.length) return null;
  const winners = leaderboard.filter((player) => player.rank === 1);
  return (
    <section className="previous-game-summary" aria-label="Previous game results">
      <header><div><small>Last game · {gameModeTitle(summary.gameMode)}</small><h2>{winners.length > 1 ? "Shared win" : "Winner"}: {winners.map((player) => player.name).join(" & ")}</h2></div><strong>{Math.max(...winners.map((player) => player.score), 0).toLocaleString()} pts</strong></header>
      <div>{leaderboard.slice(0, 8).map((player) => <span className={player.id === ownPlayerId ? "is-own-player" : ""} key={player.id}><b>#{player.rank}</b><AvatarBadge player={player} small /><em>{player.name}</em><strong>{player.score.toLocaleString()}</strong></span>)}</div>
    </section>);
}

function HostMode({ playerKey, code }) {
  const [joiningAsPlayer, setJoiningAsPlayer] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [rejoiningAsPlayer, setRejoiningAsPlayer] = useState(false);
  const lobby = useSelector((state) => state.lobby);
  const dispatch = useDispatch();

  const hostAction = async (path, payload = {}) => {
    const previousQuestionLimit = lobby.maxQuestionsPerPlayer;
    const isQuestionLimitUpdate = path === "/api/host/settings" && Object.prototype.hasOwnProperty.call(payload, "maxQuestionsPerPlayer");
    const optimisticSettings = path === "/api/host/settings" ?
    Object.fromEntries(Object.entries(payload).filter(([key]) => ["gameMode", "gameFamily", "quizScoring", "approveQuestions", "roundPreset", "allowCustomProfiles", "allowCustomGahooks", "promptStyle", "herdRoundTarget"].includes(key))) :
    {};
    if (Object.prototype.hasOwnProperty.call(payload, "roundPreset")) {
      optimisticSettings.plannedTotalQuestions = 0;
      optimisticSettings.estimatedDurationMs = 0;
    }
    const previousSettings = Object.fromEntries(Object.keys(optimisticSettings).map((key) => [key, lobby[key]]));
    if (isQuestionLimitUpdate) {
      dispatch({ type: "OPTIMISTIC_QUESTION_LIMIT", value: payload.maxQuestionsPerPlayer });
    }
    if (Object.keys(optimisticSettings).length) {
      dispatch({ type: "OPTIMISTIC_HOST_SETTINGS", value: optimisticSettings });
    }
    const result = await api(path, payload, { ...(isQuestionLimitUpdate ? { timeoutMs: 1000 } : {}), refresh: false });
    if (!result.ok) {
      if (isQuestionLimitUpdate) {
        dispatch({ type: "ROLLBACK_QUESTION_LIMIT", value: previousQuestionLimit });
        forceSnapshotRevert();
      }
      if (Object.keys(previousSettings).length) {
        dispatch({ type: "OPTIMISTIC_HOST_SETTINGS", value: previousSettings });
        forceSnapshotRevert();
      }
      dispatch({ type: "ERROR", value: result.error });
    } else {
      window.gahookzRefreshSnapshot?.();
    }
    return result;
    return result;
  };

  useEffect(() => {
    if (lobby.phase === "lobby" && lobby.ownPlayer) setJoiningAsPlayer(false);
  }, [lobby.phase, lobby.ownPlayer?.id]);

  const exitAsPlayer = async () => {
    const exitingPlayer = lobby.ownPlayer;
    if (!exitingPlayer) {
      setJoiningAsPlayer(false);
      return { ok: true };
    }
    saveJoinSession({
      ...getSavedJoin(),
      code,
      name: exitingPlayer.name,
      avatarId: exitingPlayer.avatarId,
      avatarImageDataUrl: exitingPlayer.avatarImageDataUrl || "",
      gahookForm: exitingPlayer.gahookForm || getStoredGahookForm(),
      password: getSavedRoomPassword(code) || getUrlPassword() || ""
    });
    dispatch({ type: "HOST_EXITED_PLAYER", value: { playerId: exitingPlayer.id } });
    setJoiningAsPlayer(false);
    setEditingProfile(false);
    const result = await api("/api/host/exit-player", {}, { refresh: false });
    if (!result.ok) {
      dispatch({ type: "ERROR", value: result.error });
      forceSnapshotRevert();
    } else {
      window.gahookzRefreshSnapshot?.();
    }
    return result;
  };

  const enterAsPlayer = async () => {
    if (rejoiningAsPlayer) return;
    const saved = getSavedJoin();
    const canRejoin = normaliseRoomCode(saved.code) === normaliseRoomCode(code) && Boolean(saved.name?.trim());
    if (!canRejoin) {
      setJoiningAsPlayer(true);
      return;
    }
    setRejoiningAsPlayer(true);
    const result = await api("/api/player/join", {
      code,
      name: saved.name,
      avatarId: saved.avatarId || AVATAR_PRESETS[0].id,
      avatarImageDataUrl: saved.avatarImageDataUrl || "",
      gahookForm: saved.gahookForm || getStoredGahookForm(),
      playerKey,
      password: getSavedRoomPassword(code) || getUrlPassword() || ""
    }, { refresh: false });
    setRejoiningAsPlayer(false);
    if (!result.ok) {
      dispatch({ type: "ERROR", value: result.error });
      setJoiningAsPlayer(true);
      return;
    }
    window.gahookzRefreshSnapshot?.();
  };

  const resetToLobby = async () => {
    setJoiningAsPlayer(false);
    return hostAction("/api/host/reset");
  };

  const hostMenu =
  <HostQuickMenu
    code={code}
    mode={lobby.gameMode}
    isPlayer={Boolean(lobby.ownPlayer)}
    ownPlayer={lobby.ownPlayer}
    customGahook={lobby.ownCustomGahook}
    customGahookOptions={lobby.customGahookOptions}
    allowCustomGahooks={lobby.allowCustomGahooks !== false}
    playerKey={playerKey}
    onEditProfile={() => setEditingProfile(true)}
    onExitAsPlayer={exitAsPlayer}
    onReset={resetToLobby} />;

  const showPlayerWorkspace = Boolean(lobby.ownPlayer) && lobby.phase !== "lobby" || joiningAsPlayer || editingProfile;
  return showPlayerWorkspace ?
  <PlayerView playerKey={playerKey} hostMenu={hostMenu} editingProfile={editingProfile} onProfileEditComplete={() => setEditingProfile(false)} /> :
  <><HostView playerKey={playerKey} onPlayAsPlayer={enterAsPlayer} onExitAsPlayer={exitAsPlayer} rejoiningAsPlayer={rejoiningAsPlayer} hostMenu={hostMenu} /><RoomGetGotOverlay roomPoke={lobby.roomPoke} ignorePlayerId={lobby.phase === "lobby" ? lobby.ownPlayer?.id : ""} /></>;

}

function RoomGetGotOverlay({ roomPoke, ignorePlayerId = "" }) {
  const [activePoke, setActivePoke] = useState(null);
  const seenIdRef = useRef("");
  const activeUntilRef = useRef(0);
  const timeoutRef = useRef(null);
  useEffect(() => () => clearTimeout(timeoutRef.current), []);
  useEffect(() => {
    if (!roomPoke?.id || roomPoke.kind !== "get-got" || roomPoke.targetId === ignorePlayerId || seenIdRef.current === roomPoke.id) return undefined;
    seenIdRef.current = roomPoke.id;
    if (activeUntilRef.current > Date.now()) return undefined;
    const getGotUntil = (roomPoke.createdAt || Date.now()) + GET_GOT_OVERLAY_MS;
    const remaining = getGotUntil - Date.now();
    if (remaining <= 0) return undefined;
    const poke = { ...roomPoke, getGotUntil, renderId: "room-get-got-" + roomPoke.id };
    activeUntilRef.current = getGotUntil;
    setActivePoke(poke);
    const soundChannel = resetPokeSoundChannel();
    playGetGotSound(soundChannel);
    speakText("get got", { rate: 0.86, pitch: 0.42, volume: 1, lang: "en-US" });
    timeoutRef.current = setTimeout(() => {
      activeUntilRef.current = 0;
      setActivePoke(null);
    }, remaining);
    return undefined;
  }, [roomPoke?.id, ignorePlayerId]);
  return activePoke ? <PokeJumpScare key={activePoke.renderId} poke={activePoke} /> : null;
}

function RoomSocialHub({ lobby, ownPlayer = null, playerKey = "" }) {
  const dispatch = useDispatch();
  const send = async (path, payload = {}) => {
    const result = await api(path, { playerKey, ...payload }, { refresh: false });
    if (!result.ok) {
      dispatch({ type: "ERROR", value: result.error });
      throw new Error(result.error || "That could not be shared with the room.");
    }
    window.gahookzRefreshSnapshot?.();
    return result;
  };
  return <WaitingRoomSocial
    snapshot={lobby}
    ownPlayerId={ownPlayer?.id || "host"}
    disabled={!lobby.code || !["lobby", "building", "herd-writing"].includes(lobby.phase)}
    title="Room chat"
    onSendMessage={(text) => send("/api/room/chat", { text })}
    onDrawStroke={(stroke) => send("/api/room/whiteboard/stroke", { stroke })}
    onClearDrawings={() => send("/api/room/whiteboard/clear")}
    renderAvatar={(message) => <AvatarBadge avatarId={message?.senderAvatarId || "crown"} customImage={message?.senderAvatarImageDataUrl || ""} small />}
  />;
}

function GahookArenaCrowdControls({ duel, ownPlayer, playerKey }) {
  const dispatch = useDispatch();
  const [busy, setBusy] = useState("");
  const [expired, setExpired] = useState(false);
  const isCompetitor = [duel?.challengerId, duel?.challengedId].includes(ownPlayer?.id);
  useEffect(() => {
    setExpired(false);
    if (!duel?.reactionEndsAt) return undefined;
    const timer = setTimeout(() => setExpired(true), Math.max(0, duel.reactionEndsAt - Date.now()));
    return () => clearTimeout(timer);
  }, [duel?.id, duel?.reactionEndsAt]);
  if (!duel || !duel.winnerId || duel.status !== "finished" || !ownPlayer || isCompetitor || expired || duel.reactionEndsAt <= Date.now()) return null;
  const players = Array.isArray(duel.players) ? duel.players : [];
  const winner = players.find((player) => player.id === duel.winnerId);
  const loser = players.find((player) => player.id === duel.loserId);
  const react = async (reaction) => {
    if (busy) return;
    setBusy(reaction);
    const result = await api("/api/player/duel-react", { playerKey, duelId: duel.id, reaction }, { refresh: false, timeoutMs: 1800 });
    setBusy("");
    if (!result.ok) {
      dispatch({ type: "ERROR", value: result.error });
      return;
    }
    window.gahookzRefreshSnapshot?.();
  };
  return <aside className="gahook-arena-crowd-controls" aria-label="Gahook Arena crowd reactions">
    <span>THE CROWD HAS 10 SECONDS</span>
    <button type="button" disabled={Boolean(busy)} onClick={() => react("congrats")}>
      <AvatarBadge player={winner} small /><strong>👏 Congratulate {winner?.name || "winner"}</strong><b>{duel.reactionCounts?.congrats || 0}</b>
    </button>
    <button className="is-boo" type="button" disabled={Boolean(busy)} onClick={() => react("boo")}>
      <AvatarBadge player={loser} small /><strong>👎 Boo {loser?.name || "loser"}</strong><b>{duel.reactionCounts?.boos || 0}</b>
    </button>
  </aside>;
}

function GahookDuelArena({ duel }) {
  return <ArenaSpectator duel={duel} Avatar={AvatarBadge} />;
}

function GahookDuelOverlay({ duel, ownPlayer, playerKey }) {
  return <ArenaOverlay duel={duel} ownPlayer={ownPlayer} playerKey={playerKey} Avatar={AvatarBadge} request={api} />;
}

function CounterGahookPrompt({ offer, busy = false, onCounter }) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    setExpired(false);
    if (!offer?.expiresAt) return undefined;
    const timer = setTimeout(() => setExpired(true), Math.max(0, offer.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [offer?.id, offer?.expiresAt]);
  if (!offer?.id || expired || offer.expiresAt <= Date.now()) return null;
  return <aside className="counter-gahook-prompt" role="alert">
    <span>{offer.spamCount || 10} in a row!</span>
    <strong>{offer.senderName || "That spammer"} left an opening</strong>
    <button type="button" disabled={busy} onClick={onCounter}>{busy ? "Firing back..." : "Counter Gahook"}</button>
  </aside>;
}

function HerdLengthSelector({ lobby, playerCount = 0, onChange, onRoundTarget }) {
  const preset = lobby.roundPreset === "standard" || lobby.roundPreset === "custom" ? lobby.roundPreset : "quick";
  const target = Number(lobby.herdRoundTarget || 8);
  // Quick is a ceiling, not a quota: four players play four prompts, not eight
  // duplicates of four.
  const quickRounds = Math.min(8, playerCount || 8);
  const plannedRounds = preset === "quick" ? quickRounds : preset === "custom" ? Math.min(target, playerCount || target) : playerCount;
  const options = [
  { id: "quick", title: "Quick", detail: "Up to 8 rounds" },
  { id: "standard", title: "Full room", detail: "One prompt each" },
  { id: "custom", title: "Custom", detail: "Choose the rounds" }];


  return (
    <section className="round-preset-selector" aria-label="Herd game length">
      <span>Game length</span>
      <div className="round-preset-options">
        {options.map((option) =>
        <button className={preset === option.id ? "is-selected" : ""} type="button" key={option.id} aria-pressed={preset === option.id} onClick={() => onChange?.(option.id)}>
            <strong>{option.title}</strong>
            <em>{option.detail}</em>
          </button>
        )}
      </div>
      {preset === "custom" ?
      <label className="herd-round-target">
          <span>Rounds</span>
          <input type="number" min="1" max="20" value={target} onChange={(event) => onRoundTarget?.(Number(event.target.value))} />
        </label> :
      null}
      <p className="round-preset-summary">
        {playerCount ?
        <>Everyone writes one prompt and up to four answers. This game plays <strong>{plannedRounds}</strong> round{plannedRounds === 1 ? "" : "s"}.</> :
        "Waiting for players."}
      </p>
    </section>);

}

function GameFamilySelector({ value = "quiz", onChange, actions = null }) {
  return (
    <section className="mode-selector" aria-label="Game">
      <div className="mode-selector-heading"><span>Game</span>{actions}</div>
      <div className="mode-selector-options">
        {GAME_FAMILIES.map((family) =>
        <button className={value === family.id ? "is-selected" : ""} type="button" key={family.id} aria-pressed={value === family.id} onClick={() => onChange?.(family.id)}>
            <ModeArt art={family.art} />
            <strong>{family.title}</strong>
            <small>{family.subtitle}</small>
          </button>
        )}
      </div>
    </section>);

}

function MajorityScoringToggle({ scoring = "classic", onChange }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const on = scoring === "majority";
  return (
    <section className="majority-toggle" aria-label="Majority Rulez">
      <div className="majority-toggle-row">
        <div className="majority-toggle-label">
          <strong>Majority Rulez</strong>
          <small>Most-voted answer wins.</small>
        </div>
        <button className={on ? "majority-toggle-switch is-on" : "majority-toggle-switch"} type="button" role="switch" aria-checked={on} onClick={() => onChange?.(on ? "classic" : "majority")}>
          <span>{on ? "On" : "Off"}</span>
        </button>
      </div>
      {/* A real button, not a hover tooltip: this has to work by touch and by
          keyboard, which is how most people will meet it. */}
      <button className="majority-toggle-help-button" type="button" aria-expanded={helpOpen} onClick={() => setHelpOpen(!helpOpen)}>
        {helpOpen ? "Hide details" : "What does this change?"}
      </button>
      {helpOpen ?
      <p className="majority-toggle-help">The room's most-voted answer wins, rather than a preset answer. Ties use the displayed tie-break rules.</p> :
      null}
    </section>);

}

function RoundPresetSelector({ lobby, value = "standard", playerCount = 0, customLimit = 3, onChange, onQuestionLimit }) {
  const serverPlanMatchesSelection = value === lobby.roundPreset && (value !== "custom" || Number(customLimit) === Number(lobby.maxQuestionsPerPlayer));
  const displayLobby = {
    ...lobby,
    roundPreset: value,
    maxQuestionsPerPlayer: customLimit,
    plannedTotalQuestions: serverPlanMatchesSelection ? lobby.plannedTotalQuestions : 0,
    estimatedDurationMs: serverPlanMatchesSelection ? lobby.estimatedDurationMs : 0
  };
  const plannedQuestions = plannedQuestionsForLobby(displayLobby, playerCount);
  const perPlayer = questionsPerPlayerForPreset(value, playerCount, customLimit);
  const durationLabel = formatDurationEstimate(estimatedRoundDurationMs(displayLobby, plannedQuestions), plannedQuestions);
  const unusedQuestions = Number(lobby.unusedQuestionCount || 0);

  return (
    <section className="round-preset-selector" aria-label="Game length">
      <span>Game length</span>
      <div className="round-preset-options">
        {ROUND_PRESETS.map((preset) =>
        <button className={value === preset.id ? "is-selected" : ""} type="button" key={preset.id} aria-pressed={value === preset.id} onClick={() => onChange?.(preset.id)}>
            <strong>{preset.title}</strong>
            <small>{preset.subtitle}</small>
            <em>{preset.detail}</em>
          </button>
        )}
      </div>
      {value === "custom" ?
      <div className="round-preset-custom" role="group" aria-labelledby="custom-questions-label">
          <span id="custom-questions-label">Questions per player</span>
          <div className="question-count-picker party-question-picker">{[1, 2, 3, 4, 5].map((amount) => <button className={customLimit === amount ? "is-selected" : ""} type="button" aria-pressed={customLimit === amount} key={amount} onClick={() => onQuestionLimit?.(amount)}>{amount}</button>)}</div>
        </div> :
      null}
      <div className="round-preset-summary" aria-live="polite">
        <span><strong>{plannedQuestions}</strong> total question{plannedQuestions === 1 ? "" : "s"}</span>
        <span>{durationLabel}</span>
        <small>{value === "quick" && playerCount > 10 ? "Everyone makes one; 10 are selected fairly and unused questions stay queued." : value === "standard" && unusedQuestions > 0 ? `${unusedQuestions} unused question${unusedQuestions === 1 ? "" : "s"} will be reused before new ones.` : playerCount ? `${perPlayer} question${perPlayer === 1 ? "" : "s"} per player.` : "The total updates as players join."}</small>
      </div>
    </section>);
}

function gameModeTitle(mode = "quiz") {
  return GAME_MODES.find((item) => item.id === mode)?.title || "Quiz";
}

function ModeTutorialLauncher({ mode = "quiz", autoOpen = false, autoOpenMode = "", includeHost = false, showButton = true }) {
  const normaliseMode = (value) => value === "host" ? "host" : value === "majority" ? "majority" : value === "herd" ? "herd" : "quiz";
  const selectedMode = normaliseMode(mode);
  const automaticMode = normaliseMode(autoOpenMode || selectedMode);
  const storageKey = "gahookz-how-to-play-seen-v2-" + automaticMode;
  const [open, setOpen] = useState(false);
  const [tutorialMode, setTutorialMode] = useState(selectedMode);

  useEffect(() => {
    if (!autoOpen) return;
    try {
      if (localStorage.getItem(storageKey) === "1") return;
      localStorage.setItem(storageKey, "1");
    } catch (_error) {
      // The first-time tutorial can still open if storage is unavailable.
    }
    setTutorialMode(automaticMode);
    setOpen(true);
  }, [autoOpen, automaticMode, storageKey]);

  const showTutorial = () => {
    try {
      localStorage.setItem("gahookz-how-to-play-seen-v2-" + selectedMode, "1");
    } catch (_error) {
      // Opening the tutorial does not depend on storage.
    }
    setTutorialMode(selectedMode);
    setOpen(true);
  };

  return <>{showButton ? <button className="how-to-play-button" type="button" onClick={showTutorial}>How to play</button> : null}<GameTutorial mode={tutorialMode} includeHost={includeHost} open={open} onClose={() => setOpen(false)} /></>;
}

function ModeArt({ art }) {
  if (art === "majority") {
    return (
      <svg className="mode-art" viewBox="0 0 96 76" aria-hidden="true">
        <rect x="11" y="48" width="15" height="18" rx="4" />
        <rect x="31" y="35" width="15" height="31" rx="4" />
        <rect x="51" y="18" width="15" height="48" rx="4" />
        <path d="M72 22l6 6 12-14M11 11h34" />
      </svg>);

  }
  if (art === "herd") {
    return (
      <svg className="mode-art" viewBox="0 0 96 76" aria-hidden="true">
        <circle cx="28" cy="30" r="14" />
        <circle cx="50" cy="24" r="16" />
        <circle cx="68" cy="35" r="13" />
        <path d="M14 70c2-17 12-28 29-28 11 0 20 4 25 12 4-2 8-3 13-2 10 2 16 8 18 18z" />
        <path d="M36 55c10 6 22 6 34 0" />
      </svg>);

  }
  return (
    <svg className="mode-art" viewBox="0 0 96 76" aria-hidden="true">
      <rect x="10" y="14" width="76" height="50" rx="10" />
      <path d="M24 30h22M24 45h34M63 29l6 6 12-14" />
      <circle cx="70" cy="50" r="7" />
    </svg>);

}

function EffectsPreferenceButtons() {
  const [muted] = useMutePreference();
  const [reducedPreferred] = useReducedEffectsPreference();
  const reduced = muted || reducedPreferred;
  const toggleEffects = () => {
    const next = !reduced;
    setEffectsReducedPreference(next);
    setEffectsMuted(next);
  };
  return <button type="button" aria-pressed={reduced} onClick={toggleEffects}>{reduced ? "Use full Gahook effects" : "Reduce Gahook effects"}</button>;
}

function HostQuickMenu({ code, mode = "quiz", isPlayer, ownPlayer, customGahook, customGahookOptions, allowCustomGahooks = true, playerKey, onEditProfile, onExitAsPlayer, onReset }) {
  const menuRef = useCloseMenuOnOutside();
  const [notice, setNotice] = useState("");
  const playerLink = buildRoomLink(code);

  const shareLink = async () => {
    await shareRoomLink(playerLink);
    setNotice("Link copied");
    setTimeout(() => setNotice(""), 1600);
  };

  return (
    <details className="host-quick-menu" ref={menuRef}>
      <summary>Host menu</summary>
      <div>
        {notice ? <em>{notice}</em> : null}
        <button className="host-menu-primary" type="button" onClick={shareLink}>Share Link</button>
        <ModeTutorialLauncher mode={mode} includeHost />
        {isPlayer ? <button type="button" onClick={onEditProfile}>Change name &amp; profile</button> : null}
        {isPlayer ? <GahookFormPicker ownPlayer={ownPlayer} customGahook={customGahook} customGahookOptions={customGahookOptions} allowCustom={allowCustomGahooks} playerKey={playerKey} /> : null}
        <EffectsPreferenceButtons />
        {isPlayer ? <button type="button" onClick={onExitAsPlayer}>Exit as Player</button> : null}
        <button type="button" onClick={onReset}>Reset Lobby</button>
        <button type="button" onClick={() => navigateTo("/")}>Exit Lobby</button>
      </div>
    </details>);

}

async function shareRoomLink(link) {
  try {
    await navigator.clipboard?.writeText(link);
  } catch (_error) {
    return;
  }
  if (navigator.share) {
    try {
      await navigator.share({ title: "Join my Gahookz room", url: link });
    } catch (_error) {
      return;
    }
  }
}

function HostView({ playerKey, hostMenu, onPlayAsPlayer, onExitAsPlayer, rejoiningAsPlayer = false }) {
  const lobby = useSelector((state) => state.lobby);
  const connected = useSelector((state) => state.connected);
  const dispatch = useDispatch();
  const spokenQuestionRef = useRef("");

  useEffect(() => {
    const question = lobby.currentQuestion;
    if (lobby.phase !== "reading" || !question?.id || spokenQuestionRef.current === question.id) {
      return;
    }
    spokenQuestionRef.current = question.id;
    if (!effectsMuted() && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window) {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(question.text);
      utterance.rate = 1.08;
      speechSynthesis.speak(utterance);
    }
  }, [lobby.phase, lobby.currentQuestion]);

  const hostAction = async (path, payload = {}) => {
    const previousQuestionLimit = lobby.maxQuestionsPerPlayer;
    const isQuestionLimitUpdate = path === "/api/host/settings" && Object.prototype.hasOwnProperty.call(payload, "maxQuestionsPerPlayer");
    const optimisticSettings = path === "/api/host/settings" ?
    Object.fromEntries(Object.entries(payload).filter(([key]) => ["gameMode", "gameFamily", "quizScoring", "approveQuestions", "roundPreset", "allowCustomProfiles", "allowCustomGahooks", "promptStyle", "herdRoundTarget"].includes(key))) :
    {};
    if (Object.prototype.hasOwnProperty.call(payload, "roundPreset")) {
      optimisticSettings.plannedTotalQuestions = 0;
      optimisticSettings.estimatedDurationMs = 0;
    }
    const previousSettings = Object.fromEntries(Object.keys(optimisticSettings).map((key) => [key, lobby[key]]));
    if (isQuestionLimitUpdate) {
      dispatch({ type: "OPTIMISTIC_QUESTION_LIMIT", value: payload.maxQuestionsPerPlayer });
    }
    if (Object.keys(optimisticSettings).length) {
      dispatch({ type: "OPTIMISTIC_HOST_SETTINGS", value: optimisticSettings });
    }
    const result = await api(path, payload, { ...(isQuestionLimitUpdate ? { timeoutMs: 1000 } : {}), refresh: false });
    if (!result.ok) {
      if (isQuestionLimitUpdate) {
        dispatch({ type: "ROLLBACK_QUESTION_LIMIT", value: previousQuestionLimit });
        forceSnapshotRevert();
      }
      if (Object.keys(previousSettings).length) {
        dispatch({ type: "OPTIMISTIC_HOST_SETTINGS", value: previousSettings });
        forceSnapshotRevert();
      }
      dispatch({ type: "ERROR", value: result.error });
    } else {
      window.gahookzRefreshSnapshot?.();
    }
    return result;
    return result;
  };

  const kickPlayer = async (player) => {
    const result = await hostAction("/api/host/kick", { playerId: player.id });
    if (result.ok) dispatch({ type: "HOST_PLAYER_KICKED", value: player });
    return result;
  };
  const makePlayerHost = async (player) => {
    const result = await hostAction("/api/host/make-host", { playerId: player.id });
    if (result.ok) dispatch({ type: "HOST_TRANSFERRED", value: { playerId: player.id } });
    return result;
  };
  const randomizePlayerIdentity = async (player) => {
    const result = await hostAction("/api/host/randomize-player", { playerId: player.id });
    if (result.ok) dispatch({ type: "APPLY_PLAYER_IDENTITY", value: { playerId: player.id, name: result.name, avatarId: result.avatarId } });
    return result;
  };

  if (lobby.phase === "lobby") {
    const pokePlayer = (player) => {
      const hostPlayer = lobby.ownPlayer;
      const optimisticPoke = {
        ...optimisticPokePayload(player, hostPlayer?.name || "Host", "", "", hostPlayer?.gahookForm || getStoredGahookForm()),
        senderPlayerId: hostPlayer?.id || "host"
      };
      dispatch({ type: "OPTIMISTIC_POKE", value: optimisticPoke });
      if (hostPlayer?.id === player.id) return;
      api("/api/host/poke", { playerId: player.id }, { refresh: false }).then((result) => {
        if (!result.ok) {
          dispatch({ type: "ERROR", value: result.error });
          forceSnapshotRevert();
        }
      });
    };
    return <HostLobby lobby={lobby} playerKey={playerKey} connected={connected} hostMenu={hostMenu} onLockSetup={() => hostAction("/api/host/lock-setup", { hostWillPlay: false })} onPoke={pokePlayer} onKick={kickPlayer} onMakeHost={makePlayerHost} onRandomizeIdentity={randomizePlayerIdentity} onUnban={(player) => hostAction("/api/host/unban", { playerId: player.id })} onPlayAsPlayer={onPlayAsPlayer} onExitAsPlayer={onExitAsPlayer} rejoiningAsPlayer={rejoiningAsPlayer} onQuestionLimit={(value) => hostAction("/api/host/settings", { maxQuestionsPerPlayer: value })} onRoundPreset={(value) => hostAction("/api/host/settings", { roundPreset: value })} onSettings={(value) => hostAction("/api/host/settings", value)} onFamilyChange={(value) => hostAction("/api/host/settings", { gameFamily: value })} onScoringChange={(value) => hostAction("/api/host/settings", { quizScoring: value })} />;
  }
  if (lobby.phase === "building") {
    const pokePlayer = (player) => {
      dispatch({ type: "OPTIMISTIC_POKE", value: optimisticPokePayload(player, "Host") });
      api("/api/host/poke", { playerId: player.id }, { refresh: false }).then((result) => {
        if (!result.ok) {
          dispatch({ type: "ERROR", value: result.error });
          forceSnapshotRevert();
        }
      });
    };
    return <HostBuildingLobby lobby={lobby} playerKey={playerKey} connected={connected} hostMenu={hostMenu} onStart={() => hostAction("/api/host/start")} onForceStart={() => hostAction("/api/host/force-start")} onPoke={pokePlayer} onKick={kickPlayer} onMakeHost={makePlayerHost} onRandomizeIdentity={randomizePlayerIdentity} onUnban={(player) => hostAction("/api/host/unban", { playerId: player.id })} onApproveQuestion={(question) => hostAction("/api/host/question/approve", { questionId: question.id })} onRejectQuestion={(question) => hostAction("/api/host/question/reject", { questionId: question.id })} onPlayAsPlayer={onPlayAsPlayer} />;
  }
  if (lobby.phase === "herd-writing") {
    return <HostHerdPreparation lobby={lobby} playerKey={playerKey} connected={connected} hostMenu={hostMenu} onStart={() => hostAction("/api/host/start")} onForceStart={() => hostAction("/api/host/force-start")} />;
  }
  if (lobby.phase === "finished") {
    return <FinishedScreen lobby={lobby} connected={connected} hostMenu={hostMenu} onReset={() => hostAction("/api/host/reset")} onNewGame={() => hostAction("/api/host/new-game")} />;
  }
  const pokePlayer = (player) => {
    dispatch({ type: "OPTIMISTIC_POKE", value: optimisticPokePayload(player, "Host") });
    api("/api/host/poke", { playerId: player.id }, { refresh: false }).then((result) => {
      if (!result.ok) {
        dispatch({ type: "ERROR", value: result.error });
        forceSnapshotRevert();
      }
    });
  };
  return <HostGame lobby={lobby} connected={connected} hostMenu={hostMenu} onSkip={() => hostAction("/api/host/skip")} onPause={(paused) => hostAction("/api/host/pause", { paused })} onLeaderboardPoke={pokePlayer} />;
}

// The rules a host owns for the room, in one place, saved atomically.
//
// Deliberately NOT in here: the game selector and the game length. Those are
// the two decisions a host makes constantly and they belong on the screen, not
// behind a button.
const RULES_FIELDS = ["approveQuestions", "promptStyle", "allowCustomProfiles", "allowCustomGahooks", "gahookEffects", "lobbyArenaEnabled"];

function currentRules(lobby) {
  return {
    approveQuestions: Boolean(lobby.approveQuestions),
    promptStyle: lobby.promptStyle === "education" ? "education" : "fun",
    allowCustomProfiles: lobby.allowCustomProfiles !== false,
    allowCustomGahooks: lobby.allowCustomGahooks !== false,
    gahookEffects: ["off", "visual", "chaos"].includes(lobby.gahookEffects) ? lobby.gahookEffects : "chaos",
    lobbyArenaEnabled: lobby.lobbyArenaEnabled !== false
  };
}

function GahookEffectsHelp({ lobby }) {
  // The real numbers, read from the room rather than written into the copy,
  // so this cannot drift away from what the server actually does.
  const steal = Number(lobby.gahookStealPoints || 0);
  const penalty = Number(lobby.getGotPenaltyPoints || 0);
  return (
    <ul className="rules-help-list">
      <li><strong>Off</strong> — no Gahook interruptions during a round.</li>
      <li><strong>Visual only</strong> — reactions still happen, but nobody loses points.</li>
      <li><strong>Chaos</strong> — a Gahook steals {steal} points, and GET GOT costs {penalty}.</li>
    </ul>);

}

function HostRulesModal({ lobby, open, saving, error, onCancel, onSave }) {
  const [draft, setDraft] = useState(() => currentRules(lobby));
  const dialogRef = useRef(null);

  useEffect(() => {
    if (open) setDraft(currentRules(lobby));
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    dialogRef.current?.focus();
    const onKeyDown = (event) => {
      // Escape cancels. It must never be mistaken for Save, because a host who
      // dismisses a dialog has not agreed to anything in it.
      if (event.key === "Escape" && !saving) {
        event.stopPropagation();
        onCancel?.();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), select, [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, saving, onCancel]);

  if (!open) return null;

  const set = (patch) => setDraft((previous) => ({ ...previous, ...patch }));
  const pendingCount = Number(lobby.pendingQuestionCount || 0);
  const turningApprovalOff = Boolean(lobby.approveQuestions) && !draft.approveQuestions;
  const changed = RULES_FIELDS.some((field) => draft[field] !== currentRules(lobby)[field]);

  return (
    <div className="rules-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel?.(); }}>
      <section className="rules-modal" role="dialog" aria-modal="true" aria-labelledby="rules-modal-title" tabIndex={-1} ref={dialogRef}>
        <header className="rules-modal-header">
          <h2 id="rules-modal-title">Lobby rules</h2>
          <p>These apply to everyone in the room.</p>
        </header>

        <div className="rules-modal-body">
          <fieldset className="rules-section">
            <legend>Questions</legend>
            <label className="host-checkbox"><input type="checkbox" checked={draft.approveQuestions} onChange={(event) => set({ approveQuestions: event.target.checked })} /><span>Approve questions before they go in</span></label>
            {turningApprovalOff && pendingCount > 0 ?
            <p className="rules-consequence">Turning this off will let {pendingCount} waiting question{pendingCount === 1 ? "" : "s"} straight in. Anything over a player's limit stays saved for later.</p> :
            null}
            <div className="rules-choice" role="group" aria-label="Generated prompts">
              <span>Generated prompts</span>
              <div>
                <button className={draft.promptStyle === "fun" ? "is-selected" : ""} type="button" aria-pressed={draft.promptStyle === "fun"} onClick={() => set({ promptStyle: "fun" })}>Funny</button>
                <button className={draft.promptStyle === "education" ? "is-selected" : ""} type="button" aria-pressed={draft.promptStyle === "education"} onClick={() => set({ promptStyle: "education" })}>Educational</button>
              </div>
              <small>Changes what gets suggested next. It never rewrites a question someone already wrote.</small>
            </div>
          </fieldset>

          <fieldset className="rules-section">
            <legend>Gahook effects</legend>
            <div className="rules-choice" role="group" aria-label="Gahook effects">
              <div>
                {[["off", "Off"], ["visual", "Visual only"], ["chaos", "Chaos"]].map(([id, label]) =>
                <button className={draft.gahookEffects === id ? "is-selected" : ""} type="button" key={id} aria-pressed={draft.gahookEffects === id} onClick={() => set({ gahookEffects: id })}>{label}</button>
                )}
              </div>
            </div>
            <GahookEffectsHelp lobby={lobby} />
            <label className="host-checkbox"><input type="checkbox" checked={draft.lobbyArenaEnabled} onChange={(event) => set({ lobbyArenaEnabled: event.target.checked })} /><span>Allow 1v1 duels in the lobby</span></label>
            {!draft.lobbyArenaEnabled && lobby.lobbyArenaEnabled !== false ?
            <p className="rules-consequence">Any duel in progress will be cancelled. Nobody loses.</p> :
            null}
          </fieldset>

          <fieldset className="rules-section">
            <legend>What players may bring</legend>
            <label className="host-checkbox"><input type="checkbox" checked={draft.allowCustomProfiles} onChange={(event) => set({ allowCustomProfiles: event.target.checked })} /><span>Custom profile pictures</span></label>
            <label className="host-checkbox"><input type="checkbox" checked={draft.allowCustomGahooks} onChange={(event) => set({ allowCustomGahooks: event.target.checked })} /><span>Custom Gahooks</span></label>
            <small className="rules-note">Turning these off hides what people uploaded for this room. It is never deleted, and comes back if you turn them on again.</small>
          </fieldset>
        </div>

        {error ? <p className="rules-modal-error" role="alert">{error}</p> : null}

        <footer className="rules-modal-footer">
          <button className="secondary-button" type="button" disabled={saving} onClick={onCancel}>Cancel</button>
          <button className="primary-button" type="button" disabled={saving || !changed} onClick={() => onSave?.(draft)}>{saving ? "Saving..." : "Save changes"}</button>
        </footer>
      </section>
    </div>);

}

function LockedRulesSummary({ lobby }) {
  const rules = lobby.lockedRules;
  if (!rules) return null;
  const effects = { off: "Off", visual: "Visual only", chaos: "Chaos" }[lobby.gahookEffects] || "Chaos";
  return (
    <section className="locked-rules-summary" aria-label="Rules for this game">
      <div className="locked-rules-heading"><strong>Lobby rules</strong><em>Locked for this game</em></div>
      <dl>
        <div><dt>Playing</dt><dd>{scoringLabelFor({ gameFamily: rules.gameFamily, quizScoring: rules.quizScoring })}</dd></div>
        <div><dt>Gahook effects</dt><dd>{effects}</dd></div>
        <div><dt>Generated prompts</dt><dd>{rules.promptStyle === "education" ? "Educational" : "Funny"}</dd></div>
      </dl>
    </section>);

}

function HostLobby({ lobby, playerKey, connected, hostMenu, onLockSetup, onPoke, onKick, onMakeHost, onRandomizeIdentity, onUnban, onPlayAsPlayer, onExitAsPlayer, rejoiningAsPlayer = false, onQuestionLimit, onRoundPreset, onSettings, onFamilyChange, onScoringChange }) {
  const connectedPlayers = lobby.players.filter((player) => player.connected);
  const playerLink = buildRoomLink(lobby.code);
  const [shareNotice, setShareNotice] = useState("");
  const [visibleQuestionLimit, setVisibleQuestionLimit] = useState(lobby.maxQuestionsPerPlayer);
  const [visibleRoundPreset, setVisibleRoundPreset] = useState(lobby.roundPreset || "standard");
  const questionLimitRequestRef = useRef(0);
  const roundPresetRequestRef = useRef(0);
  const canLockSetup = connectedPlayers.length > 0;
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesError, setRulesError] = useState("");
  const rulesTriggerRef = useRef(null);

  const closeRules = () => {
    setRulesOpen(false);
    setRulesError("");
    // Focus goes back where it came from, or a keyboard user is dumped at the
    // top of the document with no idea what happened.
    rulesTriggerRef.current?.focus();
  };

  const saveRules = async (draft) => {
    setRulesSaving(true);
    setRulesError("");
    // One request for the whole dialog, carrying the revision the host was
    // looking at. A stale Save is refused outright rather than half-applied.
    const result = await onSettings?.({ ...draft, settingsRevision: lobby.settingsRevision });
    setRulesSaving(false);
    if (result?.ok === false) {
      setRulesError(result.error || "Those rules could not be saved.");
      return;
    }
    closeRules();
  };

  useEffect(() => {
    if (!questionLimitRequestRef.current) {
      setVisibleQuestionLimit(lobby.maxQuestionsPerPlayer);
    }
  }, [lobby.maxQuestionsPerPlayer]);

  useEffect(() => {
    if (!roundPresetRequestRef.current) {
      setVisibleRoundPreset(lobby.roundPreset || "standard");
    }
  }, [lobby.roundPreset]);

  const shareLobby = async () => {
    await shareRoomLink(playerLink);
    setShareNotice("Link copied");
    setTimeout(() => setShareNotice(""), 1600);
  };
  const lockSetup = async () => onLockSetup();
  const selectQuestionLimit = async (value) => {
    if (value === visibleQuestionLimit) return;
    const requestId = questionLimitRequestRef.current + 1;
    questionLimitRequestRef.current = requestId;
    const previousValue = visibleQuestionLimit;
    setVisibleQuestionLimit(value);
    const result = await onQuestionLimit(value);
    if (questionLimitRequestRef.current !== requestId) return;
    questionLimitRequestRef.current = 0;
    setVisibleQuestionLimit(result?.ok ? value : previousValue);
  };
  const selectRoundPreset = async (value) => {
    if (value === visibleRoundPreset) return;
    const requestId = roundPresetRequestRef.current + 1;
    roundPresetRequestRef.current = requestId;
    const previousValue = visibleRoundPreset;
    setVisibleRoundPreset(value);
    const result = await onRoundPreset(value);
    if (roundPresetRequestRef.current !== requestId) return;
    roundPresetRequestRef.current = 0;
    setVisibleRoundPreset(result?.ok ? value : previousValue);
  };

  return (
    <main className="host-screen host-lobby setup-lobby">
      <HostLobbyPokeEffects lobby={lobby} ownPlayer={lobby.ownPlayer} ownPoke={lobby.ownPoke} playerKey={playerKey} />
      <HostTopBar connected={connected} phase="Party View" code={lobby.code} hostMenu={hostMenu} />
      <LobbyCodeBand code={lobby.code} playerLink={playerLink} shareNotice={shareNotice} onClick={shareLobby} />
      <AccountPanel />
      <section className="host-lobby-layout has-room-status">
        <RoomStatusBanner code={lobby.code} tone="is-host-status" eyebrow="Game lobby" title="Pick the game, then bring everyone in">
          Players can join and Gahook each other while you choose the mode and options.
        </RoomStatusBanner>
        <PreviousGameSummary summary={lobby.lastGameSummary} ownPlayerId={lobby.ownPlayer?.id} />
        <div className="player-wall">
          <GahookDuelArena duel={lobby.gahookDuel} />
          <div className="section-heading">
            <h1>Players</h1>
            <span>{connectedPlayers.length}</span>
          </div>
          <div className="player-grid">
            {lobby.players.map((player) => <PlayerCard player={player} key={player.id + "-" + (player.latestPokeId || "steady")} maxQuestions={lobby.maxQuestionsPerPlayer} showQuestionStatus={false} onPoke={onPoke} onKick={onKick} onMakeHost={onMakeHost} onRandomizeIdentity={onRandomizeIdentity} onRemoveSelf={player.id === lobby.ownPlayer?.id ? onExitAsPlayer : null} />)}
            {!lobby.ownPlayer ? <button className="host-join-player-card" type="button" disabled={rejoiningAsPlayer} onClick={onPlayAsPlayer}><span className="host-join-player-icon">+</span><span><strong>{rejoiningAsPlayer ? "Rejoining..." : "Join game as player"}</strong><small>{rejoiningAsPlayer ? "Restoring your profile" : "Pick a name and profile picture"}</small></span></button> : null}
            {!lobby.players.length && lobby.ownPlayer ? <div className="empty-state">Waiting for players</div> : null}
          </div>
          {lobby.bannedPlayers?.length ? <BannedPlayersPanel players={lobby.bannedPlayers} onUnban={onUnban} /> : null}
        </div>
        <aside className="host-control-panel">
          <button className="rules-modal-trigger" type="button" ref={rulesTriggerRef} aria-haspopup="dialog" aria-expanded={rulesOpen} onClick={() => setRulesOpen(true)}>
            <span>Lobby rules</span>
            <span aria-hidden="true">⚙</span>
          </button>
          <GameFamilySelector value={familyOf(lobby)} onChange={onFamilyChange} actions={<ModeTutorialLauncher mode={lobby.gameMode} autoOpen autoOpenMode="host" includeHost />} />
          {familyOf(lobby) === "quiz" ? <MajorityScoringToggle scoring={scoringOf(lobby)} onChange={onScoringChange} /> : null}
          {familyOf(lobby) === "herd" ? <HerdLengthSelector lobby={lobby} playerCount={connectedPlayers.length} onChange={selectRoundPreset} onRoundTarget={(value) => onSettings?.({ herdRoundTarget: value })} /> : <RoundPresetSelector lobby={lobby} value={visibleRoundPreset} playerCount={connectedPlayers.length} customLimit={visibleQuestionLimit} onChange={selectRoundPreset} onQuestionLimit={selectQuestionLimit} />}
          <EffectsPreferenceButtons />
          <HostRulesModal lobby={lobby} open={rulesOpen} saving={rulesSaving} error={rulesError} onCancel={closeRules} onSave={saveRules} />
          <button className="primary-button start-button lock-setup-button" type="button" disabled={!canLockSetup} onClick={lockSetup}>Begin Game</button>
          <p className="start-scoring-summary">Playing <strong>{scoringLabelFor(lobby)}</strong>{familyOf(lobby) === "quiz" ? <span>{scoringOf(lobby) === "majority" ? " — pick what you think the room will choose." : " — pick the preset answer."}</span> : null}</p>
          <p className={canLockSetup ? "start-status is-ready" : "start-status"}>{canLockSetup ? "Options will lock when question making begins" : "Wait for a player, or join as a player yourself"}</p>
        </aside>
        <RoomSocialHub lobby={lobby} ownPlayer={lobby.ownPlayer} playerKey={playerKey} />
      </section>
    </main>);

}

function HostLobbyPokeEffects({ lobby, ownPlayer, ownPoke, playerKey }) {
  const [selfPoke, setSelfPoke] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [miniPokes, setMiniPokes] = useState([]);
  const playerIdRef = useRef("");
  const seenPokeIdRef = useRef("");
  const timersRef = useRef([]);
  const selfTimerRef = useRef(null);

  useEffect(() => () => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    clearTimeout(selfTimerRef.current);
    stopCustomGahookAudio();
  }, []);

  useEffect(() => {
    if (!ownPlayer?.id) {
      playerIdRef.current = "";
      seenPokeIdRef.current = "";
      return undefined;
    }
    if (playerIdRef.current !== ownPlayer.id) {
      playerIdRef.current = ownPlayer.id;
      seenPokeIdRef.current = ownPoke?.id || "";
      return undefined;
    }
    if (!ownPoke?.id || seenPokeIdRef.current === ownPoke.id) return undefined;
    seenPokeIdRef.current = ownPoke.id;

    const isLocalSelfPoke = String(ownPoke.id).startsWith("local-poke-") && ownPoke.playerId === ownPlayer.id;
    const needsInteraction = Boolean(lobby.ownCounterOffer?.id) || ownPoke.kind === "counter" || ownPoke.kind === "duel-challenge";
    if (isLocalSelfPoke || needsInteraction) {
      const nextPoke = { ...ownPoke, renderId: ownPoke.id + "-host-self" };
      setSelfPoke(nextPoke);
      const soundChannel = resetPokeSoundChannel();
      if (nextPoke.kind === "counter" || nextPoke.kind === "duel-challenge") playCounterGahookSound(soundChannel);
      else {
        playGahookFormSound(nextPoke.gahookForm, soundChannel, nextPoke.customGahook, pokeOverlayDurationMs(nextPoke));
        playGahookVoiceCue(soundChannel);
      }
      clearTimeout(selfTimerRef.current);
      selfTimerRef.current = setTimeout(() => {
        setSelfPoke(null);
        if (nextPoke.gahookForm === "custom") stopCustomGahookAudio();
      }, pokeOverlayDurationMs(nextPoke));
      return undefined;
    }

    const miniPoke = {
      id: ownPoke.id,
      form: getGahookForm(ownPoke.gahookForm),
      customGahook: ownPoke.customGahook || null,
      from: ownPoke.from || "Someone",
      left: 5 + Math.random() * 78,
      top: 12 + Math.random() * 68,
      rotate: -14 + Math.random() * 28
    };
    setMiniPokes((current) => [...current.slice(-9), miniPoke]);
    playGahookFormSound(ownPoke.gahookForm, resetPokeSoundChannel(), ownPoke.customGahook, 1450);
    const timer = setTimeout(() => setMiniPokes((current) => current.filter((poke) => poke.id !== miniPoke.id)), 1450);
    timersRef.current.push(timer);
    return undefined;
  }, [ownPlayer?.id, ownPoke?.id, lobby.ownCounterOffer?.id]);

  const runAction = async (path, payload = {}) => {
    if (actionBusy) return;
    setActionBusy(true);
    const result = await api(path, { playerKey, ...payload }, { refresh: false });
    setActionBusy(false);
    if (!result.ok) return;
    setSelfPoke(null);
    window.gahookzRefreshSnapshot?.();
  };
  let action = null;
  if (selfPoke && lobby.ownCounterOffer?.id) {
    action = { label: actionBusy ? "Firing back..." : "Counter Gahook", disabled: actionBusy, onClick: () => runAction("/api/player/counter-poke", { offerId: lobby.ownCounterOffer.id }) };
  } else if (selfPoke?.kind === "counter" && (selfPoke.duelChallengeUntil || 0) > Date.now()) {
    action = { label: actionBusy ? "Opening arena..." : "START GAHOOK ARENA", moving: true, disabled: actionBusy, onClick: () => runAction("/api/player/duel-challenge") };
  } else if (selfPoke?.kind === "duel-challenge" && selfPoke.duelId) {
    action = { label: actionBusy ? "Entering arena..." : "ENTER GAHOOK ARENA", moving: true, disabled: actionBusy, onClick: () => runAction("/api/player/duel-accept", { duelId: selfPoke.duelId }) };
  }

  return (
    <>
      <div className="host-mini-gahook-layer" aria-hidden="true">
        {miniPokes.map((poke) => <div className="host-mini-gahook" key={poke.id} style={{ left: poke.left + "%", top: poke.top + "%", "--mini-rotate": poke.rotate + "deg" }}><GahookOverlayVisual form={poke.form} customGahook={poke.customGahook} small /><span>by {poke.from}</span></div>)}
      </div>
      {selfPoke ? <PokeJumpScare key={selfPoke.renderId} poke={selfPoke} action={action} /> : null}
      <GahookDuelOverlay duel={lobby.gahookDuel} ownPlayer={ownPlayer} ownPoke={ownPoke} playerKey={playerKey} />
    </>);
}

function HostBuildingLobby({ lobby, playerKey, connected, hostMenu, onStart, onForceStart, onPoke, onKick, onMakeHost, onRandomizeIdentity, onUnban, onApproveQuestion, onRejectQuestion, onPlayAsPlayer }) {
  const connectedPlayers = lobby.players.filter((player) => player.connected);
  const readyPlayers = connectedPlayers.filter((player) => player.ready);
  const creationLabel = "question";
  const playerLink = buildRoomLink(lobby.code);
  const [shareNotice, setShareNotice] = useState("");

  const shareLobby = async () => {
    await shareRoomLink(playerLink);
    setShareNotice("Link copied");
    setTimeout(() => setShareNotice(""), 1600);
  };

  return (
    <main className="host-screen host-lobby building-lobby">
      <HostTopBar connected={connected} phase="Party View" code={lobby.code} hostMenu={hostMenu} />
      <LobbyCodeBand code={lobby.code} playerLink={playerLink} shareNotice={shareNotice} onClick={shareLobby} className="compact-code-band" />
      <section className="host-lobby-layout has-room-status">
        <RoomStatusBanner code={lobby.code} tone="is-building-status" eyebrow="Question time" title={"Players are making their " + creationLabel + "s"}>
          The game options are locked. Start the game when every player is ready.
        </RoomStatusBanner>
        <PreviousGameSummary summary={lobby.lastGameSummary} ownPlayerId={lobby.ownPlayer?.id} />
        <div className="player-wall">
          <GahookDuelArena duel={lobby.gahookDuel} />
          <QuestionApprovalPanel questions={lobby.pendingQuestions} onApprove={onApproveQuestion} onReject={onRejectQuestion} />
          <div className="section-heading">
            <h1>Players</h1>
            <span>{connectedPlayers.length}</span>
          </div>
          <div className="player-grid">
            {lobby.players.length ? lobby.players.map((player) => <PlayerCard player={player} key={player.id + "-" + (player.latestPokeId || "steady")} maxQuestions={lobby.maxQuestionsPerPlayer} onPoke={onPoke} onKick={onKick} onMakeHost={onMakeHost} onRandomizeIdentity={onRandomizeIdentity} />) : <div className="empty-state">Waiting for players</div>}
          </div>
          {lobby.bannedPlayers?.length ? <BannedPlayersPanel players={lobby.bannedPlayers} onUnban={onUnban} /> : null}
        </div>
        <aside className="host-control-panel">
          <section className="locked-options-summary">
            <div className="locked-options-heading"><span>Locked options</span><ModeTutorialLauncher mode={lobby.gameMode} includeHost /></div>
            <strong>{gameModeTitle(lobby.gameMode)}</strong>
            <small>{lobby.gameMode === "herd" ? "One question each" : roundPresetTitle(lobby.roundPreset)} · {plannedQuestionsForLobby(lobby, connectedPlayers.length)} total · {formatDurationEstimate(estimatedRoundDurationMs(lobby), plannedQuestionsForLobby(lobby, connectedPlayers.length))}</small>
            <small>{lobby.maxQuestionsPerPlayer} {creationLabel}{lobby.maxQuestionsPerPlayer === 1 ? "" : "s"} each · {lobby.approveQuestions ? "Host approval on" : "Host approval off"}</small>
          </section>
          <Metric label="Questions" value={lobby.questionCount} />
          <Metric label="Ready" value={readyPlayers.length + "/" + connectedPlayers.length} />
          <ForceStartControl canStart={lobby.canStart} canForceStart={connectedPlayers.length > 0} label={lobby.gameMode === "herd" ? "Deal out answer prompts" : "Start " + gameModeTitle(lobby.gameMode)} onStart={onStart} onForceStart={onForceStart} />
          <button className="secondary-button host-play-button" type="button" onClick={onPlayAsPlayer}>{lobby.ownPlayer ? "Continue as player" : "Enter as player"}</button>
          <p className={lobby.canStart ? "start-status is-ready" : "start-status"}>{lobby.canStart ? "Everyone is ready" : "Waiting for every player to finish and ready up"}</p>
        </aside>
        <RoomSocialHub lobby={lobby} ownPlayer={lobby.ownPlayer} playerKey={playerKey} />
      </section>
    </main>);

}

function HerdPreparationProgress({ preparation }) {
  const progress = preparation || { completed: 0, total: 0, players: [] };
  return (
    <section className="herd-preparation-progress">
      <header><span>Answer workshop</span><strong>{progress.completed}/{progress.total} answers written</strong></header>
      <div className="herd-progress-meter" aria-label={progress.completed + " of " + progress.total + " answers written"}><span style={{ width: (progress.total ? progress.completed / progress.total * 100 : 0) + "%" }} /></div>
      <div className="herd-writer-grid">
        {(progress.players || []).map((entry) => <article className={entry.ready ? "herd-writer-card is-ready" : "herd-writer-card"} key={entry.player.id}>
          <AvatarBadge player={entry.player} small />
          <span><strong>{entry.player.name}</strong><small>{entry.completed}/{entry.total} answers · {entry.ready ? "ready" : "writing"}</small></span>
        </article>)}
      </div>
    </section>);
}

function HostHerdPreparation({ lobby, playerKey, connected, hostMenu, onStart, onForceStart }) {
  return (
    <main className="host-screen host-lobby herd-preparation-screen">
      <HostTopBar connected={connected} phase="Party View" code={lobby.code} hostMenu={hostMenu} />
      <section className="host-lobby-layout has-room-status">
        <RoomStatusBanner code={lobby.code} tone="is-herd-status" eyebrow="Herd workshop" title="Players are writing the answer choices">
          Each player has up to four prompts. When every answer is in and everyone is ready, start the live vote.
        </RoomStatusBanner>
        <div className="player-wall">
          <HerdPreparationProgress preparation={lobby.herdPreparation} />
          <section className="herd-host-review">
            <div className="section-heading"><h1>Answer review</h1><span>{(lobby.herdAnswerReview || []).filter((item) => item.submitted).length}</span></div>
            <div className="herd-review-grid">{(lobby.herdAnswerReview || []).map((item) => <article className={item.submitted ? "is-submitted" : ""} key={item.questionId + "-" + item.answerId}>
              <span><PromptText text={item.question.text} names={item.question.namedPlayerNames} /></span><strong>{item.text || "Waiting for an answer…"}</strong><small>Answer by {item.answerAuthor.name}</small>
            </article>)}</div>
          </section>
        </div>
        <aside className="host-control-panel">
          <span className="phase-chip">Final preparation</span>
          <h2>Ready for the room vote?</h2>
          <p>Answers stay anonymous during voting. Their writers are revealed with the points.</p>
          <ForceStartControl canStart={lobby.canStart} canForceStart={(lobby.herdPreparation?.total || 0) > 0} label="Start live Herd" onStart={onStart} onForceStart={onForceStart} forceTitle="Fill missing answers and start?" forceCopy="Any blank answer slots will get a safe generated answer before the live game begins." />
          <p className={lobby.canStart ? "start-status is-ready" : "start-status"}>{lobby.canStart ? "Every answer writer is ready" : "Waiting for the Herd to finish writing"}</p>
        </aside>
        <RoomSocialHub lobby={lobby} playerKey={playerKey} />
      </section>
    </main>);
}

function HerdAnswerWriter({ assignment, playerKey }) {
  const dispatch = useDispatch();
  const [text, setText] = useState(assignment.text || "");
  const [saving, setSaving] = useState(false);
  useEffect(() => setText(assignment.text || ""), [assignment.text, assignment.questionId, assignment.answerId]);
  const save = async (event) => {
    event.preventDefault();
    if (!text.trim() || saving) return;
    setSaving(true);
    const result = await api("/api/herd/answer", { playerKey, questionId: assignment.questionId, text });
    setSaving(false);
    if (!result.ok) dispatch({ type: "ERROR", value: result.error });
  };
  return (
    <form className={assignment.submitted ? "herd-answer-writer is-submitted" : "herd-answer-writer"} onSubmit={save}>
      <span>Question by {assignment.question.author.name}</span>
      <h2><PromptText text={assignment.question.text} names={assignment.question.namedPlayerNames} /></h2>
      {assignment.question.imageDataUrl ? <img src={assignment.question.imageDataUrl} alt="Question" /> : null}
      <label><span>Your answer</span><input value={text} onChange={(event) => setText(event.target.value)} maxLength="80" placeholder="Make it the answer everyone wants to pick" /></label>
      <button className="primary-button" type="submit" disabled={!text.trim() || saving || text.trim() === assignment.text}>{saving ? "Saving" : assignment.submitted ? "Update answer" : "Lock this answer"}</button>
    </form>);
}

function PlayerHerdPreparation({ lobby, connected, ownPlayer, playerKey, hostMenu }) {
  const dispatch = useDispatch();
  const assignments = lobby.ownHerdAssignments || [];
  const allSubmitted = assignments.length > 0 && assignments.every((assignment) => assignment.submitted);
  const toggleReady = async () => {
    const previousReady = Boolean(ownPlayer.ready);
    const nextReady = !previousReady;
    dispatch({ type: "OPTIMISTIC_READY", value: nextReady });
    const result = await api("/api/player/ready", { playerKey, ready: nextReady });
    if (!result.ok) {
      dispatch({ type: "OPTIMISTIC_READY", value: previousReady });
      dispatch({ type: "ERROR", value: result.error });
    }
  };
  const hostStart = async (force = false) => {
    const result = await api(force ? "/api/host/force-start" : "/api/host/start");
    if (!result.ok) dispatch({ type: "ERROR", value: result.error });
    return result;
  };
  return (
    <main className="host-screen host-lobby player-herd-preparation">
      <HostTopBar connected={connected} phase="Party View" code={lobby.code} hostMenu={hostMenu} />
      <section className="herd-player-layout has-room-status">
        <RoomStatusBanner code={lobby.code} tone="is-herd-status" eyebrow="Herd workshop" title={assignments.length ? "Write " + assignments.length + " possible answers" : "The Herd is writing answers"}>
          Keep them funny, short, and tempting. Nobody sees who wrote an answer until the vote is over.
        </RoomStatusBanner>
        <HerdPreparationProgress preparation={lobby.herdPreparation} />
        <section className="herd-answer-workspace">
          {assignments.length ? assignments.map((assignment) => <HerdAnswerWriter assignment={assignment} playerKey={playerKey} key={assignment.questionId + "-" + assignment.answerId} />) : <div className="empty-state">You joined after prompts were dealt. Cheer on the writers—then vote in the live game.</div>}
          {allSubmitted ? <button className={ownPlayer.ready ? "ready-button is-ready" : "ready-button needs-ready"} type="button" onClick={toggleReady}>{ownPlayer.ready ? "Ready for the live vote" : "I’m done — ready up"}</button> : null}
          {lobby.isHost ? <div className="party-start-button"><ForceStartControl canStart={lobby.canStart} canForceStart={(lobby.herdPreparation?.total || 0) > 0} label="Start live Herd" onStart={() => hostStart(false)} onForceStart={() => hostStart(true)} forceTitle="Fill missing answers and start?" forceCopy="Any blank answer slots will get a safe generated answer before the live game begins." /></div> : null}
        </section>
        <RoomSocialHub lobby={lobby} ownPlayer={ownPlayer} playerKey={playerKey} />
      </section>
    </main>);
}

function ForceStartControl({ canStart, canForceStart, label = "Start game", onStart, onForceStart, forceTitle = "Players are not ready, start anyway with generated questions?", forceCopy = "Completed questions will stay. Missing questions will be filled with safe defaults for this game mode." }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!confirmOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !starting) setConfirmOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [confirmOpen, starting]);

  useEffect(() => {
    if (canStart) setConfirmOpen(false);
  }, [canStart]);

  const handleStart = () => {
    if (canStart) {
      onStart?.();
    } else if (canForceStart) {
      setConfirmOpen(true);
    }
  };
  const forceStart = async () => {
    if (starting) return;
    setStarting(true);
    const result = await onForceStart?.();
    setStarting(false);
    if (result?.ok) setConfirmOpen(false);
  };

  return (
    <>
      <button className={canStart ? "primary-button start-button" : "primary-button start-button is-force-start"} type="button" disabled={!canStart && !canForceStart} onClick={handleStart}>{label}</button>
      {confirmOpen ?
      <div className="force-start-modal" role="presentation" onPointerDown={(event) => {if (event.target === event.currentTarget && !starting) setConfirmOpen(false);}}>
          <section className="force-start-dialog" role="dialog" aria-modal="true" aria-labelledby="force-start-title">
            <span className="force-start-mark" aria-hidden="true">!</span>
            <h2 id="force-start-title">{forceTitle}</h2>
            <p>{forceCopy}</p>
            <div>
              <button className="secondary-button" type="button" disabled={starting} onClick={() => setConfirmOpen(false)}>Wait for players</button>
              <button className="primary-button force-start-confirm" type="button" disabled={starting} onClick={forceStart}>{starting ? "Generating..." : "Force start game"}</button>
            </div>
          </section>
        </div> :
      null}
    </>);

}

function BannedPlayersPanel({ players, onUnban }) {
  if (!players?.length) return null;
  return (
    <section className="banned-players-panel">
      <div className="section-heading small">
        <h2>Banned Players</h2>
        <span>{players.length}</span>
      </div>
      <div className="banned-player-list">
        {players.map((player) =>
        <article key={player.id}>
            <AvatarBadge player={player} small />
            <strong>{player.name}</strong>
            <button type="button" onClick={() => onUnban(player)}>Unban</button>
          </article>
        )}
      </div>
    </section>);

}

function QuestionApprovalPanel({ questions, onApprove, onReject }) {
  if (!questions?.length) {
    return null;
  }
  return (
    <section className="approval-panel">
      <h2>Question approvals</h2>
      {questions.map((question) =>
      <article key={question.id}>
          <div className="approval-author">
            <AvatarBadge player={question.author} small />
            <span>{question.authorName}</span>
          </div>
          <strong><PromptText text={question.text} names={question.namedPlayerNames} /></strong>
          {question.imageDataUrl ? <img src={question.imageDataUrl} alt="Pending question" /> : null}
          {question.answers?.length ?
        <ol>
              {question.answers.map((answer) => <li className={answer.correct || answer.predicted ? "is-correct" : ""} key={answer.id}>{answer.label}: {answer.text}{answer.predicted ? " · author prediction" : ""}</li>)}
            </ol> :
        null}
          <div>
            <button className="host-menu-primary" type="button" onClick={() => onApprove(question)}>Approve</button>
            <button type="button" onClick={() => onReject(question)}>Reject</button>
          </div>
        </article>
      )}
    </section>);

}

function ReadonlyPartyView({ lobby, connected, ownPlayer, playerKey, onBack }) {
  const dispatch = useDispatch();
  const [shareNotice, setShareNotice] = useState("");
  const backButton = <button className="party-back-button" type="button" onClick={onBack}>Player controls</button>;
  const playerLink = buildRoomLink(lobby.code);

  const shareLobby = async () => {
    await shareRoomLink(playerLink);
    setShareNotice("Link copied");
    setTimeout(() => setShareNotice(""), 1600);
  };
  const pokePlayer = (player) => {
    if (triggerClientOnlySelfGahook(dispatch, player, ownPlayer, ownPlayer?.name || "Someone")) return;
    dispatch({ type: "OPTIMISTIC_POKE", value: optimisticPokePayload(player, ownPlayer?.name || "Someone") });
    api("/api/player/poke", { playerKey, playerId: player.id }, { refresh: false }).then((result) => {
      if (!result.ok) {
        dispatch({ type: "ERROR", value: result.error });
        forceSnapshotRevert();
      }
    });
  };
  const voteKickPlayer = async (player) => {
    const result = await api("/api/player/vote-kick", { playerKey, playerId: player.id });
    if (!result.ok) dispatch({ type: "ERROR", value: result.error });
  };

  if (lobby.phase === "finished") {
    return <ReadonlyFinishedScreen lobby={lobby} connected={connected} backButton={backButton} onBack={onBack} playerKey={playerKey} />;
  }
  if (lobby.phase !== "lobby" && lobby.phase !== "building") {
    return <HostGame lobby={lobby} connected={connected} hostMenu={backButton} onSkip={lobby.isHost ? () => api("/api/host/skip") : undefined} onProgressComplete={() => api("/api/player/progress", { playerKey, phase: lobby.phase, questionIndex: lobby.currentQuestionIndex }, { refresh: false })} onLeaderboardPoke={pokePlayer} />;
  }

  const isBuilding = lobby.phase === "building";
  const creationLabel = "question";
  const connectedPlayers = lobby.players.filter((player) => player.connected);
  const readyPlayers = connectedPlayers.filter((player) => player.ready);

  return (
    <main className="host-screen host-lobby readonly-party-view">
      <HostTopBar connected={connected} phase="Party View" code={lobby.code} hostMenu={backButton} />
      <LobbyCodeBand code={lobby.code} playerLink={playerLink} shareNotice={shareNotice} onClick={shareLobby} className="is-readonly" />
      <section className="host-lobby-layout has-room-status">
        <RoomStatusBanner code={lobby.code} tone={isBuilding ? "is-building-status" : ""} eyebrow={isBuilding ? "Question time" : "Game lobby"} title={isBuilding ? "Players are making their " + creationLabel + "s" : "The host is choosing the game"} actions={<ModeTutorialLauncher mode={lobby.gameMode} />}>
          {isBuilding ? "Game options are locked. Watch the room get ready." : "Meet the players and Gahook freely while setup is underway."}
        </RoomStatusBanner>
        <div className="player-wall">
          <GahookDuelArena duel={lobby.gahookDuel} />
          <div className="section-heading">
            <h1>Players</h1>
            <span>{connectedPlayers.length}</span>
          </div>
          <div className="player-grid">
            {lobby.players.length ? lobby.players.map((player) => <ReadonlyPlayerCard player={player} key={player.id + "-" + (player.latestPokeId || "steady")} maxQuestions={lobby.maxQuestionsPerPlayer} showQuestionStatus={isBuilding} ownPlayer={ownPlayer} onPoke={pokePlayer} onVoteKick={voteKickPlayer} />) : <div className="empty-state">Waiting for players</div>}
          </div>
        </div>
        <aside className="host-control-panel">
          {isBuilding ? <section className="locked-options-summary"><span>Locked options</span><strong>{gameModeTitle(lobby.gameMode)}</strong><small>{roundPresetTitle(lobby.roundPreset)} · {plannedQuestionsForLobby(lobby, connectedPlayers.length)} total · {formatDurationEstimate(estimatedRoundDurationMs(lobby), plannedQuestionsForLobby(lobby, connectedPlayers.length))}</small><small>{lobby.maxQuestionsPerPlayer} {creationLabel}{lobby.maxQuestionsPerPlayer === 1 ? "" : "s"} each</small></section> : null}
          {isBuilding ? <Metric label="Questions" value={lobby.questionCount} /> : <Metric label="Players joined" value={connectedPlayers.length} />}
          {isBuilding ? <Metric label="Ready" value={readyPlayers.length + "/" + connectedPlayers.length} /> : null}
          <button className="secondary-button host-play-button" type="button" onClick={onBack}>Back to player controls</button>
        </aside>
        <RoomSocialHub lobby={lobby} ownPlayer={ownPlayer} playerKey={playerKey} />
      </section>
    </main>);

}

function HostGame({ lobby, connected, hostMenu, onSkip, onPause, onProgressComplete, onLeaderboardPoke }) {
  const question = lobby.currentQuestion;
  const duration = lobby.phaseDurations?.[lobby.phase] || 0;
  const reveal = lobby.phase === "reveal";
  const phaseLabel = reveal && lobby.gameMode === "majority" ? "Majority Reveal" : reveal && lobby.gameMode === "herd" ? "Herd Reveal" : labelForPhase(lobby.phase);
  const revealIntro = useRevealIntro(lobby.phase, lobby.phaseEndsAt, duration);
  const revealVoteDuration = reveal ? Math.max(1000, duration - REVEAL_ANSWER_SPOTLIGHT_MS) : duration;
  const revealIntroEndsAt = reveal ? lobby.phaseEndsAt - revealVoteDuration : lobby.phaseEndsAt;
  const roundActive = lobby.phase === "reading" || lobby.phase === "answering";

  return (
    <main className={"host-screen host-game phase-" + lobby.phase + " mode-" + lobby.gameMode}>
      <HostTopBar connected={connected} phase={phaseLabel} code={lobby.code} hostMenu={hostMenu} onSkip={onSkip} />
      <section className="quiz-meta-row is-two-up">
        <Metric label="Question" value={Math.max(1, lobby.currentQuestionIndex + 1) + "/" + Math.max(1, lobby.totalQuestions)} />
        <Metric label="Answers" value={lobby.answerCount + "/" + lobby.activePlayerCount} />
      </section>
      <section className="question-stage">
        {!reveal || revealIntro ? <div className="game-timer-row">
          <TimerBar key={reveal ? "answer-reveal" : lobby.phase} phaseEndsAt={reveal ? revealIntroEndsAt : lobby.phaseEndsAt} durationMs={reveal ? REVEAL_ANSWER_SPOTLIGHT_MS : duration} waiting={!reveal && lobby.phaseWaitingForProgress} paused={lobby.paused} pausedRemainingMs={lobby.pausedRemainingMs} muted={lobby.phase === "reading"} onComplete={reveal ? undefined : onProgressComplete} />
          {onPause ? <PauseButton paused={lobby.paused} onToggle={() => onPause(!lobby.paused)} /> : null}
        </div> : null}
        <div className="question-copy">
          <span className="phase-chip">{phaseLabel}</span>
          <h1>{question?.text || "Loading question"}</h1>
          {question?.authorName ? <p className="question-author-line"><AvatarBadge player={question.author || { name: question.authorName }} small /><span>By {question.authorName}</span></p> : null}
        </div>
        {question?.imageDataUrl ? <img className="question-image" src={question.imageDataUrl} alt="Question" /> : null}
      </section>
      {reveal && revealIntro ? <CorrectAnswerSpotlight question={question} gameMode={lobby.gameMode} answerSelections={lobby.answerSelections} players={lobby.players} /> : null}
      {!reveal ? <AnswerGrid answers={question?.answers || []} reveal={false} hideText={lobby.phase === "reading"} answerSelections={lobby.answerSelections} players={lobby.players} questionId={question?.id} /> : null}
      {roundActive ? <GameLeaderboardPanel lobby={lobby} hint={lobby.ownPlayer ? "Choose one friend to Gahook this question" : "Live standings"} onPoke={lobby.ownPlayer ? onLeaderboardPoke : undefined} usedPokeIds={questionUseIds(lobby)} ownPlayerId={lobby.ownPlayer?.id || ""} /> : null}
      {reveal && !revealIntro ? <RevealPanel question={question} lobby={lobby} onPoke={onLeaderboardPoke} readonly phaseEndsAt={lobby.phaseEndsAt} durationMs={revealVoteDuration} onProgressComplete={onProgressComplete} /> : null}
    </main>);

}

function ReadonlyFinishedScreen({ lobby, connected, backButton, onBack, playerKey }) {
  const finals = getFinalSpotlights(lobby);

  return (
    <main className="host-screen finished-screen readonly-party-view">
      <HostTopBar connected={connected} phase="Finished" code={lobby.code} hostMenu={backButton} />
      <FinalSpotlightRow finals={finals} apiPath="/api/player/final-poke" playerKey={playerKey} />
      <section className="final-party-grid is-readonly">
        <GameLeaderboardPanel lobby={lobby} title="Final leaderboard" limit={0} className="finale-leaderboard-panel" />
        <aside className="final-host-options">
          <h2>Party view</h2>
          <button className="secondary-button host-play-button" type="button" onClick={onBack}>Back to player view</button>
        </aside>
      </section>
      <FinalShameRow finals={finals} apiPath="/api/player/final-poke" playerKey={playerKey} />
    </main>);

}

function FinishedScreen({ lobby, connected, hostMenu, onReset, onNewGame }) {
  const finals = getFinalSpotlights(lobby);
  const winnerIds = finals.winners.map((winner) => winner.id).join(",");
  const playedRef = useRef(false);
  const dispatch = useDispatch();

  useEffect(() => {
    if (!finals.winners.length || playedRef.current) {
      return;
    }
    playedRef.current = true;
    playVictoryPartySound();
    const winnerNames = finals.winners.map((winner) => winner.name).join(", ");
    speakText((finals.winners.length > 1 ? "Joint winners " : "Winner ") + winnerNames, { rate: 0.98, pitch: 1.08, volume: 0.9 });
  }, [winnerIds]);

  const booPlayer = (player) => {
    dispatch({ type: "OPTIMISTIC_POKE", value: optimisticPokePayload(player, "Host", "boo", "BOO") });
    api("/api/host/final-poke", { playerId: player.id, finalKind: "boo" }, { refresh: false }).then((result) => {
      if (!result.ok) {
        dispatch({ type: "ERROR", value: result.error });
        forceSnapshotRevert();
      }
    });
  };

  return (
    <main className="host-screen finished-screen">
      <HostTopBar connected={connected} phase="Finished" code={lobby.code} hostMenu={hostMenu} />
      <FinalSpotlightRow finals={finals} apiPath="/api/host/final-poke" />
      <section className="final-party-grid">
        <GameLeaderboardPanel lobby={lobby} title="Final leaderboard" limit={0} className="finale-leaderboard-panel" onPoke={booPlayer} ownPlayerId={lobby.ownPlayer?.id || ""} actionLabel="Boo" />
        <aside className="final-host-options">
          <h2>Host options</h2>
          <button className="primary-button new-same-rules-button" type="button" onClick={onNewGame}>New game with same rules</button>
          <button className="primary-button start-button" type="button" onClick={onReset}>Reset Lobby</button>
        </aside>
      </section>
      <FinalShameRow finals={finals} apiPath="/api/host/final-poke" />
    </main>);

}

function PlayerView({ playerKey, hostMenu, editingProfile = false, onProfileEditComplete }) {
  const dispatch = useDispatch();
  const lobby = useSelector((state) => state.lobby);
  const connected = useSelector((state) => state.connected);
  const ownPlayer = lobby.ownPlayer;
  const [showPartyView, setShowPartyView] = useState(false);
  const [editingLocalProfile, setEditingLocalProfile] = useState(false);
  const closeProfileEditor = () => {
    setEditingLocalProfile(false);
    onProfileEditComplete?.();
  };
  const playerMenu = hostMenu || (ownPlayer ? <PlayerQuickMenu ownPlayer={ownPlayer} mode={lobby.gameMode} customGahook={lobby.ownCustomGahook} customGahookOptions={lobby.customGahookOptions} allowCustomGahooks={lobby.allowCustomGahooks !== false} playerKey={playerKey} onEditProfile={() => setEditingLocalProfile(true)} onPartyView={() => setShowPartyView(true)} /> : null);
  const [activePoke, setActivePoke] = useState(null);
  const [pokeActionBusy, setPokeActionBusy] = useState(false);
  const activePokeRef = useRef(null);
  const pokeTimeoutRef = useRef(null);
  const seenPokeIdRef = useRef("");
  const seenCounterOfferIdRef = useRef("");
  const seenRoomPokeIdRef = useRef("");
  const ownPlayerIdRef = useRef("");
  const ownPokeId = lobby.ownPoke?.id;
  const roomPokeId = lobby.roomPoke?.id;

  const showPoke = (poke) => {
    activePokeRef.current = poke;
    setActivePoke(poke);
  };

  const clearPokeTimeout = () => {
    if (pokeTimeoutRef.current) {
      clearTimeout(pokeTimeoutRef.current);
      pokeTimeoutRef.current = null;
    }
  };

  const schedulePokeHide = (poke) => {
    clearPokeTimeout();
    const hideDelay = pokeOverlayDurationMs(poke);
    pokeTimeoutRef.current = setTimeout(() => {
      activePokeRef.current = null;
      setActivePoke(null);
      if (poke?.gahookForm === "custom") stopCustomGahookAudio();
      pokeTimeoutRef.current = null;
    }, hideDelay);
  };

  useEffect(() => () => {
    clearPokeTimeout();
    stopCustomGahookAudio();
  }, []);

  useEffect(() => {
    if (!ownPlayer) {
      ownPlayerIdRef.current = "";
      seenPokeIdRef.current = "";
      return;
    }
    if (ownPlayerIdRef.current !== ownPlayer.id) {
      ownPlayerIdRef.current = ownPlayer.id;
      seenPokeIdRef.current = ownPokeId || "";
    }
  }, [ownPlayer?.id]);

  useEffect(() => {
    if (!ownPokeId || seenPokeIdRef.current === ownPokeId) {
      return undefined;
    }

    seenPokeIdRef.current = ownPokeId;
    const incomingPoke = lobby.ownPoke || {};
    const now = Date.now();
    const isUltimate = incomingPoke.kind === "ultimate";
    const isUltimateCongrats = incomingPoke.kind === "ultimate-congrats";
    const isGetGot = incomingPoke.kind === "get-got";
    const isCongrats = incomingPoke.kind === "congrats";
    const isBoo = incomingPoke.kind === "boo";
    const isCounter = incomingPoke.kind === "counter";
    const isDuelChallenge = incomingPoke.kind === "duel-challenge";
    const hasCounterOffer = (incomingPoke.counterOfferUntil || 0) > now;
    const pokeAge = now - (incomingPoke.createdAt || now);
    const ultimateStillActive = (isUltimate || isUltimateCongrats) && (incomingPoke.ultimateUntil || 0) > now;
    if (!isGetGot && !isCongrats && !isUltimateCongrats && !isBoo && !isCounter && !isDuelChallenge && !hasCounterOffer && !ultimateStillActive && pokeAge > STALE_GAHOOK_MS) {
      return undefined;
    }

    const currentPoke = activePokeRef.current;
    if (currentPoke?.kind === "get-got" && (currentPoke.getGotUntil || 0) > now) {
      return undefined;
    }
    const currentUltimateActive = currentPoke?.kind === "ultimate" && (currentPoke.ultimateUntil || 0) > now;
    const currentUltimateCongratsActive = currentPoke?.kind === "ultimate-congrats" && (currentPoke.ultimateUntil || 0) > now;

    if (isUltimate && currentUltimateActive || isUltimateCongrats && currentUltimateCongratsActive) {
      const extendedPoke = {
        ...currentPoke,
        ...incomingPoke,
        renderId: currentPoke.renderId,
        ultimateStack: Math.max(currentPoke.ultimateStack || 0, incomingPoke.ultimateStack || 0),
        ultimateUntil: Math.max(currentPoke.ultimateUntil || 0, incomingPoke.ultimateUntil || 0),
        extraBurstId: ownPokeId + "-" + Date.now()
      };
      showPoke(extendedPoke);
      schedulePokeHide(extendedPoke);
      if (isUltimateCongrats) playUltimateCongratsExtraSound();
      else {
        playUltimateExtraGahookSound();
        playGahookFormSound(incomingPoke.gahookForm, undefined, incomingPoke.customGahook, pokeOverlayDurationMs(extendedPoke));
      }
      return undefined;
    }

    const nextPoke = { ...incomingPoke, renderId: ownPokeId + "-" + Date.now(), ...(isGetGot ? { getGotUntil: now + GET_GOT_OVERLAY_MS } : {}) };
    const overlayDurationMs = pokeOverlayDurationMs(nextPoke);
    showPoke(nextPoke);
    const soundChannel = resetPokeSoundChannel();
    if (isUltimateCongrats) {
      playUltimateCongratsSound(soundChannel);
      speakText("ultimate congratulations", { rate: 0.84, pitch: 1.3, volume: 1, lang: "en-US" });
    } else if (isCongrats) {
      playCongratsSound(soundChannel);
      speakText("congratulations", { rate: 0.9, pitch: 1.25, volume: 1, lang: "en-US" });
    } else if (isBoo) {
      playBooSound(soundChannel);
      speakText("boo", { rate: 0.72, pitch: 0.52, volume: 1, lang: "en-US" });
    } else if (isGetGot) {
      playGetGotSound(soundChannel);
      speakText("get got", { rate: 0.86, pitch: 0.42, volume: 1, lang: "en-US" });
    } else if (isCounter) {
      playCounterGahookSound(soundChannel);
      speakText("counter gah hook", { rate: 0.9, pitch: 0.62, volume: 1, lang: "en-US" });
    } else if (isDuelChallenge) {
      playCounterGahookSound(soundChannel);
      speakText("Gahook Arena", { rate: 0.92, pitch: 0.72, volume: 1, lang: "en-US" });
    } else if (isUltimate) {
      playUltimateGahookSound(soundChannel);
      playGahookFormSound(incomingPoke.gahookForm, soundChannel, incomingPoke.customGahook, overlayDurationMs);
      speakText("ultimate gah hook", { rate: 0.82, pitch: 0.5, volume: 1, lang: "en-US" });
    } else {
      playGahookFormSound(incomingPoke.gahookForm, soundChannel, incomingPoke.customGahook, overlayDurationMs);
      playGahookVoiceCue(soundChannel);
      speakText("gah hook", { rate: 0.92, pitch: 0.55, volume: 1, lang: "en-US" });
    }

    schedulePokeHide(nextPoke);
    return undefined;
  }, [ownPokeId]);

  useEffect(() => {
    const offer = lobby.ownCounterOffer;
    if (!offer?.id || offer.expiresAt <= Date.now() || seenCounterOfferIdRef.current === offer.id) return undefined;
    seenCounterOfferIdRef.current = offer.id;
    const incomingPoke = lobby.ownPoke || {};
    const nextPoke = {
      ...incomingPoke,
      id: incomingPoke.id || "counter-offer-" + offer.id,
      renderId: "counter-offer-" + offer.id,
      counterOfferId: offer.id,
      counterOfferUntil: offer.expiresAt
    };
    showPoke(nextPoke);
    const soundChannel = resetPokeSoundChannel();
    playGahookFormSound(nextPoke.gahookForm, soundChannel, nextPoke.customGahook, pokeOverlayDurationMs(nextPoke));
    playGahookVoiceCue(soundChannel);
    schedulePokeHide(nextPoke);
    return undefined;
  }, [lobby.ownCounterOffer?.id]);

  useEffect(() => {
    const incomingPoke = lobby.roomPoke;
    if (!roomPokeId || incomingPoke?.kind !== "get-got" || incomingPoke.targetId === ownPlayer?.id || seenRoomPokeIdRef.current === roomPokeId) return undefined;
    seenRoomPokeIdRef.current = roomPokeId;
    const currentPoke = activePokeRef.current;
    if (currentPoke?.kind === "get-got" && (currentPoke.getGotUntil || 0) > Date.now()) return undefined;
    const getGotUntil = (incomingPoke.createdAt || Date.now()) + GET_GOT_OVERLAY_MS;
    if (getGotUntil <= Date.now()) return undefined;
    const nextPoke = { ...incomingPoke, getGotUntil, renderId: "room-get-got-" + roomPokeId };
    showPoke(nextPoke);
    const soundChannel = resetPokeSoundChannel();
    playGetGotSound(soundChannel);
    speakText("get got", { rate: 0.86, pitch: 0.42, volume: 1, lang: "en-US" });
    schedulePokeHide(nextPoke);
    return undefined;
  }, [roomPokeId, ownPlayer?.id]);

  const runPokeAction = async (path, payload) => {
    if (pokeActionBusy) return;
    setPokeActionBusy(true);
    const result = await api(path, { playerKey, ...payload }, { refresh: false });
    setPokeActionBusy(false);
    if (!result.ok) {
      dispatch({ type: "ERROR", value: result.error });
      forceSnapshotRevert();
      return;
    }
    activePokeRef.current = null;
    setActivePoke(null);
    clearPokeTimeout();
    window.gahookzRefreshSnapshot?.();
  };
  let pokeAction = null;
  if (activePoke && lobby.ownCounterOffer?.id && (lobby.ownCounterOffer.expiresAt || 0) > Date.now()) {
    pokeAction = {
      label: pokeActionBusy ? "Firing back..." : "Counter Gahook",
      disabled: pokeActionBusy,
      onClick: () => runPokeAction("/api/player/counter-poke", { offerId: lobby.ownCounterOffer.id })
    };
  } else if (activePoke?.kind === "counter" && (activePoke.duelChallengeUntil || 0) > Date.now()) {
    pokeAction = {
      label: pokeActionBusy ? "Opening arena..." : "START GAHOOK ARENA",
      moving: true,
      disabled: pokeActionBusy,
      onClick: () => runPokeAction("/api/player/duel-challenge", {})
    };
  } else if (activePoke?.kind === "duel-challenge" && activePoke.duelId && (activePoke.duelChallengeUntil || 0) > Date.now()) {
    pokeAction = {
      label: pokeActionBusy ? "Entering arena..." : "ENTER GAHOOK ARENA",
      moving: true,
      disabled: pokeActionBusy,
      onClick: () => runPokeAction("/api/player/duel-accept", { duelId: activePoke.duelId })
    };
  }
  const effectsLayer = <>
    {activePoke ? <PokeJumpScare key={activePoke.renderId || activePoke.id} poke={activePoke} action={pokeAction} /> : null}
    {!activePoke ? <CounterGahookPrompt
      offer={lobby.ownCounterOffer}
      busy={pokeActionBusy}
      onCounter={() => runPokeAction("/api/player/counter-poke", { offerId: lobby.ownCounterOffer?.id })}
    /> : null}
    <GahookDuelOverlay duel={lobby.gahookDuel} ownPlayer={ownPlayer} ownPoke={lobby.ownPoke} playerKey={playerKey} />
  </>;

  if (!ownPlayer) {
    return (
      <>
        <JoinScreen lobby={lobby} connected={connected} playerKey={playerKey} hostMenu={hostMenu} />
        {effectsLayer}
      </>);

  }
  if (editingProfile || editingLocalProfile) {
    return (
      <>
        <JoinScreen lobby={lobby} connected={connected} playerKey={playerKey} hostMenu={playerMenu} editingPlayer={ownPlayer} onEditComplete={closeProfileEditor} />
        {effectsLayer}
      </>);

  }
  if (showPartyView) {
    return (
      <>
        <ReadonlyPartyView lobby={lobby} connected={connected} ownPlayer={ownPlayer} playerKey={playerKey} onBack={() => setShowPartyView(false)} />
        {effectsLayer}
      </>);

  }
  if (lobby.phase === "lobby") {
    return (
      <>
        <PlayerWaitingLobby lobby={lobby} connected={connected} ownPlayer={ownPlayer} playerKey={playerKey} hostMenu={playerMenu} />
        {effectsLayer}
      </>);

  }
  if (lobby.phase === "building") {
    return (
      <>
        <PlayerLobby lobby={lobby} connected={connected} ownPlayer={ownPlayer} playerKey={playerKey} hostMenu={playerMenu} />
        {effectsLayer}
      </>);

  }
  if (lobby.phase === "herd-writing") {
    return (
      <>
        <PlayerHerdPreparation lobby={lobby} connected={connected} ownPlayer={ownPlayer} playerKey={playerKey} hostMenu={playerMenu} />
        {effectsLayer}
      </>);
  }
  return (
    <>
      <PlayerGame lobby={lobby} connected={connected} ownPlayer={ownPlayer} playerKey={playerKey} hostMenu={playerMenu} />
      {effectsLayer}
    </>);

}

function PlayerQuickMenu({ ownPlayer, mode = "quiz", customGahook, customGahookOptions, allowCustomGahooks = true, playerKey, onEditProfile }) {
  const menuRef = useCloseMenuOnOutside();
  const [notice, setNotice] = useState("");
  const shareLink = async () => {
    await shareRoomLink(buildRoomLink(getRoute().code));
    setNotice("Link copied");
    setTimeout(() => setNotice(""), 1400);
  };

  return (
    <details className="host-quick-menu player-quick-menu" ref={menuRef}>
      <summary>Player menu</summary>
      <div>
        {notice ? <em>{notice}</em> : null}
        <button className="host-menu-primary" type="button" onClick={shareLink}>Share Link</button>
        <ModeTutorialLauncher mode={mode} includeHost={false} />
        <button type="button" onClick={onEditProfile}>Change name &amp; profile</button>
        <GahookFormPicker ownPlayer={ownPlayer} customGahook={customGahook} customGahookOptions={customGahookOptions} allowCustom={allowCustomGahooks} playerKey={playerKey} />
        <EffectsPreferenceButtons />
        <button type="button" onClick={() => navigateTo("/")}>Exit Lobby</button>
      </div>
    </details>);

}

function GahookFormPicker({ ownPlayer, customGahook = null, customGahookOptions = null, allowCustom = true, playerKey }) {
  const dispatch = useDispatch();
  const [editingCustom, setEditingCustom] = useState(false);
  useModalBodyLock(editingCustom);
  const selectedForm = ownPlayer?.gahookForm || getStoredGahookForm();
  const slotCount = Math.max(1, Number(customGahookOptions?.slotCount) || 1);
  const selectedSlot = Math.max(0, Number(customGahookOptions?.selectedSlot) || 0);
  const accountLinked = Boolean(customGahookOptions?.accountLinked);
  const chooseGahookForm = (gahookForm) => {
    const selected = storeGahookForm(gahookForm);
    dispatch({ type: "OPTIMISTIC_GAHOOK_FORM", value: selected });
    api("/api/player/gahook-form", { playerKey, gahookForm: selected }, { refresh: false }).then((result) => {
      if (!result.ok) {
        dispatch({ type: "ERROR", value: result.error });
        forceSnapshotRevert();
      }
    });
  };
  const openOrChooseCustom = () => {
    if (customGahook?.frames?.length && selectedForm !== "custom") {
      chooseGahookForm("custom");
      return;
    }
    setEditingCustom(true);
  };
  const saveCustomGahook = async (value) => {
    const customPayload = {
      name: value.name,
      frames: value.frames,
      backgroundId: value.backgroundId,
      backgroundColor: value.backgroundColor,
      effectId: value.effectId,
      soundId: value.soundId,
      customAudioDataUrl: value.soundId === "custom" ? value.customAudioDataUrl : "",
      customAudioName: value.soundId === "custom" ? value.customAudioName : ""
    };
    const result = await api("/api/player/custom-gahook", { playerKey, slot: selectedSlot, customGahook: customPayload }, { refresh: false });
    if (!result.ok) {
      dispatch({ type: "ERROR", value: result.error });
      throw new Error(result.error || "Your custom Gahook could not be saved.");
    }
    const selection = await api("/api/player/gahook-form", { playerKey, gahookForm: "custom" }, { refresh: false });
    if (!selection.ok) {
      dispatch({ type: "ERROR", value: selection.error });
      throw new Error(selection.error || "Your custom Gahook was saved, but could not be selected.");
    }
    storeGahookForm("custom");
    dispatch({ type: "OPTIMISTIC_CUSTOM_GAHOOK", value: result.customGahook });
    setEditingCustom(false);
    window.gahookzRefreshSnapshot?.();
  };
  const chooseCustomSlot = async (slot) => {
    if (slot === selectedSlot) return;
    const result = await api("/api/player/custom-gahook-slot", { playerKey, slot }, { refresh: false });
    if (!result.ok) {
      dispatch({ type: "ERROR", value: result.error });
      return;
    }
    window.gahookzRefreshSnapshot?.();
  };
  const limits = customGahookOptions?.limits || {};
  const maxImageBytes = Math.max(100000, Math.floor((Number(limits.maxFrameChars) || 180000) * 0.72));
  const maxAudioBytes = Math.max(100000, Math.floor((Number(limits.maxAudioChars) || 280000) * 0.72));
  return (
    <>
      <fieldset className="gahook-form-picker">
        <legend>Your Gahook</legend>
        {accountLinked ? <div className="custom-gahook-slot-picker" role="group" aria-label="Saved custom Gahook slot">
          {Array.from({ length: slotCount }, (_value, slot) => <button className={slot === selectedSlot ? "is-selected" : ""} type="button" key={slot} aria-pressed={slot === selectedSlot} onClick={() => chooseCustomSlot(slot)}>Cloud {slot + 1}</button>)}
        </div> : null}
        <div>
          {GAHOOK_FORMS.map((form) => <button className={selectedForm === form.id ? "is-selected" : ""} type="button" key={form.id} aria-pressed={selectedForm === form.id} onClick={() => chooseGahookForm(form.id)}>
            <span className="gahook-form-monkey"><GahookFormVisual form={form} small /></span>
            <span>{form.label}</span>
          </button>)}
          {allowCustom ? <button className={selectedForm === "custom" ? "is-selected custom-gahook-picker-button" : "custom-gahook-picker-button"} type="button" aria-pressed={selectedForm === "custom"} onClick={openOrChooseCustom}>
            <span className="gahook-form-monkey custom-gahook-picker-preview">{customGahook?.frames?.[0] ? <img src={customGahook.frames[0]} alt="" /> : <span className="custom-gahook-draw-icon" aria-hidden="true">✎</span>}</span>
            <span>{customGahook?.frames?.length ? selectedForm === "custom" ? "Edit my custom" : "Use my custom" : "Draw my own"}</span>
          </button> : null}
        </div>
      </fieldset>
      {editingCustom ? createPortal(<div className="creation-modal-backdrop" role="presentation" onPointerDown={(event) => {
        if (event.target === event.currentTarget) setEditingCustom(false);
      }}>
        <section className="creation-modal custom-gahook-modal" role="dialog" aria-modal="true" aria-label="Make your own Gahook">
          <CustomGahookCreator
            initialValue={customGahook}
            onSave={saveCustomGahook}
            onCancel={() => setEditingCustom(false)}
            maxImageBytes={maxImageBytes}
            maxAudioBytes={maxAudioBytes}
            onPreviewPresetSound={(soundId) => playGahookFormSound("custom", resetPokeSoundChannel(), { soundId })}
          />
        </section>
      </div>, document.body) : null}
    </>);
}

function JoinQuickMenu() {
  const menuRef = useCloseMenuOnOutside();
  return (
    <details className="host-quick-menu join-quick-menu" ref={menuRef}>
      <summary>Menu</summary>
      <div>
        <EffectsPreferenceButtons />
        <button type="button" onClick={() => navigateTo("/")}>Exit Lobby</button>
      </div>
    </details>);
}

function JoinPlayerPreview({ name, avatarId, avatarImageDataUrl, code, editing = false }) {
  const previewPlayer = { name: name.trim() || "Your name", avatarId, avatarImageDataUrl };
  return (
    <section className="join-player-preview" aria-live="polite">
      <AvatarBadge player={previewPlayer} />
      <div>
        <h2>{previewPlayer.name}</h2>
        <p>{editing ? "Updating your player" : "Joining room " + (code || "----")}</p>
      </div>
      <strong>{code || "----"}</strong>
    </section>);
}

function JoinScreen({ lobby, connected, playerKey, hostMenu, editingPlayer = null, onEditComplete }) {
  const dispatch = useDispatch();
  const isEditingProfile = Boolean(editingPlayer?.id);
  const routeCode = getRoute().code;
  const saved = getSavedJoin();
  const allowCustomProfiles = lobby.allowCustomProfiles !== false;
  const [code, setCode] = useState(routeCode || saved.code || "");
  const [name, setName] = useState(() => editingPlayer?.name || saved.name || randomFunnyAnimalName());
  const initialAvatarId = editingPlayer?.avatarId || saved.avatarId || AVATAR_PRESETS[0].id;
  const [avatarId, setAvatarId] = useState(initialAvatarId);
  const avatarIdRef = useRef(initialAvatarId);
  const [avatarImageDataUrl, setAvatarImageDataUrl] = useState(allowCustomProfiles ? editingPlayer?.avatarImageDataUrl || saved.avatarImageDataUrl || "" : "");
  const [password, setPassword] = useState(() => getUrlPassword() || getSavedRoomPassword(routeCode || saved.code) || "");
  const [wrongPasswordPoke, setWrongPasswordPoke] = useState(null);
  const [joining, setJoining] = useState(false);
  const [drawingAvatar, setDrawingAvatar] = useState(false);

  const chooseAvatar = (nextAvatarId) => {
    avatarIdRef.current = nextAvatarId;
    setAvatarId(nextAvatarId);
    setAvatarImageDataUrl("");
  };

  const handleAvatarImage = (dataUrl) => {
    setAvatarImageDataUrl(dataUrl);
    avatarIdRef.current = AVATAR_PRESETS[0].id;
    setAvatarId(AVATAR_PRESETS[0].id);
  };

  const submitJoin = async (event) => {
    event.preventDefault();
    setJoining(true);
    const normalizedCode = routeCode || normaliseRoomCode(code);
    const selectedAvatarId = avatarIdRef.current;
    const gahookForm = getStoredGahookForm();
    const previousProfile = isEditingProfile ? {
      playerId: editingPlayer.id,
      name: editingPlayer.name,
      avatarId: editingPlayer.avatarId,
      avatarImageDataUrl: editingPlayer.avatarImageDataUrl || ""
    } : null;
    if (isEditingProfile) {
      dispatch({ type: "OPTIMISTIC_PLAYER_PROFILE", value: { playerId: editingPlayer.id, name: name.trim(), avatarId: selectedAvatarId, avatarImageDataUrl } });
    }
    const result = await api(isEditingProfile ? "/api/player/profile" : "/api/player/join", isEditingProfile ?
    { name, avatarId: selectedAvatarId, avatarImageDataUrl, playerKey } :
    { code: normalizedCode, name, avatarId: selectedAvatarId, avatarImageDataUrl, gahookForm, playerKey, password }, { refresh: false });
    setJoining(false);
    if (!result.ok) {
      if (previousProfile) {
        dispatch({ type: "OPTIMISTIC_PLAYER_PROFILE", value: previousProfile });
        forceSnapshotRevert();
      }
      if (result.wrongPassword || result.banned) {
        const poke = {
          id: (result.banned ? "banned-" : "wrong-password-") + Date.now(),
          createdAt: Date.now(),
          from: result.banned ? "Banned" : "Wrong password",
          message: result.banned ? "You're banned" : "Wrong password",
          kind: "normal"
        };
        setWrongPasswordPoke(poke);
        const soundChannel = resetPokeSoundChannel();
        playMonkeyPokeSound(soundChannel);
        playGahookVoiceCue(soundChannel);
        setTimeout(() => setWrongPasswordPoke(null), 1100);
      }
      dispatch({ type: "ERROR", value: result.error });
      return;
    }
    if (password) saveRoomPassword(normalizedCode, password);
    saveJoinSession({ code: normalizedCode, name, avatarId: selectedAvatarId, avatarImageDataUrl, gahookForm });
    if (isEditingProfile) onEditComplete?.();
    window.gahookzRefreshSnapshot?.();
  };

  const topMenu = hostMenu || <JoinQuickMenu />;

  return (
    <main className="host-screen host-lobby player-party-join">
      <HostTopBar connected={connected} phase="Join" code={routeCode || code} hostMenu={topMenu} />
      <div className="join-explainer-slot"><RoomStatusBanner code={routeCode || code} tone="is-join-status" eyebrow={isEditingProfile ? "Player profile" : "Joining the room"} title={isEditingProfile ? "Make your player look right" : "Choose your player"}>
          Pick your name and profile picture, then {isEditingProfile ? "save your changes." : "join the lobby."}
        </RoomStatusBanner></div>
      <form className="join-form party-join-form" onSubmit={submitJoin}>
        {routeCode || isEditingProfile ? <JoinPlayerPreview name={name} avatarId={avatarId} avatarImageDataUrl={avatarImageDataUrl} code={routeCode || code} editing={isEditingProfile} /> : <label><span>Code</span><input maxLength="4" value={code} onChange={(event) => setCode(normaliseRoomCode(event.target.value))} placeholder="GOOK" /></label>}
        <label><span>Your name</span><input maxLength="24" value={name} onChange={(event) => setName(event.target.value)} placeholder="Player" /></label>
        <AvatarPicker value={avatarId} customImage={avatarImageDataUrl} onChange={chooseAvatar} onDraw={allowCustomProfiles ? () => setDrawingAvatar(true) : null} />
        <div className="join-form-actions">
          {!isEditingProfile && lobby.hasPassword ? <label><span>Password</span><input value={password} onChange={(event) => setPassword(event.target.value)} maxLength="80" placeholder="Room password" type="password" /></label> : null}
          {isEditingProfile ? <button className="secondary-button profile-edit-cancel" type="button" onClick={onEditComplete}>Cancel</button> : null}
          <button className="primary-button" type="submit" disabled={!connected || joining || normaliseRoomCode(routeCode || code).length !== 4 || !name.trim()}>{joining ? isEditingProfile ? "Saving" : "Joining" : isEditingProfile ? "Save changes" : "Join"}</button>
        </div>
      </form>
      <AccountPanel />
      {drawingAvatar && allowCustomProfiles ? <div className="creation-modal-backdrop" role="presentation" onPointerDown={(event) => {
        if (event.target === event.currentTarget) setDrawingAvatar(false);
      }}>
        <section className="creation-modal avatar-paint-modal" role="dialog" aria-modal="true" aria-labelledby="avatar-paint-title">
          <header className="avatar-paint-modal__header">
            <div><span>Make it yours</span><h2 id="avatar-paint-title">Draw your profile picture</h2><p>Draw from scratch or upload an image here, then make it your own.</p></div>
            <button type="button" onClick={() => setDrawingAvatar(false)} aria-label="Close profile picture drawing">×</button>
          </header>
          <SimplePaintEditor
            initialImage={avatarImageDataUrl || undefined}
            onExport={(dataUrl) => {
              handleAvatarImage(dataUrl);
              setDrawingAvatar(false);
            }}
            onError={(error) => dispatch({ type: "ERROR", value: error?.message || "That profile picture could not be drawn." })}
            width={384}
            height={384}
            maxExportDimension={384}
            maxUploadBytes={20 * 1024 * 1024}
            mimeType="image/webp"
            imageQuality={0.82}
            backgroundColor="#ffffff"
            exportLabel="Use this profile picture"
            label="Draw your profile picture"
          />
        </section>
      </div> : null}
      {wrongPasswordPoke ? <PokeJumpScare key={wrongPasswordPoke.id} poke={wrongPasswordPoke} /> : null}
    </main>);

}

function PlayerWaitingLobby({ lobby, connected, ownPlayer, playerKey, hostMenu }) {
  const dispatch = useDispatch();
  const connectedPlayers = lobby.players.filter((player) => player.connected);
  const pokePlayer = (player) => {
    if (triggerClientOnlySelfGahook(dispatch, player, ownPlayer, ownPlayer.name)) return;
    dispatch({ type: "OPTIMISTIC_POKE", value: optimisticPokePayload(player, ownPlayer.name) });
    api("/api/player/poke", { playerKey, playerId: player.id }, { refresh: false }).then((result) => {
      if (!result.ok) {
        dispatch({ type: "ERROR", value: result.error });
        forceSnapshotRevert();
      }
    });
  };
  const voteKickPlayer = async (player) => {
    const result = await api("/api/player/vote-kick", { playerKey, playerId: player.id });
    if (!result.ok) dispatch({ type: "ERROR", value: result.error });
  };

  return (
    <main className="host-screen host-lobby player-waiting-lobby">
      <HostTopBar connected={connected} phase="Party View" code={lobby.code} hostMenu={hostMenu} />
      <AccountPanel />
      <section className="social-lobby-layout has-room-status">
        <RoomStatusBanner code={lobby.code} eyebrow="Game lobby" title="The host is choosing the game" keepActionsWhenHidden={false} actions={<ModeTutorialLauncher mode={lobby.gameMode} includeHost={false} />}>
          Meet the room, Gahook your friends, and wait for question time to begin.
        </RoomStatusBanner>
        <PreviousGameSummary summary={lobby.lastGameSummary} ownPlayerId={ownPlayer?.id} />
        <div className="player-wall">
          <GahookDuelArena duel={lobby.gahookDuel} />
          <div className="section-heading">
            <h1>Players</h1>
            <span>{connectedPlayers.length}</span>
          </div>
          <div className="player-grid">
            {lobby.players.length ? lobby.players.map((player) => <ReadonlyPlayerCard player={player} key={player.id + "-" + (player.latestPokeId || "steady")} maxQuestions={lobby.maxQuestionsPerPlayer} showQuestionStatus={false} ownPlayer={ownPlayer} onPoke={pokePlayer} onVoteKick={voteKickPlayer} />) : <div className="empty-state">Waiting for players</div>}
          </div>
        </div>
        <RoomSocialHub lobby={lobby} ownPlayer={ownPlayer} playerKey={playerKey} />
      </section>
    </main>);

}

function PlayerLobby({ lobby, connected, ownPlayer, playerKey, hostMenu }) {
  const dispatch = useDispatch();
  const ownQuestions = lobby.ownQuestions || [];
  const [editingQuestionId, setEditingQuestionId] = useState("");
  const editingQuestion = ownQuestions.find((question) => question.id === editingQuestionId) || null;
  const editingQuestionIndex = editingQuestion ? ownQuestions.findIndex((question) => question.id === editingQuestion.id) : -1;
  const slotsUsed = ownPlayer.questionSlotsUsed ?? (ownPlayer.questionsSubmitted || 0) + (ownPlayer.questionsPending || 0);
  const remaining = Math.max(0, lobby.maxQuestionsPerPlayer - slotsUsed);
  const questionNumber = Math.min(lobby.maxQuestionsPerPlayer, slotsUsed + 1);
  const canReady = remaining === 0 && (ownPlayer.questionsPending || 0) === 0;
  const creationLabel = "question";

  const toggleReady = async () => {
    const previousReady = Boolean(ownPlayer.ready);
    const nextReady = !previousReady;
    dispatch({ type: "OPTIMISTIC_READY", value: nextReady });
    const result = await api("/api/player/ready", { playerKey, ready: nextReady });
    if (!result.ok) {
      dispatch({ type: "OPTIMISTIC_READY", value: previousReady });
      dispatch({ type: "ERROR", value: result.error });
      forceSnapshotRevert();
    }
  };

  const pokePlayer = (player) => {
    if (triggerClientOnlySelfGahook(dispatch, player, ownPlayer, ownPlayer.name)) return;
    dispatch({ type: "OPTIMISTIC_POKE", value: optimisticPokePayload(player, ownPlayer.name) });
    api("/api/player/poke", { playerKey, playerId: player.id }, { refresh: false }).then((result) => {
      if (!result.ok) {
        dispatch({ type: "ERROR", value: result.error });
        forceSnapshotRevert();
      }
    });
  };
  const voteKickPlayer = async (player) => {
    const result = await api("/api/player/vote-kick", { playerKey, playerId: player.id });
    if (!result.ok) dispatch({ type: "ERROR", value: result.error });
  };
  const startGame = async () => {
    const result = await api("/api/host/start");
    if (!result.ok) {
      dispatch({ type: "ERROR", value: result.error });
    }
    return result;
  };
  const forceStartGame = async () => {
    const result = await api("/api/host/force-start");
    if (!result.ok) {
      dispatch({ type: "ERROR", value: result.error });
    }
    return result;
  };
  const reviewQuestion = async (question, action) => {
    const result = await api("/api/host/question/" + action, { questionId: question.id });
    if (!result.ok) dispatch({ type: "ERROR", value: result.error });
    return result;
  };
  const beginQuestionEdit = (question) => {
    setEditingQuestionId(question.id);
    if (ownPlayer.ready) {
      api("/api/player/ready", { playerKey, ready: false }).then((result) => {
        if (!result.ok) dispatch({ type: "ERROR", value: result.error });
      });
    }
  };

  return (
    <main className="host-screen host-lobby player-party-lobby">
      <HostTopBar connected={connected} phase="Party View" code={lobby.code} hostMenu={hostMenu} />
      <section className="host-lobby-layout has-room-status">
        <RoomStatusBanner code={lobby.code} tone="is-building-status" eyebrow="Question time" title={"Make " + lobby.maxQuestionsPerPlayer + " " + creationLabel + (lobby.maxQuestionsPerPlayer === 1 ? "" : "s")}>
          Submit each one, then ready up while everyone else finishes.
        </RoomStatusBanner>
        <PreviousGameSummary summary={lobby.lastGameSummary} ownPlayerId={ownPlayer?.id} />
        <div className="player-wall">
          <GahookDuelArena duel={lobby.gahookDuel} />
          {lobby.isHost ? <QuestionApprovalPanel questions={lobby.pendingQuestions} onApprove={(question) => reviewQuestion(question, "approve")} onReject={(question) => reviewQuestion(question, "reject")} /> : null}
          <div className="section-heading">
            <h1>Players</h1>
            <span>{lobby.players.filter((player) => player.connected).length}</span>
          </div>
          <div className="player-grid">
            {lobby.players.length ? lobby.players.map((player) => <ReadonlyPlayerCard player={player} key={player.id + "-" + (player.latestPokeId || "steady")} maxQuestions={lobby.maxQuestionsPerPlayer} ownPlayer={ownPlayer} onPoke={pokePlayer} onVoteKick={voteKickPlayer} />) : <div className="empty-state">Waiting for players</div>}
          </div>
        </div>
        <aside className="host-control-panel player-lobby-panel">
          <header className="question-creation-heading">
            <div><span>Question time</span><h2>{lobby.gameMode === "majority" ? "Create opinion questions" : lobby.gameMode === "herd" ? "Ask the Herd" : "Create questions"}</h2></div>
            <ModeTutorialLauncher mode={lobby.gameMode} autoOpen includeHost={false} />
          </header>
          {ownQuestions.length ? <SubmittedQuestionList questions={ownQuestions} editingQuestionId={editingQuestionId} onEdit={beginQuestionEdit} /> : null}
          {canReady && !editingQuestion ? <button className={ownPlayer.ready ? "ready-button ready-button-below is-ready" : "ready-button ready-button-below needs-ready"} type="button" onClick={toggleReady}>{ownPlayer.ready ? "Ready" : "Ready up"}</button> : null}
          {ownPlayer.questionsPending > 0 ? <div className="limit-panel">Waiting for host to approve {ownPlayer.questionsPending} {creationLabel}{ownPlayer.questionsPending === 1 ? "" : "s"}</div> : null}
          {editingQuestion || remaining > 0 ? <QuestionBuilder key={editingQuestion?.id || "new-" + questionNumber} questionNumber={editingQuestion ? editingQuestionIndex + 1 : questionNumber} totalQuestions={lobby.maxQuestionsPerPlayer} playerKey={playerKey} requiresApproval={lobby.approveQuestions} mode={lobby.gameMode} promptStyle={lobby.promptStyle} editingQuestion={editingQuestion} onEditComplete={() => setEditingQuestionId("")} onCancelEdit={() => setEditingQuestionId("")} /> : !lobby.isHost && ownPlayer.ready ? <p className="ready-waiting-status" role="status">Ready. Waiting for host to start game</p> : null}
          {lobby.isHost ? <div className="party-start-button"><ForceStartControl canStart={lobby.canStart} canForceStart={lobby.activePlayerCount > 0} label={lobby.gameMode === "herd" ? "Deal out answer prompts" : "Start game"} onStart={startGame} onForceStart={forceStartGame} /></div> : null}
        </aside>
        <RoomSocialHub lobby={lobby} ownPlayer={ownPlayer} playerKey={playerKey} />
      </section>
    </main>);

}

function SubmittedQuestionList({ questions, editingQuestionId, onEdit }) {
  return (
    <section className="submitted-question-list" aria-label="Your submitted prompts and questions">
      {questions.map((question, index) =>
      <article className={["submitted-question-banner", question.status === "pending" ? "is-pending" : "", question.id === editingQuestionId ? "is-editing" : ""].filter(Boolean).join(" ")} key={question.id} title={question.status === "pending" ? "Pending host approval" : "Submitted"}>
          <strong className="submitted-question-number">{index + 1}</strong>
          <p><PromptText text={question.text} names={question.namedPlayerNames} /></p>
          <button className="edit-question-button" type="button" aria-label={"Edit question " + (index + 1)} title={"Edit question " + (index + 1)} onClick={() => onEdit(question)}><EditMiniIcon /></button>
        </article>
      )}
    </section>);

}

function EditMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </svg>);

}

function QuestionBuilder({ questionNumber, totalQuestions, playerKey, requiresApproval = false, mode = "quiz", promptStyle = "fun", editingQuestion = null, onEditComplete, onCancelEdit }) {
  const dispatch = useDispatch();
  const initialAnswers = editingQuestion?.answers?.map((answer) => answer.text) || [];
  const [text, setText] = useState(editingQuestion?.text || "");
  const [answers, setAnswers] = useState(initialAnswers.length >= 2 ? initialAnswers : ["", ""]);
  const [correctIndex, setCorrectIndex] = useState(Math.max(0, editingQuestion?.answers?.findIndex((answer) => answer.correct || answer.predicted) ?? 0));
  const [imageDataUrl, setImageDataUrl] = useState(editingQuestion?.imageDataUrl || "");
  const [submitting, setSubmitting] = useState(false);
  const isMajority = mode === "majority";
  const isHerd = mode === "herd";
  const isEditing = Boolean(editingQuestion?.id);

  const updateAnswer = (index, value) => setAnswers((current) => current.map((answer, answerIndex) => answerIndex === index ? value : answer));
  const addAnswer = () => setAnswers((current) => current.length >= 4 ? current : [...current, ""]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionNote, setSuggestionNote] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [namedPlayerNames, setNamedPlayerNames] = useState([]);
  const useRandomPreset = async () => {
    setSuggesting(true);
    setSuggestionNote("");
    // One shared source for suggestions. The client used to hold its own copy
    // of the banks and pick from them by mode, which ignored the host's chosen
    // style and let the two drift apart.
    const result = await api("/api/question/suggest", {}, { refresh: false });
    setSuggesting(false);
    if (!result?.ok) {
      setSuggestionNote(result?.error || "Could not fetch a suggestion just now.");
      return;
    }
    const suggestion = result.suggestion;
    setTemplateId(suggestion.templateId);
    setNamedPlayerNames(suggestion.namedPlayerNames || []);
    setText(suggestion.text);
    if (isHerd) {
      // Herd uses the prompt as a writing seed. The suggested options are not
      // submitted as if players had written them.
      setSuggestionNote("Players will write their own answers to this.");
      return;
    }
    const options = suggestion.options.map((option) => option.text).slice(0, 4);
    setAnswers(options);
    if (isMajority) {
      // A prediction is optional and is the author's guess, not a correct
      // answer. It starts unset so nothing is predicted on their behalf.
      setCorrectIndex(-1);
      setSuggestionNote("Optional: predict which answer the room will choose.");
      return;
    }
    const keyed = suggestion.intendedAnswerId ?
      suggestion.options.findIndex((option) => option.id === suggestion.intendedAnswerId) :
      -1;
    setCorrectIndex(keyed);
    // An opinion prompt has no correct answer, so one is never invented here.
    // Picking at random is exactly how a funny question used to acquire a key.
    setSuggestionNote(keyed >= 0 ?
    "Verified answer selected. You can change it." :
    "Choose an intended answer for Classic.");
  };
  const removeAnswer = (index) => {
    setAnswers((current) => current.filter((_answer, answerIndex) => answerIndex !== index));
    setCorrectIndex((current) => {
      if (current === index) return 0;
      if (current > index) return current - 1;
      return current;
    });
  };

  const resetForm = () => {
    setText("");
    setAnswers(["", ""]);
    setCorrectIndex(0);
    setImageDataUrl("");
  };

  const submitQuestion = async (event) => {
    event.preventDefault();
    if (!isMajority && !isHerd && correctIndex < 0) {
      setSuggestionNote("Choose an intended answer before adding this question.");
      return;
    }
    const draft = { text, answers, correctIndex, imageDataUrl, templateId };
    if (!isEditing && !requiresApproval) {
      dispatch({ type: "OPTIMISTIC_QUESTION_SUBMITTED" });
    }
    if (!isEditing) resetForm();
    setSubmitting(true);
    const payload = {
      playerKey,
      text,
      imageDataUrl,
      // Lets the server attach the verified fact for a reveal fact check. It
      // is not a scoring key and does not decide any points.
      ...(templateId ? { templateId } : {}),
      // The server re-checks these against its own roster before storing them,
      // so this is a hint, not a grant.
      ...(namedPlayerNames.length ? { namedPlayerNames } : {}),
      answers: isHerd ? [] : answers.map((answer, index) => ({
        text: answer,
        correct: !isMajority && index === correctIndex,
        predicted: isMajority && index === correctIndex
      }))
    };
    if (isEditing) payload.questionId = editingQuestion.id;
    const result = await api(isEditing ? "/api/question/edit" : "/api/question", payload, { timeoutMs: 1200 });
    setSubmitting(false);
    if (!result.ok) {
      if (!isEditing) {
        setText(draft.text);
        setAnswers(draft.answers);
        setCorrectIndex(draft.correctIndex);
        setImageDataUrl(draft.imageDataUrl);
      }
      if (!isEditing && !requiresApproval) {
        dispatch({ type: "ROLLBACK_OPTIMISTIC_QUESTION" });
      }
      dispatch({ type: "ERROR", value: result.error });
      forceSnapshotRevert();
      return;
    }
    if (isEditing) {
      resetForm();
      onEditComplete?.();
    }
    if (result.pending) {
      dispatch({ type: "ERROR", value: "Question sent for host approval." });
      scheduleSnapshotRefresh(150);
    }
  };

  const canSubmit = text.trim().length >= 4 && (isHerd || answers.length >= 2 && answers.every((answer) => answer.trim())) && !submitting;
  const submitLabel = submitting ? "Submitting" : isEditing ? "Resubmit question" : "Submit question";
  const itemLabel = "Question";

  return (
    <form className="question-builder" onSubmit={submitQuestion}>
      <div className="builder-heading">
        <h2>{isEditing ? "Edit " + itemLabel.toLowerCase() + " " : itemLabel + " "}{questionNumber} of {totalQuestions}</h2>
        {isEditing ? <button className="cancel-edit-button" type="button" onClick={onCancelEdit}>Cancel edit</button> : null}
      </div>
      <button className="preset-question-button" type="button" disabled={suggesting} onClick={useRandomPreset}>{suggesting ? "Finding one..." : isHerd ? "Give me a Herd question" : isMajority ? "Give me an opinion question" : promptStyle === "education" ? "Give me a learning question" : "Give me a funny prompt"}</button>
      {suggestionNote ? <p className="builder-suggestion-note">{suggestionNote}</p> : null}
      <label className="question-input-label"><textarea value={text} onChange={(event) => setText(event.target.value)} maxLength="180" placeholder={isHerd ? "Ask something your friends can answer badly" : isMajority ? "Ask a funny question with no factual right answer" : "Question text"} rows="3" /></label>
      <ImageUploadDrawPicker value={imageDataUrl} onChange={setImageDataUrl} label="Optional question image" previewAlt="Question image preview" />
      {!isHerd ? <>
          <div className="builder-answer-list">
            {answers.map((answer, index) => <label className={"builder-answer answer-" + ANSWER_IDS[index]} key={ANSWER_IDS[index]}><input type="radio" name={isMajority ? "prediction" : "correct"} checked={correctIndex === index} onChange={() => setCorrectIndex(index)} aria-label={isMajority ? "Predict answer " + (index + 1) + " as most popular" : "Mark answer " + (index + 1) + " as correct"} /><input value={answer} onChange={(event) => updateAnswer(index, event.target.value)} maxLength="80" placeholder="Answer" />{answers.length > 2 ? <button type="button" onClick={() => removeAnswer(index)} aria-label="Remove answer">x</button> : null}</label>)}
          </div>
          {answers.length < 4 ? <button className={"secondary-button add-answer-button answer-" + ANSWER_IDS[answers.length]} type="button" onClick={addAnswer}>+ Add answer</button> : null}
        </> : <p className="herd-builder-note">Just write the prompt. Your friends will secretly create the answer choices in the next step.</p>}
      {isMajority ? <p className="majority-builder-note">There is no factual correct answer. Mark your prediction for the option everyone will choose; a perfect prediction earns you 100 bonus points.</p> : null}
      <button className="primary-button" type="submit" disabled={!canSubmit}>{submitLabel}</button>
    </form>);

}

function PlayerGame({ lobby, connected, ownPlayer, playerKey, hostMenu }) {
  const dispatch = useDispatch();
  const question = lobby.currentQuestion;
  const ownAnswer = lobby.ownAnswer;
  const duration = lobby.phaseDurations?.[lobby.phase] || 0;
  const questionNumberLabel = "Question " + Math.max(1, lobby.currentQuestionIndex + 1);
  const reveal = lobby.phase === "reveal";
  const phaseLabel = reveal && lobby.gameMode === "majority" ? "Majority Reveal" : reveal && lobby.gameMode === "herd" ? "Herd Reveal" : labelForPhase(lobby.phase);
  const revealIntro = useRevealIntro(lobby.phase, lobby.phaseEndsAt, duration);
  const visibleAnswerSelections = withOptimisticAnswerSelection(lobby.answerSelections, ownPlayer, ownAnswer);
  const acknowledgeProgress = () => api("/api/player/progress", { playerKey, phase: lobby.phase, questionIndex: lobby.currentQuestionIndex }, { refresh: false });

  useEffect(() => {
    if (!lobby.isHost || lobby.phase !== "reading" || !question?.id || effectsMuted() || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return undefined;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(question.text);
    utterance.rate = 1.08;
    speechSynthesis.speak(utterance);
    return undefined;
  }, [lobby.isHost, lobby.phase, question?.id]);

  const submitAnswer = async (answerId) => {
    dispatch({ type: "OPTIMISTIC_ANSWER", value: { answerId } });
    const result = await api("/api/answer", { playerKey, answerId }, { timeoutMs: 1000 });
    if (!result.ok) {
      dispatch({ type: "ROLLBACK_OPTIMISTIC_ANSWER" });
      dispatch({ type: "ERROR", value: result.error });
      forceSnapshotRevert();
    }
  };
  const gahookPlayer = (player) => {
    if (triggerClientOnlySelfGahook(dispatch, player, ownPlayer, ownPlayer.name)) return;
    dispatch({ type: "OPTIMISTIC_POKE", value: { ...optimisticPokePayload(player, ownPlayer.name), markUseScope: "question", senderPlayerId: ownPlayer.id, pointsStolen: GAHOOK_STEAL_POINTS } });
    api("/api/player/round-poke", { playerKey, playerId: player.id }, { refresh: false }).then((result) => {
      if (!result.ok) {
        dispatch({ type: "ERROR", value: result.error });
        forceSnapshotRevert();
      }
    });
  };
  const regularGahookPlayer = (player) => {
    if (triggerClientOnlySelfGahook(dispatch, player, ownPlayer, ownPlayer.name)) return;
    dispatch({ type: "OPTIMISTIC_POKE", value: { ...optimisticPokePayload(player, ownPlayer.name), markUseScope: lobby.phase === "reveal" ? "question" : "", senderPlayerId: ownPlayer.id, pointsStolen: lobby.phase === "reveal" ? GAHOOK_STEAL_POINTS : 0 } });
    api("/api/player/poke", { playerKey, playerId: player.id }, { refresh: false }).then((result) => {
      if (!result.ok) {
        dispatch({ type: "ERROR", value: result.error });
        forceSnapshotRevert();
      }
    });
  };
  const roundActive = lobby.phase === "reading" || lobby.phase === "answering";
  const revealVoteDuration = reveal ? Math.max(1000, duration - REVEAL_ANSWER_SPOTLIGHT_MS) : duration;
  const revealIntroEndsAt = reveal ? lobby.phaseEndsAt - revealVoteDuration : lobby.phaseEndsAt;

  if (lobby.phase === "finished") {
    return (
      <main className="host-screen host-game player-party-game phase-finished">
        <HostTopBar connected={connected} phase={phaseLabel} code={lobby.code} hostMenu={hostMenu} />
        <PartyFinalScoreboard lobby={lobby} ownPlayer={ownPlayer} playerKey={playerKey} onPoke={regularGahookPlayer} finished />
      </main>);

  }

  return (
    <main className={"host-screen host-game player-party-game phase-" + lobby.phase + " mode-" + lobby.gameMode}>
      <HostTopBar connected={connected} phase={phaseLabel} code={lobby.code} hostMenu={hostMenu} onSkip={lobby.isHost ? async () => {
        const result = await api("/api/host/skip");
        if (!result.ok) dispatch({ type: "ERROR", value: result.error });
      } : undefined} />
      <ModeTutorialLauncher mode={lobby.gameMode} autoOpen includeHost={false} showButton={false} />
      <section className="quiz-meta-row is-two-up">
        <Metric label="Question" value={Math.max(1, lobby.currentQuestionIndex + 1) + "/" + Math.max(1, lobby.totalQuestions)} />
        <Metric label="Answers" value={lobby.answerCount + "/" + lobby.activePlayerCount} />
      </section>
      {question && lobby.phase !== "finished" ?
      <section className="question-stage">
          {!reveal || revealIntro ? <div className="game-timer-row">
            <TimerBar key={reveal ? "answer-reveal" : lobby.phase} phaseEndsAt={reveal ? revealIntroEndsAt : lobby.phaseEndsAt} durationMs={reveal ? REVEAL_ANSWER_SPOTLIGHT_MS : duration} waiting={!reveal && lobby.phaseWaitingForProgress} paused={lobby.paused} pausedRemainingMs={lobby.pausedRemainingMs} muted={lobby.phase === "reading"} onComplete={reveal ? undefined : acknowledgeProgress} />
            {lobby.isHost ? <PauseButton paused={lobby.paused} onToggle={async () => {
              const result = await api("/api/host/pause", { paused: !lobby.paused });
              if (!result.ok) dispatch({ type: "ERROR", value: result.error });
            }} /> : null}
          </div> : null}
          <div className="question-copy">
            <span className="phase-chip">{questionNumberLabel}</span>
            <h1><PromptText text={question.text} names={question.namedPlayerNames} /></h1>
            {question.authorName ? <p className="question-author-line"><AvatarBadge player={question.author || { name: question.authorName }} small /><span>By {question.authorName}</span></p> : null}
          </div>
          {question.imageDataUrl ? <img className="question-image" src={question.imageDataUrl} alt="Question" /> : null}
        </section> :
      null}
      {roundActive ? <AnswerGrid answers={question?.answers || []} reveal={false} hideText={lobby.phase === "reading"} interactive={lobby.phase === "answering"} disabled={Boolean(ownAnswer)} selectedAnswerId={ownAnswer?.answerId} onAnswer={submitAnswer} answerSelections={visibleAnswerSelections} players={lobby.players} questionId={question?.id} /> : null}
      {roundActive ? <GameLeaderboardPanel lobby={lobby} hint="Choose one friend to Gahook this question" onPoke={gahookPlayer} usedPokeIds={questionUseIds(lobby)} ownPlayerId={ownPlayer.id} /> : null}
      {reveal && revealIntro ? <CorrectAnswerSpotlight question={question} gameMode={lobby.gameMode} answerSelections={lobby.answerSelections} players={lobby.players} /> : null}
      {reveal && !revealIntro ? <RevealPanel question={question} lobby={lobby} playerKey={playerKey} onPoke={regularGahookPlayer} phaseEndsAt={lobby.phaseEndsAt} durationMs={revealVoteDuration} onProgressComplete={acknowledgeProgress} /> : null}
    </main>);

}

function GahookRoster({ lobby, ownPlayer, title, onPoke, disabled = false, mode = "lobby", usedPokeIds = [] }) {
  const inGame = mode === "game";
  const usedTargets = new Set(usedPokeIds);
  const questionUseSpent = inGame && usedTargets.size > 0;
  return (
    <section className={inGame ? "party-roster is-game-roster" : "party-roster"}>
      <div className="roster-heading">
        <h2>{title}</h2>
      </div>
      {lobby.players.map((player) =>
      <div className={[player.latestPokeId ? "roster-row is-gahooked" : "roster-row", player.latestPokeKind === "ultimate" ? "is-ultimate-gahooked" : ""].filter(Boolean).join(" ")} key={player.id + "-" + (player.latestPokeId || "steady")}>
          <AvatarBadge player={player} small />
          <span>{player.name}</span>
          <em>{inGame ? player.score + " pts" : player.ready ? "Ready" : player.questionsSubmitted + "/" + lobby.maxQuestionsPerPlayer}</em>
          <button className={player.id === ownPlayer.id ? "roster-poke is-self-poke" : "roster-poke"} type="button" title={inGame && player.id === ownPlayer.id ? "Choose another player to steal 50 points" : ""} disabled={!player.connected || disabled || questionUseSpent || inGame && player.id === ownPlayer.id} onClick={() => onPoke(player)}><GahookLabel player={player} /></button>
        </div>
      )}
    </section>);

}

function RoomStatusBanner({ code, tone = "", eyebrow, title, children, actions = null, keepActionsWhenHidden = true }) {
  const explainerScope = String(tone || eyebrow || title || "room").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const storageKey = "gahookz-room-explainer-hidden-" + normaliseRoomCode(code) + "-" + explainerScope + "-" + getClientKey();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch (_error) {
      return false;
    }
  });
  const dismiss = (event) => {
    event?.preventDefault();
    event?.stopPropagation();
    setHidden(true);
    try {
      localStorage.setItem(storageKey, "1");
    } catch (_error) {
      // The banner can still be dismissed for this render if storage is unavailable.
    }
  };

  if (hidden) return actions && keepActionsWhenHidden ? <section className="room-status-banner is-actions-only" aria-label="Game help">{actions}</section> : null;
  return (
    <section className={["room-status-banner", tone].filter(Boolean).join(" ")}>
      <button className="room-status-dismiss" type="button" onClick={dismiss} aria-label="Hide room explainer">x</button>
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      <div className="room-status-copy"><p>{children}</p>{actions}</div>
    </section>);
}

function HostTopBar({ connected, phase, code = "", hostMenu, onSkip }) {
  const stateLabel = phase === "Join" ? "Join" : phase === "Party View" ? "Lobby" : "Live";
  return <header className="host-topbar"><div className="brand-lockup"><strong>Gahookz</strong></div><div className="host-actions">{onSkip ? <button className="host-skip-phase-button" type="button" onClick={onSkip}>Skip phase <span aria-hidden="true">→</span></button> : null}<span className={"phase-pill is-" + stateLabel.toLowerCase()}>{stateLabel}</span>{code ? <strong className="topbar-room-code" aria-label={"Room " + code}>{code}</strong> : null}{hostMenu}</div></header>;
}

function Metric({ label, value }) {
  return <div className="metric-row"><span>{label}</span><strong>{value}</strong></div>;
}

function PlayerCard({ player, maxQuestions, showQuestionStatus = true, onPoke, onKick, onMakeHost, onRandomizeIdentity, onRemoveSelf }) {
  const [menuRef, closeMenu] = useDetailsMenu();
  const [activeAction, setActiveAction] = useState("");
  const dispatch = useDispatch();
  const runPlayerAction = async (action, handler) => {
    if (activeAction) return;
    setActiveAction(action);
    try {
      if (typeof handler !== "function") throw new Error("That host action is not available.");
      const result = await handler(player);
      if (result?.ok) closeMenu();
    } catch (_error) {
      dispatch({ type: "ERROR", value: "That host action did not complete. Please try again." });
    } finally {
      setActiveAction("");
    }
  };
  const actionBusy = Boolean(activeAction);

  return (
    <article className={[player.connected ? "player-card" : "player-card is-offline", player.ready ? "is-ready" : "", player.latestPokeId ? "is-gahooked" : "", player.latestPokeKind === "ultimate" ? "is-ultimate-gahooked" : ""].filter(Boolean).join(" ")}>
      <AvatarBadge player={player} />
      <div>
        <div className="player-card-name-row">
          <h2>{player.name}</h2>
          {player.isHost ? <span className="player-host-chip">Host</span> : null}
        </div>
        <p>{showQuestionStatus ? player.ready ? "Ready" : player.questionsSubmitted + "/" + maxQuestions + " questions" : "In lobby"}</p>
      </div>
      {!player.connected ? <span className="player-status">Offline</span> : null}
      <div className="player-card-actions">
        <details className="player-action-menu" ref={menuRef} aria-busy={activeAction ? "true" : "false"}>
          <summary className="player-action-trigger" aria-label="Player actions"><span className="burger-lines" aria-hidden="true"><i /><i /><i /></span></summary>
          <div>
            {onRemoveSelf ? <button type="button" disabled={actionBusy} onClick={() => runPlayerAction("remove", onRemoveSelf)}>{activeAction === "remove" ? "Leaving player slot..." : "Leave as player"}</button> : null}
            <button type="button" disabled={actionBusy || !player.connected || player.isHost} onClick={() => runPlayerAction("host", onMakeHost)}>{activeAction === "host" ? "Making host..." : "Make host"}</button>
            <button type="button" disabled={actionBusy} onClick={() => runPlayerAction("randomize", onRandomizeIdentity)}>{activeAction === "randomize" ? "Randomizing name & pfp..." : "Randomize name & pfp"}</button>
            <button type="button" disabled={actionBusy || player.isHost} onClick={() => runPlayerAction("kick", onKick)}>{activeAction === "kick" ? "Kicking..." : "Kick"}</button>
          </div>
        </details>
        <button className="poke-hint" type="button" disabled={!player.connected} onClick={() => onPoke(player)}><GahookLabel player={player} /></button>
      </div>
    </article>);

}

function ReadonlyPlayerCard({ player, maxQuestions, showQuestionStatus = true, ownPlayer, onPoke, onVoteKick }) {
  const [menuRef, closeMenu] = useDetailsMenu();
  const voteKick = () => {
    closeMenu();
    onVoteKick(player);
  };

  return (
    <article className={[player.connected ? "player-card readonly-player-card" : "player-card readonly-player-card is-offline", player.ready ? "is-ready" : "", player.latestPokeId ? "is-gahooked" : "", player.latestPokeKind === "ultimate" ? "is-ultimate-gahooked" : ""].filter(Boolean).join(" ")}>
      <AvatarBadge player={player} />
      <div>
        <div className="player-card-name-row">
          <h2>{player.name}</h2>
          {player.isHost ? <span className="player-host-chip">Host</span> : null}
        </div>
        <p>{showQuestionStatus ? player.ready ? "Ready" : player.questionsSubmitted + "/" + maxQuestions + " questions" : "In lobby"}</p>
      </div>
      {!player.connected ? <span className="player-status">Offline</span> : null}
      <div className="player-card-actions">
        <details className="player-action-menu player-vote-menu" ref={menuRef}>
          <summary className="player-action-trigger" aria-label="Player actions"><span className="burger-lines" aria-hidden="true"><i /><i /><i /></span></summary>
          <div>
            <button type="button" disabled={!player.connected || player.id === ownPlayer?.id || player.isHost} onClick={voteKick}>Vote kick {player.kickVotes || 0}</button>
          </div>
        </details>
        <button className="poke-hint" type="button" disabled={!player.connected} onClick={() => onPoke(player)}><GahookLabel player={player} /></button>
      </div>
    </article>);

}

function withOptimisticAnswerSelection(answerSelections, ownPlayer, ownAnswer) {
  const selections = Array.isArray(answerSelections) ? answerSelections : [];
  if (!ownPlayer?.id || !ownAnswer?.answerId || selections.some((selection) => selection.isOwn || selection.playerId === ownPlayer.id)) {
    return selections;
  }
  return [...selections, {
    playerId: ownPlayer.id,
    answerId: ownAnswer.answerId,
    answeredAt: ownAnswer.answeredAt || Date.now()
  }];
}

function AnswerGrid({ answers, reveal, hideText = false, interactive = false, disabled = false, selectedAnswerId = "", onAnswer, answerSelections = [], players = [], questionId = "" }) {
  const gridClassName = ["answer-grid", hideText ? "is-reading-preview" : "", interactive ? "is-interactive" : "", disabled && selectedAnswerId ? "is-locked" : ""].filter(Boolean).join(" ");
  const seenSelectionIdsRef = useRef(new Set());
  const selectionQuestionRef = useRef("");
  const playerById = new Map(players.map((player) => [player.id, player]));
  const choicesByAnswer = answerSelections.reduce((groups, selection) => {
    if (selection.answerId) {
      const player = playerById.get(selection.playerId);
      if (player) groups[selection.answerId] = [...(groups[selection.answerId] || []), player];
    }
    return groups;
  }, {});
  const selectionKey = answerSelections.map((selection) => (selection.selectionId || selection.playerId) + ":" + selection.answerId).sort().join("|");

  useEffect(() => {
    const currentIds = answerSelections.map((selection) => (selection.selectionId || selection.playerId) + ":" + selection.answerId);
    if (selectionQuestionRef.current !== questionId) {
      selectionQuestionRef.current = questionId;
      seenSelectionIdsRef.current = new Set(currentIds);
      return;
    }
    const newIds = currentIds.filter((id) => !seenSelectionIdsRef.current.has(id));
    seenSelectionIdsRef.current = new Set(currentIds);
    if (newIds.length) {
      playAnswerOohSound(newIds.length);
    }
  }, [questionId, selectionKey]);

  return (
    <section className={gridClassName}>
      {answers.map((answer) => {
        const answerChoices = choicesByAnswer[answer.id] || [];
        const className = ["answer-tile", "answer-" + answer.id, reveal && answer.correct ? "is-correct" : "", reveal && !answer.correct ? "is-dimmed" : "", selectedAnswerId === answer.id ? "is-selected" : "", answerChoices.length ? "has-answer-players" : ""].filter(Boolean).join(" ");
        const label = hideText ? "..." : answer.text || answer.label;
        const content = <><span>{label}</span>{reveal && answer.correct ? <strong>OK</strong> : null}{reveal && answer.author ? <small className="herd-answer-author"><AvatarBadge player={answer.author} small />by {answer.author.name} · +{answer.authoredPoints || 0} author pts</small> : null}{answerChoices.length ? <AnswerChoicePlayers players={answerChoices} /> : null}</>;
        return interactive ?
        <button className={className} key={answer.id} type="button" disabled={disabled} onClick={() => onAnswer?.(answer.id)}>{content}</button> :
        <article className={className} key={answer.id}>{content}</article>;
      })}
    </section>);

}

function AnswerChoicePlayers({ players, anonymous = false }) {
  if (anonymous) {
    return (
      <span className="answer-choice-players is-anonymous" aria-label={players.length + " hidden player choice" + (players.length === 1 ? "" : "s")}>
        {players.map((choice, index) => <span className="answer-choice-player is-anonymous" key={choice.selectionId || index}><span className="anonymous-answer-avatar" aria-hidden="true"><i /><i /></span></span>)}
      </span>);
  }
  return (
    <span className="answer-choice-players" aria-label={players.map((player) => player.name).join(", ")}>
      {players.map((player) => <span className="answer-choice-player" key={player.id} title={player.name}><AvatarBadge player={player} small /></span>)}
    </span>);

}

function GahookLabel({ text = "Gahook" }) {
  return <span className="gahook-button-label"><span>{text}</span></span>;
}

function getPokeFlashClass(player) {
  if (!player?.latestPokeId) return "";
  if (player.latestPokeKind === "congrats" || player.latestPokeKind === "ultimate-congrats") return "is-final-congrats";
  if (player.latestPokeKind === "boo" || player.latestPokeKind === "get-got") return "is-final-boo";
  if (player.latestPokeKind === "ultimate") return "is-ultimate-gahooked";
  return "is-gahooked";
}

function LeaderboardStrip({ leaderboard, onPoke }) {
  return <aside className="leaderboard-strip">{leaderboard.slice(0, 4).map((player) => {
      const rowClass = [getPokeFlashClass(player), onPoke ? "has-gahook-action" : ""].filter(Boolean).join(" ");
      return <div className={rowClass} key={player.id + "-" + (player.latestPokeId || "steady")}><span>{player.rank}</span><AvatarBadge player={player} small /><strong title={player.name}>{player.name}</strong><em>{player.score}</em>{onPoke ? <button className="leaderboard-gahook" type="button" disabled={!player.connected} onClick={() => onPoke(player)}><GahookLabel player={player} /></button> : null}</div>;
    })}</aside>;
}

function LeaderboardList({ leaderboard, large, onPoke, usedPokeIds = [], ownPlayerId = "", actionLabel = "" }) {
  const usedTargets = new Set(usedPokeIds);
  const questionUseSpent = usedTargets.size > 0;
  return <ol className={large ? "leaderboard-list is-large" : "leaderboard-list"}>{leaderboard.map((player) => {
      const rowClass = [getPokeFlashClass(player), onPoke ? "has-gahook-action" : ""].filter(Boolean).join(" ");
      const isSelf = Boolean(ownPlayerId && player.id === ownPlayerId);
      return <li className={rowClass} key={player.id + "-" + (player.latestPokeId || "steady")}><span>{player.rank}</span><AvatarBadge player={player} small /><strong title={player.name}>{player.name}</strong><em>{player.score} pts</em>{onPoke ? <button className="leaderboard-gahook" type="button" disabled={!player.connected || questionUseSpent || isSelf} title={isSelf ? "You cannot Gahook yourself" : questionUseSpent ? "You already used your Gahook this question" : ""} onClick={() => onPoke(player)}><GahookLabel player={player} text={actionLabel} /></button> : null}</li>;
    })}</ol>;
}

function GameLeaderboardPanel({ lobby, title = "Leaderboard", hint = "", onPoke, usedPokeIds = [], ownPlayerId = "", limit = 6, actionLabel = "", className = "" }) {
  const leaderboard = Array.isArray(lobby?.leaderboard) ? lobby.leaderboard : [];
  const visibleLeaderboard = limit > 0 ? leaderboard.slice(0, limit) : leaderboard;
  return (
    <section className={["reveal-leaderboard-panel", "game-leaderboard-panel", className].filter(Boolean).join(" ")}>
      <header className="game-leaderboard-heading"><h2>{title}</h2>{hint ? <span>{hint}</span> : null}</header>
      <LeaderboardList leaderboard={visibleLeaderboard} large onPoke={onPoke} usedPokeIds={usedPokeIds} ownPlayerId={ownPlayerId} actionLabel={actionLabel} />
    </section>);
}

function getPlayerForQuestionResult(lobby, result) {
  if (!result) return null;
  const resultId = result.author?.id;
  return lobby.leaderboard.find((player) => player.id === resultId) ||
  lobby.players.find((player) => player.id === resultId) || (
  result.author ? { ...result.author, score: 0, connected: true, shamePokes: 0 } : null);
}

function getFinalSpotlights(lobby) {
  const best = lobby.questionResults?.best || null;
  const worst = lobby.questionResults?.worst || null;
  const leaderboard = lobby.leaderboard || [];
  const findRankedPlayer = (candidate) => {
    const id = typeof candidate === "string" ? candidate : candidate?.id;
    return leaderboard.find((player) => player.id === id) || (typeof candidate === "object" ? candidate : null);
  };
  const uniquePlayers = (candidates) => Array.from(new Map(candidates.map(findRankedPlayer).filter(Boolean).map((player) => [player.id, player])).values());
  const topScore = leaderboard[0]?.score;
  const bottomScore = leaderboard[leaderboard.length - 1]?.score;
  const fallbackWinners = leaderboard.filter((player) => player.score === topScore);
  const winnerCandidates = Array.isArray(lobby.winners) && lobby.winners.length ? lobby.winners : lobby.winner ? [lobby.winner] : fallbackWinners;
  const winners = uniquePlayers(winnerCandidates);
  const winnerIds = new Set(winners.map((player) => player.id));
  const fallbackLosers = leaderboard.length > 1 && bottomScore < topScore ? leaderboard.filter((player) => player.score === bottomScore) : [];
  const loserCandidates = Array.isArray(lobby.losers) ? lobby.losers : lobby.loser ? [lobby.loser] : fallbackLosers;
  const losers = uniquePlayers(loserCandidates).filter((player) => !winnerIds.has(player.id));
  return {
    gameMode: lobby.gameMode || "quiz",
    winners,
    losers,
    winner: winners[0] || null,
    loser: losers[0] || null,
    bestResult: best,
    worstResult: worst,
    bestPlayer: getPlayerForQuestionResult(lobby, best),
    worstPlayer: getPlayerForQuestionResult(lobby, worst)
  };
}

function finalModeLabels(mode = "quiz") {
  return {
    bestTitle: mode === "herd" ? "Best prompt" : "Best question",
    worstTitle: mode === "herd" ? "Worst prompt" : "Worst question",
    bestFallback: "Crowd favorite",
    worstFallback: "Crowd groaned",
    statLabel: mode === "herd" ? "prompt score" : "question score"
  };
}

function FinalSpotlightRow({ finals, apiPath = "", playerKey = "", readonly = false }) {
  const isTie = finals.winners.length > 1;
  const winnerNames = finals.winners.map((winner) => winner.name).join(" & ");
  const winningScore = finals.winners[0]?.score || 0;
  return (
    <section className="winner-band finale-winner-stage" aria-label="Game winners">
      <div className="finale-confetti" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <span>Final scores are in</span>
      <h1>{finals.winners.length ? isTie ? "It’s a tie!" : winnerNames + " wins!" : "What a game!"}</h1>
      <p>{finals.winners.length ? isTie ? winnerNames + " share first place on " + winningScore + " points." : "Top of the room with " + winningScore + " points." : "The room made it to the finish together."}</p>
      <div className="finale-winner-cards">
        {finals.winners.map((winner) => <FinalGahookCard compact key={winner.id + "-" + (winner.latestPokeId || "steady")} player={winner} role="winner" title={isTie ? "Joint winner" : "Champion"} stat={winner.score + " pts"} detail={(winner.congratulationsCount || 0) + " congratulations"} apiPath={apiPath} playerKey={playerKey} buttonLabel="Congratulate" finalKind="congrats" readonly={readonly} />)}
      </div>
    </section>);

}

function FinalShameRow({ finals, apiPath = "", playerKey = "", readonly = false }) {
  const labels = finalModeLabels(finals.gameMode);
  const hasAwards = finals.bestPlayer || finals.worstPlayer || finals.losers.length;
  if (!hasAwards) return null;
  return (
    <section className="finale-party-awards final-shame-row">
      <header><span>Party awards</span><h2>One last cheer—and a little chaos</h2><p>The moments your room will still be arguing about tomorrow.</p></header>
      <div className="finale-awards-grid">
        {finals.bestPlayer ? <FinalGahookCard compact key={finals.bestPlayer.id + "-" + (finals.bestPlayer.latestPokeId || "steady") + "-best"} player={finals.bestPlayer} role="best" title={labels.bestTitle} stat={(finals.bestResult?.voteScore || 0) + " " + labels.statLabel} detail={finals.bestResult?.text || labels.bestFallback} apiPath={apiPath} playerKey={playerKey} buttonLabel="Congratulate" finalKind="congrats" readonly={readonly} /> : null}
        {finals.losers.map((loser) => <FinalGahookCard compact key={loser.id + "-" + (loser.latestPokeId || "steady")} player={loser} role="loser" title={finals.losers.length > 1 ? "Joint last place" : "Last place legend"} stat={loser.score + " pts"} detail={(loser.shamePokes || 0) + " Gahooks received"} apiPath={apiPath} playerKey={playerKey} buttonLabel="Send a boo" finalKind="boo" readonly={readonly} />)}
        {finals.worstPlayer ? <FinalGahookCard compact key={finals.worstPlayer.id + "-" + (finals.worstPlayer.latestPokeId || "steady") + "-worst"} player={finals.worstPlayer} role="worst" title={labels.worstTitle} stat={(finals.worstResult?.voteScore || 0) + " " + labels.statLabel} detail={finals.worstResult?.text || labels.worstFallback} apiPath={apiPath} playerKey={playerKey} buttonLabel="Send a boo" finalKind="boo" readonly={readonly} /> : null}
      </div>
    </section>);

}

function FinalGahookCard({ player, role, apiPath, playerKey = "", buttonLabel = "GAHOOK", title = "", stat = "", detail = "", mediaImage = "", finalKind = "", readonly = false, compact = false }) {
  const dispatch = useDispatch();

  const sendGahook = () => {
    const message = finalKind === "congrats" ? "CONGRATULATIONS" : finalKind === "boo" ? "BOO" : "";
    dispatch({ type: "OPTIMISTIC_POKE", value: optimisticPokePayload(player, "Finale", finalKind, message) });
    const payload = playerKey ? { playerKey, playerId: player.id, finalKind } : { playerId: player.id, finalKind };
    api(apiPath, payload, { refresh: false }).then((result) => {
      if (!result.ok) {
        dispatch({ type: "ERROR", value: result.error });
        forceSnapshotRevert();
      }
    });
  };

  return (
    <article className={["final-gahook-card", "is-" + role, compact ? "is-compact" : "", mediaImage ? "has-media-image" : "", getPokeFlashClass(player)].filter(Boolean).join(" ")}>
      <span>{title || (role === "winner" ? "Winner" : "Loser")}</span>
      <AvatarBadge player={player} />
      <h2>{player.name}</h2>
      {mediaImage ? <img className="final-award-image" src={mediaImage} alt="Award image" /> : null}
      <strong>{stat || player.score + " pts"}</strong>
      <em>{detail || "GOT GAHOOKED ON " + (player.shamePokes || 0)}</em>
      {!readonly ? <button type="button" onClick={sendGahook}><GahookLabel player={player} text={buttonLabel} /></button> : null}
    </article>);

}

function FinalReadOnlyCard({ player, role, title = "", stat = "", detail = "" }) {
  return (
    <article className={"final-gahook-card final-readonly-card is-" + role}>
      <span>{title || (role === "winner" ? "Winner" : "Loser")}</span>
      <AvatarBadge player={player} />
      <h2>{player.name}</h2>
      <strong>{stat || player.score + " pts"}</strong>
      <em>{detail || "GOT GAHOOKED ON " + (player.shamePokes || 0)}</em>
    </article>);

}

function useRevealIntro(phase, phaseEndsAt, durationMs) {
  const remainingMs = useCountdown(phaseEndsAt);
  if (phase !== "reveal" || !phaseEndsAt || !durationMs) return false;
  return Math.max(0, durationMs - remainingMs) < REVEAL_ANSWER_SPOTLIGHT_MS;
}

function getRevealAnswer(question, gameMode = "quiz") {
  const mode = question?.mode || gameMode;
  const answers = question?.answers || [];
  const revealedAnswers = answers.filter((answer) => answer.correct || answer.id === question?.correctAnswerId);
  return {
    label: mode === "majority" ? "Majority rules" : mode === "herd" ? "The Herd favourite" : "Correct answer",
    text: revealedAnswers.map((answer) => answer.text).filter(Boolean).join(" / ") || "Answer revealed",
    colorId: revealedAnswers[0]?.id || "neutral"
  };
}

function CorrectAnswerSpotlight({ question, gameMode, answerSelections = [], players = [] }) {
  const revealAnswer = getRevealAnswer(question, gameMode);
  const playerById = new Map(players.map((player) => [player.id, player]));
  const correctPlayers = answerSelections.
  filter((selection) => selection.answerId === revealAnswer.colorId).
  map((selection) => playerById.get(selection.playerId)).
  filter(Boolean);
  return (
    <section className={["correct-answer-spotlight", "answer-" + revealAnswer.colorId].join(" ")} role="status" aria-live="assertive">
      <span>{revealAnswer.label}</span>
      <strong>{revealAnswer.text}</strong>
      {correctPlayers.length ? <div className="correct-answer-players" aria-label={correctPlayers.map((player) => player.name).join(", ")}>{correctPlayers.map((player) => <span key={player.id} title={player.name}><AvatarBadge player={player} /></span>)}</div> : null}
    </section>);

}

function RoundRevealSummary({ question, lobby, playerKey = "", onPoke, readonly = false, phaseEndsAt = 0, durationMs = 0, onProgressComplete }) {
  const dispatch = useDispatch();
  const vote = async (good) => {
    if (readonly) return;
    const previousVote = lobby.ownVote;
    dispatch({ type: "OPTIMISTIC_VOTE", value: good ? 1 : -1 });
    const result = await api("/api/question/vote", { playerKey, good });
    if (!result.ok) {
      dispatch({ type: "OPTIMISTIC_VOTE", value: previousVote });
      dispatch({ type: "ERROR", value: result.error });
      forceSnapshotRevert();
    }
  };
  const itemName = (question?.mode || lobby.gameMode) === "herd" ? "prompt" : "question";
  const voteSelections = [...(question?.voteSelections || [])];
  if (!readonly && lobby.ownVote && lobby.ownPlayer && !voteSelections.some((selection) => selection.player?.id === lobby.ownPlayer.id)) {
    voteSelections.push({ value: lobby.ownVote, player: lobby.ownPlayer });
  }
  const goodVoters = voteSelections.filter((selection) => selection.value > 0).map((selection) => selection.player).filter(Boolean);
  const badVoters = voteSelections.filter((selection) => selection.value < 0).map((selection) => selection.player).filter(Boolean);
  return (
    <section className="reveal-round-summary">
      <div className={readonly ? "vote-panel reveal-vote-panel is-readonly" : "vote-panel reveal-vote-panel"}>
        {phaseEndsAt && durationMs ? <div className="reveal-vote-timer"><TimerBar phaseEndsAt={phaseEndsAt} durationMs={durationMs} waiting={lobby.phaseWaitingForProgress} paused={lobby.paused} pausedRemainingMs={lobby.pausedRemainingMs} onComplete={onProgressComplete} /></div> : null}
        <span>Was this {itemName} good?</span>
        <div>
          {readonly ? <><span className="vote-count is-good"><span>Good {question?.goodVotes || 0}</span><VoteChoicePlayers players={goodVoters} /></span><span className="vote-count is-bad"><span>Nah {question?.badVotes || 0}</span><VoteChoicePlayers players={badVoters} /></span></> : <><button className={lobby.ownVote === 1 ? "vote-button is-selected" : "vote-button"} type="button" onClick={() => vote(true)}><span>Good</span><VoteChoicePlayers players={goodVoters} /></button><button className={lobby.ownVote === -1 ? "vote-button is-selected" : "vote-button"} type="button" onClick={() => vote(false)}><span>Nah</span><VoteChoicePlayers players={badVoters} /></button></>}
        </div>
      </div>
      <GameLeaderboardPanel lobby={lobby} hint={!readonly && onPoke ? "Choose one friend to Gahook this question" : "Round standings"} onPoke={onPoke} usedPokeIds={questionUseIds(lobby)} ownPlayerId={lobby.ownPlayer?.id || ""} />
    </section>);

}

function VoteChoicePlayers({ players = [] }) {
  if (!players.length) return null;
  return <span className="vote-choice-players" aria-label={players.map((player) => player.name).join(", ")}>{players.map((player) => <span key={player.id} title={player.name}><AvatarBadge player={player} small /></span>)}</span>;
}

function RevealPanel({ question, lobby, playerKey, onPoke, readonly = false, phaseEndsAt, durationMs, onProgressComplete }) {
  const isMajority = (question?.mode || lobby.gameMode) === "majority";
  const isHerd = (question?.mode || lobby.gameMode) === "herd";
  return (
    <>
      {isMajority ? <MajorityRevealBreakdown AnswerGrid={AnswerGrid} question={question} lobby={lobby} /> : null}
      {isHerd ? <HerdRevealBreakdown AnswerGrid={AnswerGrid} question={question} lobby={lobby} /> : null}
      <RoundRevealSummary question={question} lobby={lobby} playerKey={playerKey} onPoke={onPoke} readonly={readonly} phaseEndsAt={phaseEndsAt} durationMs={durationMs} onProgressComplete={onProgressComplete} />
    </>);
}

function QuestionResultsPanel({ results, compact = false }) {
  const best = results?.best;
  const worst = results?.worst;
  if (!best && !worst) return null;
  return (
    <section className={compact ? "question-results is-compact" : "question-results"}>
      <article>
        <span>Best question</span>
        <strong>{best?.text || "No votes"}</strong>
        {best ? <QuestionAuthorLine result={best} /> : null}
      </article>
      <article>
        <span>Worst question</span>
        <strong>{worst?.text || "No votes"}</strong>
        {worst ? <QuestionAuthorLine result={worst} /> : null}
      </article>
    </section>);

}

function QuestionAuthorLine({ result }) {
  return (
    <em className="question-author-line">
      <AvatarBadge player={result.author || { name: result.authorName }} small />
      <span>{result.voteScore} score by {result.authorName}</span>
    </em>);

}

function PartyFinalScoreboard({ lobby, ownPlayer, playerKey, finished }) {
  const playedRef = useRef(false);
  const dispatch = useDispatch();
  const finals = getFinalSpotlights(lobby);

  useEffect(() => {
    if (!finished || playedRef.current) {
      return;
    }
    playedRef.current = true;
    playVictoryPartySound();
  }, [finished]);

  const resetGame = async () => {
    const result = await api("/api/host/reset");
    if (!result.ok) dispatch({ type: "ERROR", value: result.error });
  };
  const newGameSameRules = async () => {
    const result = await api("/api/host/new-game");
    if (!result.ok) dispatch({ type: "ERROR", value: result.error });
  };

  const booPlayer = (player) => {
    dispatch({ type: "OPTIMISTIC_POKE", value: optimisticPokePayload(player, ownPlayer.name, "boo", "BOO") });
    api("/api/player/final-poke", { playerKey, playerId: player.id, finalKind: "boo" }, { refresh: false }).then((result) => {
      if (!result.ok) {
        dispatch({ type: "ERROR", value: result.error });
        forceSnapshotRevert();
      }
    });
  };

  if (finished) {
    return (
      <section className="party-scoreboard is-final party-final-body">
        <FinalSpotlightRow finals={finals} apiPath="/api/player/final-poke" playerKey={playerKey} />
        <GameLeaderboardPanel lobby={lobby} title="Final leaderboard" limit={0} className="finale-leaderboard-panel" onPoke={booPlayer} ownPlayerId={ownPlayer.id} actionLabel="Boo" />
        <FinalShameRow finals={finals} apiPath="/api/player/final-poke" playerKey={playerKey} />
        {lobby.isHost ? <div className="party-final-actions"><button className="primary-button new-same-rules-button party-restart-button" type="button" onClick={newGameSameRules}>New game with same rules</button><button className="primary-button start-button party-restart-button" type="button" onClick={resetGame}>Reset Lobby</button></div> : null}
      </section>);

  }

  return null;
}

function AvatarPicker({ value, customImage, onChange, onDraw }) {
  const chooseRandomAvatar = () => {
    const choices = AVATAR_PRESETS.filter((avatar) => avatar.id !== value);
    const avatar = choices[Math.floor(Math.random() * choices.length)] || AVATAR_PRESETS[0];
    if (avatar) onChange(avatar.id);
  };

  return (
    <fieldset className="avatar-picker">
      <legend>Profile pick</legend>
      <div>
        {onDraw ? <button className={customImage ? "avatar-choice is-selected draw-avatar-choice" : "avatar-choice draw-avatar-choice"} type="button" onClick={onDraw}>
          {customImage ? <AvatarBadge customImage={customImage} avatarId={value} /> : <DrawAvatarIcon />}
          <span>{customImage ? "Edit custom" : "Draw"}</span>
        </button> : null}
        <button className="avatar-choice random-avatar-choice" type="button" onClick={chooseRandomAvatar}>
          <RandomAvatarIcon />
          <span>Random</span>
        </button>
        {AVATAR_PRESETS.map((avatar) =>
        <button className={value === avatar.id ? "avatar-choice is-selected" : "avatar-choice"} type="button" key={avatar.id} onClick={() => onChange(avatar.id)}>
            <AvatarBadge avatarId={avatar.id} />
            <span>{avatar.label}</span>
          </button>
        )}
      </div>
    </fieldset>);

}

function DrawAvatarIcon() {
  return <span className="draw-avatar-icon" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M13 47l5-16L43 6l15 15-25 25-16 5z" /><path d="M18 31l15 15M39 10l15 15" /><path d="M13 47l8-3-5-5z" /><path d="M9 57h46" /></svg></span>;
}

function RandomAvatarIcon() {
  return <span className="random-avatar-icon" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M13 20h8c11 0 14 24 25 24h5" /><path d="M45 36l8 8-8 8" /><path d="M13 45h7c5 0 8-5 11-11" /><path d="M34 27c3-5 6-8 12-8h5" /><path d="M45 11l8 8-8 8" /></svg></span>;
}

function UploadMiniIcon() {
  return (
    <svg className="upload-mini-icon" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="5" y="7" width="22" height="18" rx="4" />
      <path d="M9 22l5-6 4 4 3-4 3 6" />
      <path d="M16 18V4" />
      <path d="M10 10l6-6 6 6" />
    </svg>);

}

function ImageUploadDrawPicker({ value = "", onChange, label = "Optional image", previewAlt = "Selected image preview", disabled = false, compact = false }) {
  const dispatch = useDispatch();
  const fileInputRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  useModalBodyLock(drawing);

  const handleImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      dispatch({ type: "ERROR", value: "Image needs to be under 20 MB." });
      event.target.value = "";
      return;
    }
    try {
      onChange?.(await shrinkImageFile(file, { maxSide: 1500, quality: 0.84, maxDataUrlChars: 2400000 }));
    } catch (_error) {
      dispatch({ type: "ERROR", value: "Could not read that image." });
    } finally {
      event.target.value = "";
    }
  };

  return (
    <section className={["image-upload-draw-picker", value ? "has-image" : "", compact ? "is-compact" : ""].filter(Boolean).join(" ")} aria-label={label}>
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleImage} disabled={disabled} hidden />
      {value ? <div className="image-choice-preview"><img src={value} alt={previewAlt} /><button className="icon-button light" type="button" onClick={() => onChange?.("")} disabled={disabled} aria-label="Remove selected image">x</button></div> : null}
      <div className="image-source-actions">
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={disabled}><UploadMiniIcon /><span>{value ? "Choose upload" : "Upload image"}</span></button>
        <button type="button" onClick={() => setDrawing(true)} disabled={disabled}><EditMiniIcon /><span>{value ? "Draw or edit" : "Draw image"}</span></button>
      </div>
      {!value ? <small>{label}</small> : <small>Image selected. Upload another or draw to replace it.</small>}
      {drawing ? createPortal(<div className="creation-modal-backdrop" role="presentation" onPointerDown={(event) => {
        if (event.target === event.currentTarget) setDrawing(false);
      }}>
        <section className="creation-modal avatar-paint-modal answer-image-paint-modal" role="dialog" aria-modal="true" aria-label="Draw an image">
          <header className="avatar-paint-modal__header">
            <div><span>Make it visual</span><h2>Draw an image</h2><p>Use the same brushes, colours, eraser, and upload tool as your profile picture.</p></div>
            <button type="button" onClick={() => setDrawing(false)} aria-label="Close image drawing">x</button>
          </header>
          <SimplePaintEditor
            initialImage={value || undefined}
            onExport={(dataUrl) => {
              onChange?.(dataUrl);
              setDrawing(false);
            }}
            onError={(error) => dispatch({ type: "ERROR", value: error?.message || "That image could not be drawn." })}
            width={720}
            height={480}
            maxExportDimension={900}
            maxUploadBytes={20 * 1024 * 1024}
            mimeType="image/webp"
            imageQuality={0.82}
            backgroundColor="#ffffff"
            exportLabel="Use this image"
            label="Draw an image"
          />
        </section>
      </div>, document.body) : null}
    </section>);
}

function shrinkImageFile(file, options = {}) {
  const maxSide = options.maxSide || 900;
  const quality = options.quality || 0.86;
  const maxDataUrlChars = options.maxDataUrlChars || 1400000;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const original = String(reader.result || "");
      const image = new Image();
      image.onerror = () => reject(new Error("Image could not be decoded."));
      image.onload = () => {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!width || !height) return reject(new Error("Image dimensions are unavailable."));
        let scale = Math.min(1, maxSide / Math.max(width, height));
        let outputQuality = quality;
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) return reject(new Error("Image compression is unavailable."));
        let compressed = "";
        for (let attempt = 0; attempt < 8; attempt += 1) {
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          compressed = canvas.toDataURL("image/webp", outputQuality);
          if (!compressed.startsWith("data:image/webp")) compressed = canvas.toDataURL("image/jpeg", outputQuality);
          if (compressed.length <= maxDataUrlChars) break;
          if (outputQuality > 0.58) outputQuality = Math.max(0.58, outputQuality - 0.09);
          else scale *= 0.82;
        }
        if (!compressed || compressed.length > maxDataUrlChars) return reject(new Error("Image could not be compressed enough."));
        resolve(compressed);
      };
      image.src = original;
    };
    reader.readAsDataURL(file);
  });
}

function AvatarBadge({ avatarId, player, customImage, small = false }) {
  const image = customImage || player?.avatarImageDataUrl || "";
  const selectedAvatarId = player?.avatarId || avatarId;
  const avatar = AVATAR_PRESETS.find((item) => item.id === selectedAvatarId) || AVATAR_PRESETS[0];
  return <span className={(small ? "avatar-badge is-small avatar-" : "avatar-badge avatar-") + avatar.id}><img src={image || avatar.image} alt="" /></span>;
}

function makeAvatarImage(avatar) {
  return "data:image/svg+xml," + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <rect width="96" height="96" rx="22" fill="${avatar.background}"/>
      <circle cx="22" cy="22" r="18" fill="#ffffff" opacity=".24"/>
      <circle cx="78" cy="76" r="24" fill="#000000" opacity=".14"/>
      ${avatarArt(avatar.art, avatar.accent)}
    </svg>
  `);
}

function avatarArt(art, accent) {
  if (art === "zap") {
    return `<path d="M57 8 25 54h22l-8 34 35-48H52z" fill="${accent}" stroke="#111214" stroke-width="5" stroke-linejoin="round"/>`;
  }
  if (art === "pop") {
    return `<circle cx="48" cy="52" r="25" fill="#ffffff" stroke="#111214" stroke-width="5"/><circle cx="39" cy="47" r="4" fill="#111214"/><circle cx="57" cy="47" r="4" fill="#111214"/><path d="M36 60 Q48 70 60 60" fill="none" stroke="#111214" stroke-width="5" stroke-linecap="round"/><path d="M17 25 28 18M70 18l9 9M20 76l9-8M73 75l-8-9" stroke="${accent}" stroke-width="6" stroke-linecap="round"/>`;
  }
  if (art === "star") {
    return `<path d="m48 12 10 23 25 3-19 16 6 25-22-13-22 13 6-25-19-16 25-3z" fill="${accent}" stroke="#111214" stroke-width="5" stroke-linejoin="round"/><circle cx="39" cy="47" r="4" fill="#111214"/><circle cx="57" cy="47" r="4" fill="#111214"/>`;
  }
  if (art === "robot") {
    return `<rect x="24" y="28" width="48" height="42" rx="12" fill="${accent}" stroke="#111214" stroke-width="5"/><path d="M48 28V15" stroke="#111214" stroke-width="5" stroke-linecap="round"/><circle cx="48" cy="12" r="5" fill="#ffdf45" stroke="#111214" stroke-width="4"/><circle cx="39" cy="48" r="5" fill="#111214"/><circle cx="57" cy="48" r="5" fill="#111214"/><path d="M38 61h20" stroke="#111214" stroke-width="5" stroke-linecap="round"/>`;
  }
  if (art === "disco") {
    return `<circle cx="48" cy="48" r="30" fill="${accent}" stroke="#111214" stroke-width="5"/><path d="M20 48h56M48 18v60M30 27c12 9 25 9 36 0M30 69c12-9 25-9 36 0M27 30c9 12 9 25 0 36M69 30c-9 12-9 25 0 36" stroke="#5b6b79" stroke-width="3" opacity=".75"/><path d="M36 35h12v12H36zM52 51h12v12H52z" fill="#ffffff" opacity=".75"/>`;
  }
  if (art === "rocket") {
    return `<path d="M56 11c15 8 22 24 20 46L55 69 37 51z" fill="#ffffff" stroke="#111214" stroke-width="5" stroke-linejoin="round"/><circle cx="57" cy="39" r="8" fill="#79d7ff" stroke="#111214" stroke-width="4"/><path d="M37 51 23 57l16 7M55 69l-4 17-10-14" fill="${accent}" stroke="#111214" stroke-width="5" stroke-linejoin="round"/><path d="M31 67c-6 4-10 9-12 17 8-2 13-6 17-12" fill="#ffdf45" stroke="#111214" stroke-width="4" stroke-linejoin="round"/>`;
  }
  if (art === "crown") {
    return `<path d="M17 34 34 51 48 25l14 26 17-17-7 38H24z" fill="${accent}" stroke="#111214" stroke-width="5" stroke-linejoin="round"/><circle cx="18" cy="33" r="5" fill="#ffffff" stroke="#111214" stroke-width="4"/><circle cx="48" cy="24" r="5" fill="#ffffff" stroke="#111214" stroke-width="4"/><circle cx="78" cy="33" r="5" fill="#ffffff" stroke="#111214" stroke-width="4"/>`;
  }
  if (art === "pizza") {
    return `<path d="M24 19c20 1 36 8 49 23L35 78z" fill="${accent}" stroke="#111214" stroke-width="5" stroke-linejoin="round"/><path d="M24 19c20 1 36 8 49 23" fill="none" stroke="#ffe8a3" stroke-width="11" stroke-linecap="round"/><circle cx="43" cy="44" r="5" fill="#ef4444"/><circle cx="53" cy="58" r="5" fill="#ef4444"/><circle cx="35" cy="61" r="4" fill="#20b26b"/>`;
  }
  if (art === "gamepad") {
    return `<path d="M25 39h46c8 0 14 7 13 15l-3 15c-1 7-10 9-14 3l-7-9H36l-7 9c-4 6-13 4-14-3l-3-15c-1-8 5-15 13-15z" fill="#ffffff" stroke="#111214" stroke-width="5" stroke-linejoin="round"/><path d="M31 52h16M39 44v16" stroke="#111214" stroke-width="5" stroke-linecap="round"/><circle cx="61" cy="52" r="5" fill="${accent}" stroke="#111214" stroke-width="3"/><circle cx="73" cy="52" r="5" fill="#ff3d8b" stroke="#111214" stroke-width="3"/>`;
  }
  if (art === "poop") {
    return `<path d="M29 69c0-13 10-23 25-23 13 0 22 9 22 23 0 8-8 13-24 13S29 77 29 69z" fill="#7c2d12" stroke="#111214" stroke-width="5"/><path d="M28 55c3-12 13-19 29-18 12 1 18 9 15 19" fill="#92400e" stroke="#111214" stroke-width="5" stroke-linecap="round"/><path d="M37 38c3-10 12-16 24-15 8 1 13 6 12 14" fill="#b45309" stroke="#111214" stroke-width="5" stroke-linecap="round"/><path d="M47 22c2-7 8-11 16-10 5 1 8 4 9 9" fill="#d97706" stroke="#111214" stroke-width="5" stroke-linecap="round"/><circle cx="44" cy="61" r="5" fill="#ffffff"/><circle cx="62" cy="61" r="5" fill="#ffffff"/><circle cx="45" cy="62" r="2.5" fill="#111214"/><circle cx="61" cy="62" r="2.5" fill="#111214"/><path d="M47 73q7 5 14 0" stroke="#ffffff" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  }
  if (art === "caseoh") {
    return `<circle cx="48" cy="54" r="29" fill="#ffd7a8" stroke="#111214" stroke-width="5"/><path d="M23 39c4-17 16-25 32-24 12 1 20 7 24 18-17-4-36-2-56 6z" fill="#111214" stroke="#111214" stroke-width="5" stroke-linejoin="round"/><path d="M20 46c0-13 8-21 19-24M76 46c0-13-8-21-19-24" fill="none" stroke="#2dd4bf" stroke-width="7" stroke-linecap="round"/><rect x="15" y="43" width="13" height="23" rx="5" fill="#2dd4bf" stroke="#111214" stroke-width="4"/><rect x="68" y="43" width="13" height="23" rx="5" fill="#2dd4bf" stroke="#111214" stroke-width="4"/><path d="M70 64c11 8 4 19-12 18" fill="none" stroke="#111214" stroke-width="4" stroke-linecap="round"/><circle cx="38" cy="52" r="4" fill="#111214"/><circle cx="58" cy="52" r="4" fill="#111214"/><path d="M40 65q8 8 18 0" stroke="#111214" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M29 35c11-5 27-7 40-2" stroke="#fef3c7" stroke-width="4" stroke-linecap="round"/>`;
  }
  if (art === "banana") {
    return `<path d="M27 17c20 11 31 34 24 62 20-7 30-29 23-50-3 34-20 52-47 55 6-11 8-23 6-36-2-12-6-22-11-29z" fill="#facc15" stroke="#111214" stroke-width="5" stroke-linejoin="round"/><path d="M24 18c-5 0-8-3-9-8 8-1 12 1 12 7" fill="#854d0e" stroke="#111214" stroke-width="4" stroke-linejoin="round"/><circle cx="44" cy="49" r="4" fill="#111214"/><circle cx="59" cy="46" r="4" fill="#111214"/><path d="M47 62q8 6 17-2" stroke="#111214" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M38 34c10 4 20 4 31 0" stroke="#fff7ad" stroke-width="4" stroke-linecap="round"/>`;
  }
  if (art.startsWith("animal-")) {
    return animalAvatarArt(art.replace("animal-", ""), accent);
  }
  return `<path d="M48 14 78 39 48 84 18 39z" fill="${accent}" stroke="#111214" stroke-width="5" stroke-linejoin="round"/><path d="M18 39h60M33 39l15 45 15-45M33 39l15-25 15 25" fill="none" stroke="#85eaff" stroke-width="4" opacity=".9"/>`;
}

function animalAvatarArt(kind, accent) {
  const faceFill = kind === "panda" || kind === "bunny" ? "#ffffff" : kind === "koala" ? "#d0d5dd" : kind === "frog" ? "#86efac" : kind === "whale" ? "#bae6fd" : kind === "bee" ? "#ffe66d" : "#fed7aa";
  const earFill = kind === "panda" ? "#111214" : kind === "tiger" || kind === "fox" ? "#fb923c" : kind === "frog" ? "#4ade80" : kind === "owl" ? "#fcd34d" : faceFill;
  const extras = {
    panda: `<circle cx="34" cy="48" r="9" fill="#111214"/><circle cx="62" cy="48" r="9" fill="#111214"/><circle cx="37" cy="47" r="3" fill="#ffffff"/><circle cx="65" cy="47" r="3" fill="#ffffff"/>`,
    tiger: `<path d="M38 29l-7 14M48 27v15M58 29l7 14" stroke="#111214" stroke-width="4" stroke-linecap="round"/><path d="M24 50h16M56 50h16" stroke="#111214" stroke-width="3" stroke-linecap="round"/>`,
    koala: `<ellipse cx="48" cy="58" rx="15" ry="11" fill="#667085"/><circle cx="39" cy="47" r="4" fill="#111214"/><circle cx="57" cy="47" r="4" fill="#111214"/>`,
    fox: `<path d="M24 34 48 70 72 34 57 80H39z" fill="#ffffff" opacity=".9"/><path d="M22 50h18M56 50h18" stroke="#7c2d12" stroke-width="3" stroke-linecap="round"/>`,
    frog: `<circle cx="34" cy="32" r="12" fill="#86efac" stroke="#111214" stroke-width="4"/><circle cx="62" cy="32" r="12" fill="#86efac" stroke="#111214" stroke-width="4"/><circle cx="34" cy="31" r="4" fill="#111214"/><circle cx="62" cy="31" r="4" fill="#111214"/><path d="M37 62Q48 72 59 62" stroke="#111214" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    owl: `<circle cx="37" cy="48" r="13" fill="#ffffff" stroke="#111214" stroke-width="4"/><circle cx="59" cy="48" r="13" fill="#ffffff" stroke="#111214" stroke-width="4"/><circle cx="37" cy="48" r="4" fill="#111214"/><circle cx="59" cy="48" r="4" fill="#111214"/><path d="M48 53l7 8H41z" fill="#f97316" stroke="#111214" stroke-width="3"/>`,
    whale: `<path d="M22 58c11-23 45-25 58-2-14 18-43 20-58 2z" fill="#bae6fd" stroke="#111214" stroke-width="5"/><path d="M70 49l15-12v24z" fill="#bae6fd" stroke="#111214" stroke-width="5"/><circle cx="42" cy="53" r="4" fill="#111214"/><path d="M45 39c7-10 16-11 23-4" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>`,
    bee: `<ellipse cx="48" cy="52" rx="27" ry="22" fill="#ffe66d" stroke="#111214" stroke-width="5"/><path d="M35 33v39M48 31v42M61 34v36" stroke="#111214" stroke-width="5"/><path d="M35 27c-8-12-20-7-18 6 9 2 15 0 18-6ZM61 27c8-12 20-7 18 6-9 2-15 0-18-6Z" fill="#ffffff" opacity=".8" stroke="#111214" stroke-width="3"/>`,
    bunny: `<path d="M35 32C24 10 32 3 43 27M61 32C72 10 64 3 53 27" fill="#ffffff" stroke="#111214" stroke-width="5" stroke-linecap="round"/><path d="M41 62Q48 68 55 62" stroke="#111214" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    turtle: `<ellipse cx="48" cy="55" rx="30" ry="24" fill="#bbf7d0" stroke="#111214" stroke-width="5"/><path d="M29 48h38M36 36l24 36M60 36 36 72" stroke="#14532d" stroke-width="4"/><circle cx="48" cy="27" r="12" fill="#bbf7d0" stroke="#111214" stroke-width="5"/>`
  };

  return `
    <circle cx="28" cy="31" r="13" fill="${earFill}" stroke="#111214" stroke-width="5"/>
    <circle cx="68" cy="31" r="13" fill="${earFill}" stroke="#111214" stroke-width="5"/>
    <circle cx="48" cy="53" r="32" fill="${faceFill}" stroke="#111214" stroke-width="5"/>
    ${extras[kind] || ""}
    <circle cx="38" cy="50" r="4" fill="#111214"/>
    <circle cx="58" cy="50" r="4" fill="#111214"/>
    <ellipse cx="48" cy="59" rx="6" ry="4" fill="${accent}"/>
  `;
}
















































































































































































































































































































































































































































































































function PauseButton({ paused, onToggle }) {
  return <button className={paused ? "pause-game-button is-paused" : "pause-game-button"} type="button" onClick={onToggle} aria-label={paused ? "Resume game" : "Pause game"} title={paused ? "Resume game" : "Pause game"}><span aria-hidden="true" /></button>;
}

function TimerBar({ phaseEndsAt, durationMs, waiting = false, paused = false, pausedRemainingMs = 0, muted = false, onComplete }) {
  const liveRemainingMs = useCountdown(phaseEndsAt);
  const remainingMs = paused ? Math.max(0, pausedRemainingMs) : liveRemainingMs;
  const completedRef = useRef("");
  const progress = durationMs ? 1 - Math.max(0, Math.min(1, remainingMs / durationMs)) : 1;
  const seconds = Math.ceil(remainingMs / 1000);
  const completeKey = String(phaseEndsAt || "") + ":" + String(durationMs || "");

  useEffect(() => {
    completedRef.current = "";
  }, [completeKey]);

  useEffect(() => {
    if (paused || remainingMs > 0 || !onComplete || !phaseEndsAt || completedRef.current === completeKey) {
      return;
    }
    completedRef.current = completeKey;
    onComplete();
  }, [paused, remainingMs, onComplete, phaseEndsAt, completeKey]);

  const className = ["timer-bar", remainingMs <= 0 ? "is-complete" : "", paused ? "is-paused" : "", muted ? "is-reading-muted" : ""].filter(Boolean).join(" ");
  return <div className={className} data-waiting={waiting ? "true" : "false"} aria-label={paused ? "Game paused" : seconds + " seconds left"}><span style={{ width: String(progress * 100) + "%" }} /></div>;
}

function useCountdown(phaseEndsAt) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!phaseEndsAt) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, [phaseEndsAt]);
  const offset = typeof window !== "undefined" ? window.gahookzServerClockOffset || 0 : 0;
  return phaseEndsAt ? Math.max(0, phaseEndsAt - (now + offset)) : 0;
}

function labelForPhase(phase) {
  if (phase === "building") return "Make questions";
  if (phase === "reading") return "Reading";
  if (phase === "answering") return "Answering";
  if (phase === "reveal") return "Answer revealed";
  if (phase === "finished") return "Finished";
  return "Lobby";
}

createRoot(document.getElementById("root")).render(<Provider store={store}><App /></Provider>);
