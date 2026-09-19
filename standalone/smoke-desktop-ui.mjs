// The desktop UI overhaul, checked where it can be checked without a browser.
//
// Two kinds of assertion live here, and they are deliberately different.
//
// Server round-trips are real: they drive a disposable room over HTTP and
// assert what comes back. Those are worth trusting.
//
// Client assertions read the `.jsx`/`.css` source. `.jsx` is outside strict
// TypeScript and a successful build proves only that it parses, so these exist
// to catch a structural regression — a component deleted, a class renamed, a
// string reverted — not to prove the screen looks right. Layout is stage V's
// job, in an actual browser, and nothing here substitutes for it.
import assert from "node:assert/strict";
import fs from "node:fs";

const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const unique = () => Date.now() + Math.random().toString(36).slice(2);
const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), "utf8");

const app = read("./public/app.jsx");
const styles = read("./public/styles.css");
const controls = read("./public/client/controls.jsx");
const creator = read("./public/client/custom-gahook.jsx");
const drawing = read("./public/client/drawing.jsx");
const social = read("./public/client/social.jsx");

async function request(path, body) {
  const response = await fetch(BASE_URL + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: response.status, data: await response.json() };
}

// A 1x1 PNG. Small enough to be stored, real enough to survive validation.
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// --- Stage B: the shared controls exist and are reachable by keyboard. ---
assert(controls.includes("export function ToggleSwitch"), "The shared toggle must exist");
assert(controls.includes("export function InfoTip"), "The shared info tip must exist");
assert(controls.includes('role="switch"') && controls.includes("aria-checked"), "The toggle must announce its state");
assert(controls.includes("onFocus") && controls.includes("onMouseEnter"), "The tip must open on focus as well as hover");
assert(controls.includes('event.key === "Escape"'), "A pinned tip must be dismissable from the keyboard");
assert(styles.includes(".toggle-switch") && styles.includes(".info-tip-bubble"), "The shared controls need styles");

// --- Stage D: Majority Rulez keeps the switch and trades its paragraph for an (i). ---
assert(app.includes("<InfoTip label=\"What Majority Rulez changes\">"), "Majority Rulez should explain itself through the tip");
assert(!app.includes("What does this change?"), "The Majority Rulez explainer paragraph should be gone");
assert(app.includes("majority-toggle-controls"), "The tip sits beside the switch, on the same row");

// --- Stage C: two custom Gahook slots, named after what the player drew. ---
assert(app.includes('"Custom Gahook " + (entry.slot + 1)'), "Undrawn slots fall back to numbered names");
assert(!app.includes("Draw my own"), "The single 'Draw my own' button is replaced by the two slots");
assert(!app.includes("custom-gahook-slot-picker"), "The account-only cloud slot strip is gone");
{
  // The poses describe the canvas, so they must render after it.
  const canvasAt = creator.indexOf("<SimplePaintEditor");
  const posesAt = creator.indexOf("custom-gahook-frame-tabs");
  assert(canvasAt > 0 && posesAt > canvasAt, "The pose selector belongs under the canvas");
}
assert(creator.includes("custom-gahook-button-icon"), "Creator buttons carry icons");
assert(drawing.includes("simple-paint-editor__icon"), "Paint editor buttons carry icons");
{
  // Every icon is decorative and sits beside its own text, so none of them may
  // be announced. A glyph read aloud as "wastebasket" beside the word Remove
  // is noise.
  const iconSpans = [...creator.matchAll(/custom-gahook-button-icon[^>]*>/g), ...drawing.matchAll(/simple-paint-editor__icon[^>]*>/g)];
  assert(iconSpans.length >= 8, "Expected icons on the creator and paint buttons, found " + iconSpans.length);
  assert(iconSpans.every((match) => match[0].includes('aria-hidden="true"')), "Decorative icons must be hidden from assistive technology");
}

