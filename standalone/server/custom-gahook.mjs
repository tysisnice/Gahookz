import { storeRoomAudio, storeRoomImage } from "./media.mjs";

export const MAX_CUSTOM_GAHOOK_FRAMES = 3;
// Two custom Gahooks for everybody, account or not.
//
// Slots used to be an account entitlement alone, so a guest had one and could
// not keep a second drawing at all. Custom Gahooks are cosmetic, and guest play
// must never need an account, so the two local slots live on the room player.
// An account still adds durability — its saved copy survives the room — and an
// entitlement above two still widens the picker.
export const LOCAL_CUSTOM_GAHOOK_SLOTS = 2;
export const MAX_CUSTOM_GAHOOK_FRAME_CHARS = 180_000;
export const MAX_CUSTOM_GAHOOK_AUDIO_CHARS = 280_000;
export const CUSTOM_GAHOOK_BACKGROUND_IDS = ["monkey"];
export const CUSTOM_GAHOOK_BACKGROUND_COLORS = ["#ff3d8b", "#246bfe", "#00bfd8", "#7c3aed", "#20b26b", "#ff8a00", "#ef4444", "#111214"];
export const CUSTOM_GAHOOK_EFFECT_IDS = ["shake", "spin", "bounce", "zoom"];
export const CUSTOM_GAHOOK_SOUND_IDS = ["bonk", "honk", "boing", "airhorn", "none", "custom"];

const LEGACY_CUSTOM_GAHOOK_BACKGROUND_IDS = ["burst", "checker", "void", "confetti"];
const LEGACY_CUSTOM_GAHOOK_COLORS = Object.freeze({
  burst: "#ff3d8b",
  checker: "#7c3aed",
  void: "#063352",
  confetti: "#00bfd8"
});

const DEFAULT_CUSTOM_GAHOOK = Object.freeze({
  version: 2,
  name: "My Gahook",
  frames: [],
  backgroundId: CUSTOM_GAHOOK_BACKGROUND_IDS[0],
  backgroundColor: CUSTOM_GAHOOK_BACKGROUND_COLORS[0],
  effectId: CUSTOM_GAHOOK_EFFECT_IDS[0],
  soundId: CUSTOM_GAHOOK_SOUND_IDS[0],
  customAudioDataUrl: "",
  customAudioName: ""
});

export function customGahookOptions() {
  return {
    localSlots: LOCAL_CUSTOM_GAHOOK_SLOTS,
    backgroundIds: [...CUSTOM_GAHOOK_BACKGROUND_IDS],
    backgroundColors: [...CUSTOM_GAHOOK_BACKGROUND_COLORS],
    effectIds: [...CUSTOM_GAHOOK_EFFECT_IDS],
    soundIds: [...CUSTOM_GAHOOK_SOUND_IDS],
    limits: {
      maxFrames: MAX_CUSTOM_GAHOOK_FRAMES,
      maxFrameChars: MAX_CUSTOM_GAHOOK_FRAME_CHARS,
      maxAudioChars: MAX_CUSTOM_GAHOOK_AUDIO_CHARS
    }
  };
}

export function normaliseCustomGahook(room, input, previousValue) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Custom Gahook settings are missing.");
  }
  const previous = publicCustomGahook(previousValue);
  const hasFrames = Object.prototype.hasOwnProperty.call(input, "frames");
  const hasAudio = Object.prototype.hasOwnProperty.call(input, "customAudioDataUrl");
  if (hasFrames && !Array.isArray(input.frames)) throw new Error("Custom Gahook frames must be a list.");
  if (hasFrames && input.frames.length > MAX_CUSTOM_GAHOOK_FRAMES) {
    throw new Error("A custom Gahook can use up to three avatar frames.");
  }
  const frames = hasFrames ? input.frames.map((value) => storeRoomImage(room, value, {
    maxChars: MAX_CUSTOM_GAHOOK_FRAME_CHARS,
    label: "Custom Gahook frame"
  })) : previous.frames;
  const name = Object.prototype.hasOwnProperty.call(input, "name") ? cleanLabel(input.name, 32, "My Gahook") : previous.name;
  const backgroundId = normaliseBackgroundId(input.backgroundId, previous.backgroundId);
  const backgroundColor = normaliseBackgroundColor(
    input.backgroundColor,
    previous.backgroundColor || LEGACY_CUSTOM_GAHOOK_COLORS[backgroundId]
  );
  const effectId = normalisePreset(input.effectId, previous.effectId, CUSTOM_GAHOOK_EFFECT_IDS, "effect");
  const soundId = normalisePreset(input.soundId, previous.soundId, CUSTOM_GAHOOK_SOUND_IDS, "sound");
  const customAudioDataUrl = hasAudio ? storeRoomAudio(room, input.customAudioDataUrl, {
    maxChars: MAX_CUSTOM_GAHOOK_AUDIO_CHARS,
    label: "Custom Gahook sound"
  }) : previous.customAudioDataUrl;
  const customAudioName = hasAudio ? (customAudioDataUrl ? cleanLabel(input.customAudioName, 64, "Custom sound") : "") : previous.customAudioName;
  if (soundId === "custom" && !customAudioDataUrl) {
    throw new Error("Record or upload a sound before selecting custom audio.");
  }
  return { version: 2, name, frames, backgroundId: "monkey", backgroundColor, effectId, soundId, customAudioDataUrl, customAudioName };
}

