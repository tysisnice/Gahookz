import fs from "node:fs";

const app = fs.readFileSync(new URL("./public/app.jsx", import.meta.url), "utf8");
const tutorial = fs.readFileSync(new URL("./public/client/tutorial.jsx", import.meta.url), "utf8");
const social = fs.readFileSync(new URL("./public/client/social.jsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("./public/styles.css", import.meta.url), "utf8");
const serviceWorker = fs.readFileSync(new URL("./public/service-worker.js", import.meta.url), "utf8");

function assert(value, message) {
  if (!value) throw new Error(message);
}

function stringValues(source) {
  return [...source.matchAll(/"((?:\\.|[^"\\])*)"/g)].map((match) => JSON.parse(`"${match[1]}"`));
}

const animalBlock = app.match(/const FUNNY_ANIMAL_NAMES = \[([\s\S]*?)\];/);
assert(animalBlock, "Funny animal defaults should be declared");
const animalNames = stringValues(animalBlock[1]);
assert(animalNames.length === 20 && new Set(animalNames).size === 20, "Join should offer exactly 20 distinct funny animal defaults");
assert(app.includes("saved.name || randomFunnyAnimalName()"), "A new player name should be prefilled from the funny animal defaults");

const welcomeStart = app.indexOf("function WelcomeScreen");
const welcomeEnd = app.indexOf("function EntryModeArt", welcomeStart);
const welcome = app.slice(welcomeStart, welcomeEnd);
assert(welcome.includes('useState("join")'), "Join should be the default welcome action");
assert(welcome.indexOf('entryIntent === "join"') < welcome.indexOf('entryIntent === "host"'), "Join should appear to the left of Host");
assert(welcome.includes("Make a room, drop a code, GAHOOK."), "Welcome should use the original Gahookz tagline");
assert(!welcome.includes("Join or Host a room"), "Welcome should move directly from the tagline to the Join and Host choices");
assert((welcome.match(/<input value=\{roomCode\}/g) || []).length === 1, "Join and Host should share one room-code field");
assert(welcome.includes("intent: entryIntent"), "Welcome should send explicit Join or Host intent");
assert(!welcome.includes("Install Gahookz"), "Welcome should not show a duplicate install action");
assert(welcome.includes("How to play &amp; tutorials") && welcome.includes('mode="overview"'), "Welcome should open the Gahookz overview tutorial");
assert(welcome.includes('allowedModes={["overview", "quiz", "majority", "herd", "host"]}'), "The welcome tutorial should expose all five guides");
assert(!welcome.includes('href="/information"'), "Welcome should no longer send players to the reports page");
assert(!welcome.includes("<AccountPanel"), "Account sign-in should not appear before a room is opened");
assert((app.match(/<AccountPanel \/>/g) || []).length === 3, "Account sign-in should render only in the name picker and the two lobby views");

assert(app.includes("function RoundPresetSelector"), "Host setup should expose the game-length preset selector");
assert(app.includes('{ id: "quick"') && app.includes('{ id: "standard"') && app.includes('{ id: "custom"'), "Quick, Standard, and Custom presets should be available");
assert(app.includes('value === "custom" ?') && app.includes("Questions per player"), "Question-count buttons should appear only for Custom");
assert(app.includes("plannedQuestions") && app.includes("formatDurationEstimate"), "Preset choices should show total rounds and a duration estimate");
assert(app.includes('value !== "custom" || Number(customLimit) === Number(lobby.maxQuestionsPerPlayer)'), "Custom totals should invalidate immediately when its question count changes");
assert(app.includes("Everyone makes one question; ten are selected fairly"), "Quick should explain fair selection for more than ten players");
assert(app.includes("questionUseSpent || inGame && player.id === ownPlayer.id"), "The in-game roster should disable every target after one use and never offer self-steals");
assert(app.includes('usedPokeIds={questionUseIds(lobby)}'), "Reading, answering, and reveal should share one client Gahook budget");

const socialHub = app.slice(app.indexOf("function RoomSocialHub"), app.indexOf("function GameFamilySelector"));
const joinScreen = app.slice(app.indexOf("function JoinScreen"), app.indexOf("function PlayerWaitingLobby"));
const playerWaitingLobby = app.slice(app.indexOf("function PlayerWaitingLobby"), app.indexOf("function PlayerLobby"));
const hostLobby = app.slice(app.indexOf("function HostLobby("), app.indexOf("function HostLobbyPokeEffects"));
const avatarPicker = app.slice(app.indexOf("function AvatarPicker"), app.indexOf("function DrawAvatarIcon"));
// The chat's own heading no longer promises drawings, because stage E moved
// painting onto the player wall. Announcing a surface that is not in the chat
// would mislead a screen-reader user, so the next assertion is where the
// drawing layer is checked for.
assert(social.includes("Room chat") && social.includes("Room messages"), "Waiting lobbies should retain room chat");
assert(social.includes("LobbyPaintLayer") && styles.includes(".lobby-paint__canvas") && !social.includes("social-chat__drawing"), "Drawing belongs on the lobby player wall, not on chat");
assert(socialHub.includes('send("/api/room/chat"') && socialHub.includes("/api/room/whiteboard/stroke"), "Lobby social actions should send chat and shared strokes");
assert(socialHub.includes("<AvatarBadge") && socialHub.includes("small />"), "Lobby chat should reuse a compact player-banner avatar");
assert(styles.includes(".social-chat__message.is-own .social-chat__bubble") && styles.includes("word-break: break-word"), "Lobby chat bubbles should fit their messages and safely wrap long text");
assert(!avatarPicker.includes('type="file"') && !avatarPicker.includes("UploadAvatarIcon"), "Join should not show a separate profile-picture upload control");
assert(joinScreen.includes("<SimplePaintEditor") && joinScreen.includes("upload an image here"), "Profile-picture uploads should remain available inside the custom drawing editor");
assert(joinScreen.includes("<AccountPanel"), "Account sign-in should be available while choosing a player name");
assert(hostLobby.includes("<AccountPanel"), "Account sign-in should be available in the host lobby");
assert(playerWaitingLobby.includes("<AccountPanel"), "Account sign-in should be available in the player lobby");
assert(app.includes("returnTo") && app.includes("/auth/google/start"), "Account sign-in should preserve the current room through the Google redirect");

const sentenceGroups = [...tutorial.matchAll(/sentences:\s*Object\.freeze\(\[([\s\S]*?)\]\)/g)].map((match) => stringValues(match[1]));
assert(sentenceGroups.length === 5 && sentenceGroups.every((sentences) => sentences.length === 3), "Gahookz, Quiz, Majority Rulz, Herd, and Host tutorials should each contain exactly three explanations");
assert(tutorial.includes("<h2 id={titleId}>How to play</h2>"), "The tutorial should use a clear centered How to play heading");
assert(tutorial.includes('TUTORIAL_MODE_ORDER = Object.freeze(["overview", "quiz", "majority", "herd", "host"])') && tutorial.includes("tutorial-mode-tab--${tutorialMode}"), "Gahookz, Quiz, Majority Rulz, Herd, and Host should be switchable tutorial tabs");
assert(tutorial.includes('TUTORIAL_MODE_ORDER.filter(mode => mode !== "overview")'), "The Gahookz overview should stay exclusive to explicitly configured launchers such as Welcome");
assert(tutorial.includes("Write the questions together, race to answer them") && tutorial.includes("tutorial-guide__summary"), "Each mode should have a concise explainer under the tutorial tabs");
assert(tutorial.includes('label: "Gahookz"') && tutorial.includes('"Join your friends"') && tutorial.includes('"Make the game together"') && tutorial.includes('"Gahook for glory"'), "The welcome-only overview should explain joining, making games, and Gahooking");
assert(tutorial.includes('"Sabotage your friends!"'), "Quiz tutorial should use the requested third-step heading");
assert(tutorial.includes('"Make your own questions"') && tutorial.includes("believable wrong ones"), "Quiz step one should clearly explain creating or generating questions");
assert(tutorial.includes("OverviewTutorialArtwork") && tutorial.includes("QuizTutorialArtwork") && tutorial.includes("MajorityTutorialArtwork") && tutorial.includes("HerdTutorialArtwork") && tutorial.includes("HostTutorialArtwork"), "Every guide should have one combined three-stage illustration");
assert(!tutorial.includes("QuizBuildArtwork") && !tutorial.includes("HostInviteArtwork"), "Quiz and Host should no longer split their flow across separate illustrations");
assert(tutorial.includes('className="tutorial-dialog__art"') && tutorial.includes('className="tutorial-dialog__steps"'), "Every tutorial should share one-artwork/three-explanation layout");
assert(tutorial.includes("<h3>{content.stepTitles[index]}</h3>") && tutorial.includes("<p>{sentence}</p>"), "Every explanation should have a heading and supporting paragraph");
assert(tutorial.includes("onClick={onClose}>Let's Go!</button>") && tutorial.includes('aria-label="Close how to play"'), "Quiz X and Let's Go controls should both close the tutorial");
assert(styles.includes(".tutorial-dialog__steps") && styles.includes("grid-template-columns: repeat(3, minmax(0, 1fr))"), "Desktop tutorials should place the three explanations beneath their combined artwork");
assert(styles.includes(".tutorial-dialog__step-copy h3") && styles.includes(".tutorial-dialog__step-copy p"), "Tutorial explanation headings and paragraphs should have dedicated styling");
assert(tutorial.includes('"Ask for an opinion"') && tutorial.includes('"Predict the room"') && tutorial.includes('"Join the majority"'), "Majority Rulz tutorial should clearly name all three stages");
assert(tutorial.includes("<svg") && tutorial.includes('role="img"'), "Each tutorial should include accessible Gahook-style artwork");
assert(tutorial.includes('role="dialog"') && tutorial.includes('aria-modal="true"'), "How to play should be an accessible modal dialog");
assert(app.includes("gahookz-how-to-play-seen-v2-") && app.includes('autoOpenMode="host"') && app.includes("showButton={false}"), "Host and selected game tutorials should have separate first-time triggers, including late joins");
assert(app.includes('className="question-creation-heading"') && !app.slice(app.indexOf("function PlayerLobby"), app.indexOf("function SubmittedQuestionList")).includes('className={ownPlayer.ready ? "player-summary'), "Question creation should use a simple heading instead of the old white player banner");
assert(app.includes("actions={<ModeTutorialLauncher mode={lobby.gameMode} autoOpen autoOpenMode=\"host\" includeHost />}"), "Host How to play should sit with the selected game mode and auto-open the Host guide once");
assert(app.includes("keepActionsWhenHidden") && app.includes("actions && keepActionsWhenHidden"), "Player lobbies should be able to hide standalone help with a dismissed explainer");
assert(app.includes("explainerScope"), "Lobby and question-phase explainers should have separate dismissal scopes");
assert(styles.includes(".room-status-banner > span") && !styles.includes(".room-status-banner span {"), "Room banner typography must not leak into the tutorial modal");
assert(/"\/client\/tutorial\.js\?v=[^"]+"/.test(serviceWorker), "The versioned tutorial module should be cached for offline play");

console.log(JSON.stringify({
  ok: true,
  funnyAnimalDefaults: animalNames.length,
  tutorialSentences: sentenceGroups.map((sentences) => sentences.length),
  checked: [
    "Join-left default and shared room field",
    "welcome tagline and explicit room intent",
    "20 funny animal name defaults",
    "Quick, Standard, and Custom round controls",
    "live total and duration summaries",
    "chat-only player-banner lobby social UI",
    "single custom profile-picture editor entry",
    "five single-artwork tutorials with three headed explanations each",
    "first-time and persistent tutorial access",
    "tutorial style isolation and offline cache"
  ]
}, null, 2));