{
  const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
  const hostKey = "ui-host-" + unique();
  const playerKey = "ui-player-" + unique();
  await request("/api/room", { code, playerKey: hostKey, intent: "host" });
  await request("/api/player/join", { code, playerKey, name: "Slotty", avatarId: "fox" });

  // Guest play must never need an account, and custom Gahooks are cosmetic, so
  // both slots have to work with no sign-in at all.
  const before = await request("/api/state", { code, role: "player", playerKey });
  assert.equal(before.data.customGahookOptions.slotCount, 2, "Every player, signed in or not, gets two slots");
  assert.equal(before.data.customGahookOptions.slots.length, 2);
  assert(before.data.customGahookOptions.slots.every((slot) => !slot.drawn), "Slots start empty");

  const first = await request("/api/player/custom-gahook", { code, playerKey, slot: 0, customGahook: { name: "Slot One", frames: [TINY_PNG], backgroundColor: "#ff3d8b", effectId: "shake", soundId: "bonk" } });
  assert.equal(first.status, 200, "Saving slot 0 answered " + first.status + ": " + first.data.error);
  const second = await request("/api/player/custom-gahook", { code, playerKey, slot: 1, customGahook: { name: "Slot Two", frames: [TINY_PNG], backgroundColor: "#246bfe", effectId: "spin", soundId: "honk" } });
  assert.equal(second.status, 200, "Saving slot 1 answered " + second.status + ": " + second.data.error);
  assert.deepEqual(second.data.slots.map((slot) => slot.name), ["Slot One", "Slot Two"], "Each slot is named after its own Gahook");

  // The round trip is the point: slot 0 must still be there after slot 1 was
  // written over the top of the active configuration.
  const back = await request("/api/player/custom-gahook-slot", { code, playerKey, slot: 0 });
  assert.equal(back.status, 200, "Switching slots answered " + back.status + ": " + back.data.error);
  assert.equal(back.data.customGahook.name, "Slot One");
  assert.equal(back.data.customGahook.effectId, "shake");
  assert.equal(back.data.customGahook.frames.length, 1, "Slot 0's drawing must survive slot 1 being written");

  const forward = await request("/api/player/custom-gahook-slot", { code, playerKey, slot: 1 });
  assert.equal(forward.data.customGahook.name, "Slot Two");
  assert.equal(forward.data.customGahook.effectId, "spin");
  assert.equal(forward.data.customGahook.frames.length, 1, "Slot 1's drawing must survive the round trip");

  const locked = await request("/api/player/custom-gahook-slot", { code, playerKey, slot: 2 });
  assert.equal(locked.status, 400, "A third slot is not available without an entitlement");
  assert.equal(locked.data.ok, false);
}

// --- Stage E: painting moved off the chat and onto the lobby player wall. ---
assert(social.includes("export function LobbyPaintLayer"), "The lobby wall needs its own paint layer");
assert(social.includes("export const LOBBY_PAINT_OPACITY = 0.6"), "Lobby strokes paint at 0.6 opacity");
assert(social.includes("export function profilePaintColor"), "A player's colour comes from their profile");
assert(!social.includes("social-chat__drawing"), "The chat drawing surface is gone");
assert(!social.includes("social-drawing-tools"), "The chat brush-size toolbar is gone");
assert(!styles.includes(".social-chat__drawing"), "The chat drawing styles are gone");
{
  // One tool. A second brush size or an eraser tool here would be the old
  // chat toolbar coming back under a new name.
  const toolClasses = new Set([...social.matchAll(/lobby-paint__([a-z-]+)/g)].map((match) => match[1]));
  assert.deepEqual([...toolClasses].sort(), ["canvas", "draw", "erase", "status", "swatch", "tools"], "The lobby paint layer offers Draw and erase-mine only");
}
assert(app.includes("<LobbyPaintSurface"), "The lobby screens must mount the paint layer");
assert.equal((app.match(/<LobbyPaintSurface/g) || []).length, 5, "Every waiting-room wall gets the paint layer");

{
  const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
  const hostKey = "paint-host-" + unique();
  const painterKey = "paint-a-" + unique();
  const bystanderKey = "paint-b-" + unique();
  await request("/api/room", { code, playerKey: hostKey, intent: "host" });
  await request("/api/player/join", { code, playerKey: painterKey, name: "Painter", avatarId: "fox" });
  await request("/api/player/join", { code, playerKey: bystanderKey, name: "Bystander", avatarId: "bee" });

  const stroke = (color) => ({ tool: "brush", color, size: 7, points: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.45 }] });
  const painted = await request("/api/room/whiteboard/stroke", { code, playerKey: painterKey, stroke: stroke("#ee844f") });
  assert.equal(painted.status, 200, "Painting answered " + painted.status + ": " + painted.data.error);
  const bystood = await request("/api/room/whiteboard/stroke", { code, playerKey: bystanderKey, stroke: stroke("#4fee7c") });
  assert.equal(bystood.status, 200);

  const before = await request("/api/state", { code, role: "host", playerKey: hostKey });
  assert.equal(before.data.whiteboardStrokes.length, 2, "Both players' strokes should be on the wall");
  const painterId = before.data.players.find((player) => player.name === "Painter").id;

  // Getting Gahooked wipes your drawings — yours, and nobody else's.
  const gahook = await request("/api/host/poke", { code, playerKey: hostKey, playerId: painterId });
  assert.equal(gahook.status, 200, "Gahooking answered " + gahook.status + ": " + gahook.data.error);

  const after = await request("/api/state", { code, role: "host", playerKey: hostKey });
  assert.equal(after.data.whiteboardStrokes.length, 1, "Only the Gahooked player's strokes should go");
  assert.notEqual(after.data.whiteboardStrokes[0].senderId, painterId, "The surviving stroke belongs to the bystander");
  assert(after.data.whiteboardRevision > before.data.whiteboardRevision, "An erase must bump the revision so clients repaint");
}

console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, customGahookSlots: 2, lobbyPaintOpacity: 0.6 }, null, 2));