export function publicCustomGahook(playerOrValue) {
  const value = playerOrValue?.customGahook || playerOrValue || DEFAULT_CUSTOM_GAHOOK;
  const name = cleanLabel(value.name, 32, DEFAULT_CUSTOM_GAHOOK.name);
  const frames = Array.isArray(value.frames) ? value.frames.
    filter((frame) => typeof frame === "string" && /^\/media\/[a-z]{4}\/[a-f0-9]{32}$/i.test(frame)).
    slice(0, MAX_CUSTOM_GAHOOK_FRAMES) : [];
  const backgroundId = normaliseStoredBackgroundId(value.backgroundId);
  const backgroundColor = normaliseBackgroundColor(
    value.backgroundColor,
    LEGACY_CUSTOM_GAHOOK_COLORS[value.backgroundId] || DEFAULT_CUSTOM_GAHOOK.backgroundColor
  );
  const effectId = CUSTOM_GAHOOK_EFFECT_IDS.includes(value.effectId) ? value.effectId : DEFAULT_CUSTOM_GAHOOK.effectId;
  const soundId = CUSTOM_GAHOOK_SOUND_IDS.includes(value.soundId) ? value.soundId : DEFAULT_CUSTOM_GAHOOK.soundId;
  const customAudioDataUrl = typeof value.customAudioDataUrl === "string" && /^\/media\/[a-z]{4}\/[a-f0-9]{32}$/i.test(value.customAudioDataUrl) ? value.customAudioDataUrl : "";
  const customAudioName = customAudioDataUrl ? cleanLabel(value.customAudioName, 64, "Custom sound") : "";
  return { version: 2, name, frames, backgroundId, backgroundColor, effectId, soundId, customAudioDataUrl, customAudioName };
}

function normaliseBackgroundId(incoming, fallback) {
  if (incoming === undefined || incoming === null || incoming === "") return normaliseStoredBackgroundId(fallback);
  const value = String(incoming).trim().toLowerCase().slice(0, 24);
  if (![...CUSTOM_GAHOOK_BACKGROUND_IDS, ...LEGACY_CUSTOM_GAHOOK_BACKGROUND_IDS].includes(value)) {
    throw new Error("Choose a valid custom Gahook background.");
  }
  return value;
}

function normaliseStoredBackgroundId(value) {
  return [...CUSTOM_GAHOOK_BACKGROUND_IDS, ...LEGACY_CUSTOM_GAHOOK_BACKGROUND_IDS].includes(value) ? "monkey" : DEFAULT_CUSTOM_GAHOOK.backgroundId;
}

function normaliseBackgroundColor(incoming, fallback) {
  const candidate = incoming === undefined || incoming === null || incoming === "" ? fallback : incoming;
  const value = String(candidate || DEFAULT_CUSTOM_GAHOOK.backgroundColor).trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(value)) throw new Error("Choose a valid custom Gahook background colour.");
  return value;
}

function normalisePreset(incoming, fallback, choices, label) {
  if (incoming === undefined || incoming === null || incoming === "") return choices.includes(fallback) ? fallback : choices[0];
  const value = String(incoming).trim().toLowerCase().slice(0, 24);
  if (!choices.includes(value)) throw new Error("Choose a valid custom Gahook " + label + ".");
  return value;
}

function cleanLabel(value, maximum, fallback = "") {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum) || fallback;
}
