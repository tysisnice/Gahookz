import fs from "node:fs";

const app = fs.readFileSync(new URL("./public/app.jsx", import.meta.url), "utf8");
const preferences = fs.readFileSync(new URL("./public/client/preferences.jsx", import.meta.url), "utf8");
const audio = fs.readFileSync(new URL("./public/client/audio.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("./public/styles.css", import.meta.url), "utf8");

function assert(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

function getFunctionSection(name) {
  const start = app.indexOf("function " + name);
  assert(start !== -1, "Missing " + name);
  const next = app.indexOf("\nfunction ", start + 1);
  return app.slice(start, next === -1 ? app.length : next);
}

function assertIncludes(section, needle, message) {
  const compact = (value) => value.replace(/\s+/g, " ");
  assert(section.includes(needle) || compact(section).includes(compact(needle)), message + " (missing " + needle + ")");
}

function assertNotIncludes(section, needle, message) {
  const compact = (value) => value.replace(/\s+/g, " ");
  assert(!section.includes(needle) && !compact(section).includes(compact(needle)), message + " (unexpected " + needle + ")");
}

function assertOrdered(section, needles, message) {
  let previousIndex = -1;
  for (const needle of needles) {
    const index = section.indexOf(needle);
    assert(index > previousIndex, message + " (missing or misplaced " + needle + ")");
    previousIndex = index;
  }
}

function runPartyViewSmoke() {
  assert(!app.includes("function PhoneHeader"), "Legacy phone-only header component should stay removed");
  assert(!app.includes("Phone"), "Legacy phone-named components should stay removed from room screens");
  assert(!app.includes("phone-"), "Room screens should not render old phone-prefixed classes");

  const appRoot = getFunctionSection("App");
  assertIncludes(appRoot, "lobby.isHost ? <HostMode", "Room routes should choose HostMode for hosts");
  assertIncludes(appRoot, ": <PlayerView playerKey={playerKey} />", "Room routes should choose PlayerView for non-hosts");

  const hostMode = getFunctionSection("HostMode");
  assertIncludes(hostMode, "showPlayerWorkspace", "Host layout should derive its workspace from room state");
  assertIncludes(hostMode, "Boolean(lobby.ownPlayer) && lobby.phase !== \"lobby\"", "Reset lobby should always restore the host options view");
  assertIncludes(hostMode, "<PlayerView playerKey={playerKey} hostMenu={hostMenu}", "Host-as-player should use the player workspace with host menu retained");
  assertIncludes(hostMode, 'api("/api/host/exit-player"', "Exit as Player should remove the host player on the server");
  assertNotIncludes(hostMode, "localStorage.setItem(hostPlayKey", "Host workspace should no longer rely on a sticky local view toggle");

  const hostView = getFunctionSection("HostView");
  assertIncludes(hostView, "<HostLobby", "Host setup should use the party lobby component");
  assertIncludes(hostView, "<HostBuildingLobby", "Host question-making view should have a locked party lobby");
  assertIncludes(hostView, "<HostGame", "Host game should use the party game component");
  assertIncludes(hostView, "<FinishedScreen", "Host final should use the party final component");

  const hostLobby = getFunctionSection("HostLobby");
  assertIncludes(hostLobby, 'className="host-screen host-lobby setup-lobby"', "Host lobby should use the party-view shell");
  assertIncludes(hostLobby, "<HostTopBar", "Host lobby should use the shared party top bar");
  assertIncludes(hostLobby, 'code={lobby.code}', "Host party-view top bar should show the room code");
  assertIncludes(hostLobby, 'className="host-lobby-layout has-room-status"', "Host lobby should use the shared two-panel party layout with its explainer first");
  assertIncludes(hostLobby, "<GameModeSelector", "Host lobby should expose mode selection");
  assertIncludes(hostLobby, "Join game as player", "Host setup should offer a participant card for the host");
  assertIncludes(hostLobby, 'className="host-join-player-card"', "Host play entry should look like an extra player banner");
  assertIncludes(hostLobby, "onRemoveSelf", "A participating host should be able to remove themselves from the player list");
  assertNotIncludes(hostLobby, "host-play-choice", "Host setup should no longer use a play-too checkbox");
  assertIncludes(hostLobby, "Begin Game", "Host setup should use a clear Begin Game action");
  assertNotIncludes(hostLobby, "<QuestionApprovalPanel", "Setup lobby should not show question approvals before building starts");

  const hostBuildingLobby = getFunctionSection("HostBuildingLobby");
  assertIncludes(hostBuildingLobby, 'className="host-screen host-lobby building-lobby"', "Host building phase should retain the party shell");
  assertIncludes(hostBuildingLobby, "Locked options", "Host building phase should show a read-only option summary");
  assertIncludes(hostBuildingLobby, "<QuestionApprovalPanel", "Host building phase should expose question approvals");
  assertIncludes(hostBuildingLobby, "<ForceStartControl", "Host party view should offer force start while players are unfinished");
  assertIncludes(hostBuildingLobby, "onForceStart={onForceStart}", "Host party view should connect force start to the server action");
  assertIncludes(hostBuildingLobby, '"Enter as player"', "Host should still be able to enter as a player during question making");
  assertNotIncludes(hostBuildingLobby, "<GameModeSelector", "Game mode should not be editable during question making");

  const joinScreen = getFunctionSection("JoinScreen");
  assertIncludes(joinScreen, 'className="host-screen host-lobby player-party-join"', "Join screen should use the party-view shell");
  assertIncludes(joinScreen, "<HostTopBar", "Join screen should use the shared party top bar");
  assertIncludes(joinScreen, 'className="join-form party-join-form"', "Join screen should keep private join controls inside party styling");
  assertIncludes(joinScreen, '"/api/player/profile"', "The join screen should update an existing profile without rejoining");
  assertIncludes(joinScreen, "Save changes", "Profile editing should have a clear save action");
  assertIncludes(joinScreen, "OPTIMISTIC_PLAYER_PROFILE", "Profile changes should update immediately on the local device");

  const profilePlayerQuickMenu = getFunctionSection("PlayerQuickMenu");
  assertIncludes(profilePlayerQuickMenu, "Change name &amp; profile", "Every player menu should open profile editing");
  const profileHostQuickMenu = getFunctionSection("HostQuickMenu");
  assertIncludes(profileHostQuickMenu, "Change name &amp; profile", "A host playing as a player should also be able to edit their profile");

  const hostModeRejoin = getFunctionSection("HostMode");
  assertIncludes(hostModeRejoin, "canRejoin", "A returning host player should restore their saved identity immediately");
  const profilePlayerCard = getFunctionSection("PlayerCard");
  assertIncludes(profilePlayerCard, "Leave as player", "The host player leave action should live inside their player-card menu");
  assertNotIncludes(profilePlayerCard, 'className="remove-self-player"', "The host player card should not show a standalone remove button");

  const playerWaitingLobby = getFunctionSection("PlayerWaitingLobby");
  assertIncludes(playerWaitingLobby, 'className="host-screen host-lobby player-waiting-lobby"', "Players should have a social setup lobby before questions");
  assertIncludes(playerWaitingLobby, "The host is choosing the game", "Player setup lobby should explain what is happening");
  assertIncludes(playerWaitingLobby, "<ReadonlyPlayerCard", "Player setup lobby should show the shared player wall");
  assertNotIncludes(playerWaitingLobby, "<QuestionBuilder", "Player setup lobby should not expose question creation");

  const playerLobby = getFunctionSection("PlayerLobby");
  assertIncludes(playerLobby, 'className="host-screen host-lobby player-party-lobby"', "Player lobby should use the party-view shell");
  assertIncludes(playerLobby, "<HostTopBar", "Player lobby should use the shared party top bar");
  assertIncludes(playerLobby, 'code={lobby.code}', "Player party-view top bar should show the room code");
  assertIncludes(playerLobby, "<QuestionBuilder", "Player lobby should include private question creation controls");
  assertIncludes(playerLobby, "<ReadonlyPlayerCard", "Player lobby should show the shared player wall");
  assertIncludes(playerLobby, "<ForceStartControl", "Host-as-player view should retain force-start controls");
  assertIncludes(playerLobby, '<QuestionApprovalPanel questions={lobby.pendingQuestions}', "Host question approvals should sit above the player banners in the player workspace");
  assertIncludes(playerLobby, 'canForceStart={lobby.activePlayerCount > 0}', "Host start should remain available while their own questions are unfinished");
  assertIncludes(playerLobby, 'type: "OPTIMISTIC_READY"', "Ready button should update immediately before the server reply");

  const forceStartControl = getFunctionSection("ForceStartControl");
  assertIncludes(forceStartControl, "Players are not ready, start anyway with generated questions?", "Force-start confirmation should clearly explain the override");
  assertIncludes(forceStartControl, "Force start game", "Force-start confirmation should have an explicit action button");
  assertIncludes(forceStartControl, "Wait for players", "Force-start confirmation should offer a safe cancel action");
  assertIncludes(forceStartControl, "is-force-start", "Unready start button should use its subdued visual state");

  const playerGame = getFunctionSection("PlayerGame");
  assertIncludes(playerGame, 'className={"host-screen host-game player-party-game phase-" + lobby.phase + " mode-" + lobby.gameMode}', "Player game should use the party-game shell");
  assertIncludes(playerGame, "<HostTopBar", "Player game should use the shared party top bar");
  assertIncludes(playerGame, "<AnswerGrid", "Player game should keep private answer controls in the party layout");
  assertIncludes(playerGame, 'lobby.phase === "reading" || lobby.phase === "answering"', "Player read and answer phases should share one active-round leaderboard path");
  assertIncludes(playerGame, "{roundActive ? <GameLeaderboardPanel", "Player active rounds should use the shared final-style leaderboard");
  assertIncludes(playerGame, "usedPokeIds={questionUseIds(lobby)}", "Player phase leaderboard should preserve the one-Gahook-per-question lock");
  assertIncludes(playerGame, "<RevealPanel", "Player game should keep voting/reveal controls in the party layout");
  assertIncludes(playerGame, "<PartyFinalScoreboard", "Player final should use the shared final scoreboard component");

  const readonlyParty = getFunctionSection("ReadonlyPartyView");
  assertIncludes(readonlyParty, "<HostGame", "Readonly party view should reuse the TV-style game view during rounds");
  assertIncludes(readonlyParty, 'lobby.phase !== "lobby" && lobby.phase !== "building"', "Readonly party view should keep building out of live rounds");
  assertIncludes(readonlyParty, "<ReadonlyFinishedScreen", "Readonly party view should reuse final party results");
  assertIncludes(readonlyParty, 'className="host-screen host-lobby readonly-party-view"', "Readonly lobby should use the party-view shell");
  assertIncludes(readonlyParty, "Player controls", "Readonly party view should provide a path back to player controls");

  const hostGame = getFunctionSection("HostGame");
  assertIncludes(hostGame, 'className={"host-screen host-game phase-" + lobby.phase + " mode-" + lobby.gameMode}', "Host game should use the party-game shell");
  assertIncludes(hostGame, "hideText={lobby.phase === \"reading\"}", "Reading phase should show answer placeholders while hiding answer text");
  assertIncludes(hostGame, 'lobby.phase === "reading" || lobby.phase === "answering"', "Host read and answer phases should share one active-round leaderboard path");
  assertIncludes(hostGame, "{roundActive ? <GameLeaderboardPanel", "Host active rounds should show the shared leaderboard");
  assertIncludes(hostGame, "<RevealPanel", "Host reveal should retain the shared voting and mode-results path");
  assertIncludes(hostGame, "readonly phaseEndsAt={lobby.phaseEndsAt}", "Host reveal should keep readonly voting with the shared timer");

  const gameLeaderboardPanel = getFunctionSection("GameLeaderboardPanel");
  assertIncludes(gameLeaderboardPanel, '"reveal-leaderboard-panel", "game-leaderboard-panel"', "Shared standings should keep the reveal leaderboard appearance in every phase");
  assertIncludes(gameLeaderboardPanel, "<LeaderboardList", "Shared standings panel should own one reusable leaderboard list");
  assertIncludes(gameLeaderboardPanel, "actionLabel={actionLabel}", "Shared standings should forward context-specific action labels");

  const finished = getFunctionSection("FinishedScreen");
  assertIncludes(finished, 'className="host-screen finished-screen"', "Host final should use the party final shell");
  assertOrdered(finished, ["<FinalSpotlightRow", "final-party-grid", "<GameLeaderboardPanel", "<FinalShameRow"], "Host final should lead with winners, then standings, then compact party awards");
  assertIncludes(finished, 'actionLabel="Boo"', "Host final leaderboard should clearly label its Boo actions");
  assertIncludes(finished, 'finals.winners.length > 1 ? "Joint winners " : "Winner "', "Host final speech should announce ties accurately");

  const readonlyFinished = getFunctionSection("ReadonlyFinishedScreen");
  assertIncludes(readonlyFinished, 'className="host-screen finished-screen readonly-party-view"', "Readonly final should use the party final shell");
  assertOrdered(readonlyFinished, ["<FinalSpotlightRow", "final-party-grid", "<GameLeaderboardPanel", "<FinalShameRow"], "Readonly final should use the same winner, standings, and awards hierarchy");
  assertIncludes(readonlyFinished, "Back to player view", "Readonly final should return to player controls");

  const partyFinalScoreboard = getFunctionSection("PartyFinalScoreboard");
  assertIncludes(partyFinalScoreboard, "party-final-body", "Player final scoreboard should use the party final body");
  assertOrdered(partyFinalScoreboard, ["<FinalSpotlightRow", "<GameLeaderboardPanel", "<FinalShameRow"], "Player final should lead with winners, then standings, then compact party awards");
  assertIncludes(partyFinalScoreboard, 'actionLabel="Boo"', "Player final leaderboard should clearly label its Boo actions");

  const winnerStage = getFunctionSection("FinalSpotlightRow");
  assertIncludes(winnerStage, 'className="winner-band finale-winner-stage"', "Finale winner presentation should restore the celebratory winner band");
  assertIncludes(winnerStage, "finals.winners.map", "Finale winner stage should show every tied winner");
  assertIncludes(winnerStage, "<FinalGahookCard compact", "Winner cards should remain compact inside the celebration stage");

  const partyAwards = getFunctionSection("FinalShameRow");
  assertIncludes(partyAwards, 'className="finale-party-awards final-shame-row"', "Best, last-place, and question moments should sit in a secondary awards section");
  assertIncludes(partyAwards, "finale-awards-grid", "Final party awards should use the compact awards grid");
  assertIncludes(partyAwards, 'buttonLabel="Send a boo"', "Final negative awards should use clear, playful Boo labels");

  const hostQuickMenu = getFunctionSection("HostQuickMenu");
  assertIncludes(hostQuickMenu, "Share Link", "Host menu should keep Share Link");
  assertIncludes(hostQuickMenu, "Exit as Player", "Host menu should let host-player exit player mode");
  assertIncludes(hostQuickMenu, "Reset Lobby", "Host menu should keep Reset Lobby");
  assertIncludes(hostQuickMenu, "Exit Lobby", "Host menu should keep Exit Lobby");
  assertNotIncludes(hostQuickMenu, "Enter as player", "Host menu should not include enter-player controls");
  assertNotIncludes(hostQuickMenu, "Exit to Party view", "Host menu should use the simplified Exit as Player wording");
  assertNotIncludes(hostQuickMenu, "Start game", "Host menu should not include Start game");
  assertNotIncludes(hostQuickMenu, "Skip question", "Host menu should not include Skip question");
  assertNotIncludes(hostQuickMenu, "Player actions", "Host menu should not include player action controls");
  assertNotIncludes(hostQuickMenu, "Approve questions", "Host menu should not include lobby option controls");
  assertNotIncludes(hostQuickMenu, "Questions each", "Host menu should not include question count controls");
  assertNotIncludes(hostQuickMenu, "GameModeSelector", "Host menu should not include mode controls");
  assertNotIncludes(hostQuickMenu, "host-menu-code", "Host menu should not show the lobby code");

  const playerQuickMenu = getFunctionSection("PlayerQuickMenu");
  const effectsPreferenceButtons = getFunctionSection("EffectsPreferenceButtons");
  assertIncludes(playerQuickMenu, "Share Link", "Player menu should keep Share Link");
  assertIncludes(playerQuickMenu, "EffectsPreferenceButtons", "Player menu should expose effect preferences");
  assertIncludes(effectsPreferenceButtons, "Reduce Gahook effects", "Effect preferences should expose one combined reduction control");
  assertIncludes(effectsPreferenceButtons, "Use full Gahook effects", "The combined control should restore full effects");
  assertIncludes(effectsPreferenceButtons, "setEffectsReducedPreference", "The combined control should reduce motion and flashes");
  assertIncludes(effectsPreferenceButtons, "setEffectsMuted", "The combined control should also mute Gahook audio");
  assertIncludes(playerQuickMenu, "Exit Lobby", "Player menu should keep Exit Lobby");
  assertIncludes(playerQuickMenu, "Change name &amp; profile", "Player menu should expose the profile editor");
  assertNotIncludes(playerQuickMenu, "Save name", "Player menu should not include save name controls");
  assertNotIncludes(playerQuickMenu, "Big screen view", "Player menu should not include big-screen controls");
  assertNotIncludes(playerQuickMenu, "host-menu-code", "Player menu should not show the lobby code");
  assert(preferences.includes('localStorage.setItem(MUTE_KEY, next ? "1" : "0")'), "Mute preference should persist locally");
  assert(preferences.includes('localStorage.setItem(REDUCED_EFFECTS_KEY, next ? "1" : "0")'), "Reduced effects should persist independently from mute");
  assert(preferences.includes("effectsMuted() || reducedEffectsPreferred() || systemPrefersReducedEffects()"), "Effective reduction should honor mute, the manual setting, and system motion preferences");
  assert(preferences.includes("setEffectsReducedPreference") && preferences.includes("useReducedEffectsPreference"), "Reduced effects should expose a reusable preference API");
  assert(preferences.includes('classList.toggle("gahookz-reduced-effects", next)'), "Reduced-motion preferences should activate a stable root class");
  assert(preferences.includes('dataset.effectsMuted = next ? "true" : "false"') && preferences.includes('dataset.reducedEffects = next ? "true" : "false"'), "Effect preferences should expose root state for visual effects");
  assert(preferences.includes('mediaQuery.addEventListener("change", sync)') && preferences.includes("mediaQuery.addListener?.(sync)"), "Reduced-motion changes should apply without reloading");
  assert(audio.includes("if (effectsMuted()) return null") && audio.includes("if (effectsMuted()) return;"), "Mute should suppress generated audio and speech");
  assert(styles.includes(".gahookz-muted .poke-overlay") && styles.includes("animation: none !important"), "Mute should stop Gahook background flashing");

  const playerCard = getFunctionSection("PlayerCard");
  assertIncludes(playerCard, "Randomize name & pfp", "Host player actions should randomize both the safe name and profile picture");
  assertIncludes(playerCard, "const runPlayerAction = async", "Host player actions should wait for server completion");
  assertIncludes(playerCard, "if (activeAction) return", "Host player actions should ignore overlapping taps");
  assertIncludes(playerCard, "if (result?.ok) closeMenu()", "Host player action menu should close only after success");
  assertIncludes(playerCard, "finally", "Host player actions should always clear their busy state after failures");
  assertIncludes(playerCard, "setActiveAction(\"\")", "Host player actions should become usable again after completion");
  assertIncludes(playerCard, "actionBusy || !player.connected || player.isHost", "Make host should require a connected non-host player");
  assertIncludes(playerCard, "disabled={actionBusy}", "Identity randomization should remain available for offline players");
  assertIncludes(playerCard, "disabled={actionBusy || player.isHost}", "Kick should remain available for offline non-host players");
  assertIncludes(playerCard, 'aria-busy={activeAction ? "true" : "false"}', "Host player menu should expose action progress");

  assertIncludes(hostView, 'type: "APPLY_PLAYER_IDENTITY"', "Successful randomization should update the player card immediately");
  assertIncludes(hostView, 'type: "HOST_PLAYER_KICKED"', "Successful kicks should remove the player card immediately");
  assertIncludes(hostView, 'type: "HOST_TRANSFERRED"', "Successful host transfer should update authority immediately");
  assertIncludes(hostView, 'type: "OPTIMISTIC_HOST_SETTINGS"', "Host mode and approval controls should update immediately");

  const roundRevealSummary = getFunctionSection("RoundRevealSummary");
  assertIncludes(roundRevealSummary, 'type: "OPTIMISTIC_VOTE"', "Question voting should select immediately before the server reply");
  assertIncludes(roundRevealSummary, "previousVote", "Failed optimistic votes should restore the previous choice");
  assertIncludes(roundRevealSummary, "<GameLeaderboardPanel", "Round reveal should use the same shared leaderboard as read, answer, and finale phases");

  const hostTopBar = getFunctionSection("HostTopBar");
  assertIncludes(hostTopBar, 'className="topbar-room-code"', "Every in-room top bar should show the room code beside the menu");
  assertIncludes(hostTopBar, 'phase === "Join" ? "Join" : phase === "Party View" ? "Lobby" : "Live"', "Top bar should expose Join, Lobby, and Live states");
  assertNotIncludes(hostTopBar, "connection-pill", "Top bar should not render a redundant connection pill");
  assert(hostTopBar.indexOf('className={"phase-pill') < hostTopBar.indexOf('className="topbar-room-code"'), "State pill should sit immediately before the room code");
  assert(hostTopBar.indexOf('className="topbar-room-code"') < hostTopBar.indexOf("{hostMenu}"), "Room code should sit immediately before the player or host menu");

  const roomStatus = getFunctionSection("RoomStatusBanner");
  assertIncludes(roomStatus, "localStorage.setItem(storageKey", "Dismissed explainers should stay hidden for that player for the rest of the room");
  assertIncludes(roomStatus, 'aria-label="Hide room explainer"', "Room explainer should include an accessible close button");
  assertIncludes(hostLobby, 'className="host-lobby-layout has-room-status"', "Host explainer should live directly under the lobby code inside the responsive lobby layout");

  assertNotIncludes(hostView + hostLobby + hostBuildingLobby + joinScreen + playerWaitingLobby + playerLobby + playerGame + readonlyParty + finished + readonlyFinished, "<PhoneHeader", "Room screens should not call a legacy phone header");

  return {
    checked: [
      "no legacy phone component/class render path",
      "host and player room routing",
      "separate setup and question-making lobbies",
      "server-backed option lock reflected in host UI",
      "host-as-player keeps host menu",
      "ordered Join/Lobby/Live state and room-code pills",
      "dismissible per-room explainer banners",
      "host menu is simplified",
      "player menu is simplified",
      "reliable host player actions and combined randomization",
      "menus do not show room code",
      "join/lobby/game/final use party shells",
      "private join/question/answer/vote controls live inside party layout",
      "readonly party view reuses TV-style game/final screens",
      "reading answer text redaction in party view",
      "shared read, answer, reveal, and finale leaderboard",
      "winner-first finale hierarchy with compact party awards",
      "tie-aware winner presentation and labelled Boo actions"
    ]
  };
}

console.log(JSON.stringify({ ok: true, partyView: runPartyViewSmoke() }, null, 2));
