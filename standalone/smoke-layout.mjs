import fs from "node:fs";

const css = fs.readFileSync(new URL("./public/styles.css", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("./public/app.jsx", import.meta.url), "utf8");

function assert(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

function stripComments(value) {
  return value.replace(/\/\*[\s\S]*?\*\//g, "");
}

function findBlock(selector, source = css) {
  return findBlocks(selector, source)[0] || "";
}

function findBlocks(selector, source = css) {
  const clean = stripComments(source);
  let searchAt = 0;
  const blocks = [];
  while (searchAt < clean.length) {
    const selectorAt = clean.indexOf(selector, searchAt);
    if (selectorAt === -1) {
      return blocks;
    }
    const braceAt = clean.indexOf("{", selectorAt + selector.length);
    const prefix = clean.slice(selectorAt, braceAt).trim();
    if (braceAt !== -1 && prefix.split(",").map((part) => part.trim()).includes(selector)) {
      let depth = 0;
      for (let index = braceAt; index < clean.length; index += 1) {
        if (clean[index] === "{") depth += 1;
        if (clean[index] === "}") {
          depth -= 1;
          if (depth === 0) {
            blocks.push(clean.slice(braceAt + 1, index).trim());
            searchAt = index + 1;
            break;
          }
        }
      }
    } else {
      searchAt = selectorAt + selector.length;
    }
  }
  return blocks;
}

function mergedBlock(selector, source = css) {
  return findBlocks(selector, source).join("\n");
}

function findMediaBlock(query) {
  const marker = "@media " + query;
  const clean = stripComments(css);
  const start = clean.indexOf(marker);
  if (start === -1) {
    return "";
  }
  const braceAt = clean.indexOf("{", start + marker.length);
  let depth = 0;
  for (let index = braceAt; index < clean.length; index += 1) {
    if (clean[index] === "{") depth += 1;
    if (clean[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return clean.slice(braceAt + 1, index).trim();
      }
    }
  }
  return "";
}

function hasDecl(block, property, expectedPart = "") {
  const pattern = new RegExp(property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:\\s*([^;]+);", "i");
  const match = block.match(pattern);
  return expectedPart ? Boolean(match && match[1].includes(expectedPart)) : Boolean(match);
}

function getFunctionSection(name) {
  const start = app.indexOf("function " + name);
  assert(start !== -1, "Missing " + name);
  const next = app.indexOf("\nfunction ", start + 1);
  return app.slice(start, next === -1 ? app.length : next);
}

function runLayoutSmoke() {
  assert(!app.includes("phone-") && !app.includes("Phone"), "App should not use legacy phone-named room components or classes");
  assert(!css.includes("phone-"), "Styles should not keep legacy phone-prefixed room selectors");
  assert(!css.includes("roster-gahook-bank"), "Old visible Gahook bank panel styles should stay removed");

  const button = mergedBlock("button");
  assert(hasDecl(button, "touch-action", "manipulation"), "Buttons should bypass delayed touch gesture handling");
  const pressedButton = mergedBlock("button:not(:disabled):active");
  assert(hasDecl(pressedButton, "transform", "translateY(2px)"), "Every enabled button should show immediate pressed feedback");

  const joinForm = mergedBlock(".party-join-form");
  const joinAvatarGrid = mergedBlock(".party-join-form .avatar-picker > div");
  assert(hasDecl(joinForm, "grid-template-rows", "minmax(0, 1fr)") && hasDecl(joinForm, "overflow", "hidden"), "Join form should reserve a fixed action footer");
  assert(hasDecl(joinAvatarGrid, "overflow-y", "auto"), "Avatar choices should scroll instead of pushing Join off screen");
  assert(app.includes('className="join-form-actions"'), "Password and Join controls should share the always-visible join footer");

  const mobile = findMediaBlock("(max-width: 640px)");
  const medium = findMediaBlock("(max-width: 1250px)");
  const tablet = findMediaBlock("(max-width: 920px)");
  const compactSplit = findMediaBlock("(min-width: 761px) and (max-width: 920px)");
  const narrowPhone = findMediaBlock("(max-width: 520px)");
  assert(mobile, "Missing mobile breakpoint");
  assert(medium, "Missing medium-screen breakpoint");
  assert(tablet, "Missing tablet breakpoint");
  assert(compactSplit, "Missing small-medium host split breakpoint");
  assert(narrowPhone, "Missing narrow-phone breakpoint");

  const playerGrid = mergedBlock(".player-grid");
  assert(hasDecl(playerGrid, "grid-template-columns", "repeat(2, minmax(0, 1fr))"), "Player banners must use two columns max by default");

  const desktopHostLayout = mergedBlock(".host-lobby-layout");
  const desktopHostStatusLayout = mergedBlock(".host-lobby-layout.has-room-status");
  assert(desktopHostLayout.includes("clamp(370px, 28vw, 480px)"), "Wide screens should reserve the left column for host controls");
  assert(desktopHostStatusLayout.includes('"controls status"') && desktopHostStatusLayout.includes('"controls players"'), "Wide screens should keep controls left while the floating chat stays out of the lobby grid");

  const mediumPlayerGrid = mergedBlock(".player-grid", medium);
  assert(hasDecl(mediumPlayerGrid, "grid-template-columns", "1fr"), "Medium screens should show one readable player-banner column");

  const compactHostLayout = mergedBlock(".setup-lobby .host-lobby-layout", compactSplit);
  assert(compactHostLayout !== null, "Small-medium host setup should retain a dedicated layout rule");
  const compactHostStatus = mergedBlock(".setup-lobby .host-lobby-layout.has-room-status", compactSplit);
  assert(compactHostStatus.includes('"controls status"'), "Small-medium host options should stay in the left column");

  const narrowPlayerGrid = mergedBlock(".player-grid", narrowPhone);
  assert(hasDecl(narrowPlayerGrid, "grid-template-columns", "1fr"), "Narrow phones should use one full-width player banner column");

  const playerCardName = mergedBlock(".player-card h2");
  assert(hasDecl(playerCardName, "white-space", "normal"), "Player names must wrap instead of becoming squeezed one-line text");
  assert(hasDecl(playerCardName, "overflow-wrap", "anywhere"), "Player names need overflow wrapping for long funny names");

  const pokeButton = mergedBlock(".poke-hint");
  assert(hasDecl(pokeButton, "min-width", "92px"), "Default Gahook button should stay usable but slimmer than the old wide button");
  assert(hasDecl(pokeButton, "max-width", "118px"), "Default Gahook button should have a capped width so names keep space");

  const playerCard = mergedBlock(".player-card");
  assert(hasDecl(playerCard, "grid-template-columns", "64px minmax(0, 1fr)"), "Player card should reserve a stable avatar column and a flexible name column");
  assert(hasDecl(playerCard, "grid-template-rows", "auto auto"), "Player card should place actions below the name to prevent squeezed names");

  const playerActions = mergedBlock(".player-card-actions");
  assert(hasDecl(playerActions, "grid-column", "2"), "Desktop player actions should sit under the name, not steal name width");
  assert(hasDecl(playerActions, "justify-self", "stretch"), "Player actions should use the full banner width beneath the name");
  assert(hasDecl(playerActions, "justify-content", "flex-end"), "Player actions should pin to the right edge of the banner");

  const gahookLabel = getFunctionSection("GahookLabel");
  assert(gahookLabel.includes('text = "Gahook"'), "Gahook label should render text by default");
  assert(!gahookLabel.includes("pokeCount"), "Routine Gahook labels must not render hidden poke counters");
  assert(!gahookLabel.includes("<b"), "Routine Gahook labels must not render counter bubbles");
  assert(!css.includes(".gahook-button-label b"), "Routine Gahook counter bubble styles should stay removed");

  const voteMenu = mergedBlock(".player-vote-menu summary");
  assert(hasDecl(voteMenu, "width", "38px"), "Vote-kick should live behind a compact burger menu");

  const burgerLines = mergedBlock(".burger-lines i");
  assert(hasDecl(burgerLines, "width", "16px"), "Burger menu needs visible line strokes");

  const playerCardSection = getFunctionSection("PlayerCard");
  const readonlyPlayerCardSection = getFunctionSection("ReadonlyPlayerCard");
  assert(playerCardSection.indexOf('className="player-action-menu"') < playerCardSection.indexOf('className="poke-hint"'), "Player card should place its action menu immediately before Gahook");
  assert(readonlyPlayerCardSection.indexOf('className="player-action-menu player-vote-menu"') < readonlyPlayerCardSection.indexOf('className="poke-hint"'), "Readonly player card should place vote-kick immediately before Gahook");
  assert(readonlyPlayerCardSection.includes('className="player-action-trigger"'), "Readonly vote-kick menu should use the compact burger trigger");
  assert(!readonlyPlayerCardSection.includes('className="vote-kick-button"'), "Vote-kick must not render as a visible pill on player banners");

  const mobileActions = mergedBlock(".player-card-actions", mobile);
  assert(hasDecl(mobileActions, "display", "flex"), "Mobile player actions should stay aligned as a compact row");
  assert(hasDecl(mobileActions, "grid-column", "2"), "Mobile player actions should stay at the far right of the banner");

  const mobilePoke = mergedBlock(".poke-hint", mobile);
  assert(hasDecl(mobilePoke, "min-width", "104px"), "Mobile Gahook buttons must not shrink below usable width");

  const mobileAnswerGrid = mergedBlock(".answer-grid", mobile);
  assert(hasDecl(mobileAnswerGrid, "grid-template-columns", "repeat(2"), "Mobile answer grid should keep answers in two columns");

  const builderAnswer = mergedBlock(".builder-answer");
  assert(hasDecl(builderAnswer, "grid-template-columns", "24px minmax(0, 1fr) 32px"), "Question answer rows should dedicate their width to the answer input");
  const questionBuilder = getFunctionSection("QuestionBuilder");
  assert(!questionBuilder.includes("ANSWER_LABELS"), "Question answer rows should not waste space on color names");

  const playerSummaryName = mergedBlock(".player-summary-name span");
  assert(hasDecl(playerSummaryName, "white-space", "normal"), "Own-player names should wrap instead of being cut off");
  assert(hasDecl(playerSummaryName, "overflow-wrap", "anywhere"), "Own-player names should remain visible even without spaces");

  const addAnswerButton = mergedBlock(".add-answer-button");
  assert(hasDecl(addAnswerButton, "min-height", "56px"), "Add answer should have a generous tap target");
  assert(hasDecl(addAnswerButton, "background", "var(--blue)"), "Add answer should have a strong default color");
  for (const color of ["red", "blue", "yellow", "green"]) {
    assert(hasDecl(mergedBlock(".add-answer-button.answer-" + color), "background", "var(--" + color + ")"), "Add answer should support the " + color + " answer color");
  }

  const playerGame = getFunctionSection("PlayerGame");
  const answerGrid = getFunctionSection("AnswerGrid");
  const answerTile = mergedBlock(".answer-tile");
  assert(!answerGrid.includes("AnswerShape"), "Game answers should not render shape icons");
  assert(hasDecl(answerTile, "display", "flex") && hasDecl(answerTile, "justify-content", "center"), "Game answer text should be centered");
  assert(!playerGame.includes("InlineLockedAnswer"), "Locked answers should not render a duplicate status line below the grid");
  assert(answerGrid.includes('"is-locked"'), "Locked answers should mark the answer grid for its muted visual state");
  const lockedTiles = mergedBlock(".answer-grid.is-locked .answer-tile");
  assert(hasDecl(lockedTiles, "filter", "saturate(0.62)"), "Locked answer choices should mute their colors");

  assert(answerGrid.includes("AnswerChoicePlayers"), "Answer tiles should render the players who selected them");
  assert(!answerGrid.includes("anonymous={!reveal}"), "Ordinary live answer choices should show player identities");
  assert(answerGrid.includes("playAnswerOohSound"), "New answer selections should trigger the soft monkey cue");
  const answerPlayers = mergedBlock(".answer-choice-players");
  assert(hasDecl(answerPlayers, "position", "absolute"), "Answer player avatars should sit on top of their answer tile");
  const answerPlayerAvatar = mergedBlock(".answer-choice-player .avatar-badge.is-small");
  assert(hasDecl(answerPlayerAvatar, "width", "34px"), "Answer player avatars should remain legible without crowding the answer text");
  const spotlightPlayers = mergedBlock(".correct-answer-players");
  assert(hasDecl(spotlightPlayers, "justify-content", "center"), "Correct-answer spotlight should show centered player avatars");
  const questionImage = mergedBlock(".question-image");
  assert(hasDecl(questionImage, "max-height", "520px") && hasDecl(questionImage, "height", "auto"), "Portrait question images should be capped without stretching");

  const mobileRoster = mergedBlock(".roster-row", mobile);
  assert(hasDecl(mobileRoster, "grid-template-columns", "104px"), "Mobile in-game Gahook roster needs a protected button column");

  const finalName = mergedBlock(".final-gahook-card h2");
  assert(hasDecl(finalName, "overflow-wrap", "anywhere"), "Final cards must wrap long player names");

  const leaderboardName = mergedBlock(".leaderboard-list strong");
  assert(hasDecl(leaderboardName, "white-space", "normal"), "Scoreboard names should wrap instead of truncating");
  assert(hasDecl(leaderboardName, "overflow-wrap", "anywhere"), "Scoreboard names need overflow wrapping");

  const leaderboardActionRow = mergedBlock(".leaderboard-list li.has-gahook-action");
  assert(hasDecl(leaderboardActionRow, "grid-template-columns", "minmax(100px"), "Scoreboard Gahook rows need a protected button column");

  const leaderboardButton = mergedBlock(".leaderboard-gahook");
  assert(hasDecl(leaderboardButton, "min-width", "94px"), "Scoreboard Gahook button should not collapse");
  assert(hasDecl(leaderboardButton, "width", "100%"), "Scoreboard Gahook button should fill its protected column");
  assert(hasDecl(leaderboardButton, "justify-self", "end"), "Scoreboard Gahook button should stay hard right");
  const mobileLeaderboardButton = mergedBlock(".leaderboard-gahook", mobile);
  assert(hasDecl(mobileLeaderboardButton, "grid-column", "4"), "Small-screen scoreboard should reserve a separate right-edge Gahook column");
  const largeScreen = findMediaBlock("(min-width: 1600px)");
  const largeGame = mergedBlock(".host-game", largeScreen);
  const largeGameChildren = mergedBlock(".host-game > *", largeScreen);
  assert(hasDecl(largeGame, "width", "100%") && hasDecl(largeGame, "max-width", "none"), "Large-screen game background should span the full viewport");
  assert(hasDecl(largeGameChildren, "width", "80vw") && largeGameChildren.includes("1500px"), "Large-screen game content should keep a comfortable capped width");

  const mobileMeta = mergedBlock(".quiz-meta-row.is-two-up", mobile);
  assert(hasDecl(mobileMeta, "grid-template-columns", "repeat(2"), "Mobile question and answer metrics should remain side by side");

  const partyScoreboardName = mergedBlock(".party-scoreboard li strong");
  assert(hasDecl(partyScoreboardName, "white-space", "normal"), "Party scoreboard names should wrap");

  const questionStageTablet = mergedBlock(".question-stage", tablet);
  assert(hasDecl(questionStageTablet, "grid-template-columns", "1fr"), "Question stage should become one column on tablet/mobile");

  assert(findBlocks("*").some((block) => hasDecl(block, "box-sizing", "border-box")), "All UI elements should use border-box sizing so padded controls cannot overflow their columns");
  const chatMessage = mergedBlock(".social-chat__message");
  const ownChatMessage = mergedBlock(".social-chat__message.is-own");
  const ownChatBubble = mergedBlock(".social-chat__message.is-own .social-chat__bubble");
  const chatMessages = mergedBlock(".social-chat__messages");
  const floatingChat = mergedBlock(".waiting-room-social");
  const minimizedChat = mergedBlock(".waiting-room-social.is-minimized");
  const chatFab = mergedBlock(".social-chat-fab");
  const chatNotifications = mergedBlock(".social-chat-notifications");
  const codeBandLayout = mergedBlock(".code-band__layout");
  const codeBandText = mergedBlock(".code-band__text");
  const roomQrCode = mergedBlock(".room-qr-code");
  assert(hasDecl(chatMessage, "flex", "0 0 auto") && chatMessage.includes("height: auto"), "Chat rows must contribute their full wrapped height instead of shrinking into each other");
  assert(hasDecl(chatMessages, "overflow-x", "hidden"), "Room chat should never create a horizontal scrollbar");
  assert(hasDecl(ownChatMessage, "grid-template-columns", "minmax(0, 1fr) 30px"), "Own chat messages should place the avatar on the right");
  assert(hasDecl(ownChatBubble, "justify-self", "end"), "Own chat bubbles should stay aligned to the right");
  assert(hasDecl(floatingChat, "position", "fixed") && hasDecl(floatingChat, "right") && hasDecl(floatingChat, "bottom"), "Room chat should stay anchored to the bottom-right viewport corner");
  assert(hasDecl(minimizedChat, "width", "auto") && hasDecl(minimizedChat, "pointer-events", "none"), "Minimized chat should collapse to its floating controls");
  assert(hasDecl(chatFab, "border-radius", "50%") && hasDecl(chatFab, "pointer-events", "auto"), "Minimized chat should expose a clickable floating action button");
  assert(hasDecl(chatFab, "width", "58px") && hasDecl(chatFab, "height", "58px") && chatFab.includes("#238b70"), "Floating chat button should use the smaller muted-green treatment");
  assert(hasDecl(chatNotifications, "position", "absolute") && hasDecl(chatNotifications, "bottom", "76px"), "Unread speech bubbles should stack immediately above the chat button");
  assert(hasDecl(codeBandLayout, "grid-template-columns", "minmax(0, auto) auto"), "Lobby QR should sit to the right of the complete code text column");
  assert(hasDecl(codeBandText, "justify-items", "center") && hasDecl(codeBandText, "text-align", "center"), "Lobby label, code and link should share centered alignment");
  assert(hasDecl(roomQrCode, "width", "118px") && hasDecl(roomQrCode, "height", "118px"), "Lobby QR should use the enlarged desktop size");
  assert(app.includes("function LobbyCodeBand") && app.includes('className="code-band__text"'), "Every lobby-code variant should use the shared aligned QR layout");

  return {
    checked: [
      "player grid capped at two columns",
      "medium single-column player banners",
      "small-medium widened host split layout",
      "narrow-phone one-column player grid",
      "mobile player name wrapping",
      "burger vote-kick menu",
      "routine Gahook labels hide counters",
      "mobile player action widths",
      "always-visible join action footer",
      "mobile Gahook button width",
      "mobile answer stacking",
      "mobile in-game roster button column",
      "final-card long-name wrapping",
      "scoreboard names wrap",
      "scoreboard Gahook button sizing",
      "full-width large-screen background with capped content",
      "side-by-side mobile game metrics",
      "tablet question-stage stacking",
      "border-box overflow protection",
      "large right-aligned lobby QR with centered code text",
      "non-overlapping left/right chat bubbles",
      "bottom-right floating chat with minimized notifications"
    ]
  };
}

console.log(JSON.stringify({ ok: true, layout: runLayoutSmoke() }, null, 2));
