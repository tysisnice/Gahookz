import { useEffect, useState } from "react";

const MUTE_KEY = "gahookz-effects-muted";
const MUTE_EVENT = "gahookz-mute-change";
const REDUCED_EFFECTS_KEY = "gahookz-effects-reduced";
const REDUCED_EFFECTS_EVENT = "gahookz-reduced-effects-change";
const REDUCED_EFFECTS_QUERY = "(prefers-reduced-motion: reduce)";

export function effectsMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch (_error) {
    return false;
  }
}

export function systemPrefersReducedEffects() {
  try {
    return Boolean(window.matchMedia?.(REDUCED_EFFECTS_QUERY).matches);
  } catch (_error) {
    return false;
  }
}

export function reducedEffectsPreferred() {
  try {
    return localStorage.getItem(REDUCED_EFFECTS_KEY) === "1";
  } catch (_error) {
    return false;
  }
}

export function effectsReduced() {
  return effectsMuted() || reducedEffectsPreferred() || systemPrefersReducedEffects();
}

export function applyEffectsReduced(reduced = effectsReduced()) {
  if (typeof document === "undefined") return;
  const next = Boolean(reduced);
  document.documentElement.classList.toggle("gahookz-reduced-effects", next);
  document.documentElement.dataset.reducedEffects = next ? "true" : "false";
}

function dispatchReducedEffectsChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(REDUCED_EFFECTS_EVENT, {
    detail: {
      preferred: reducedEffectsPreferred(),
      effective: effectsReduced()
    }
  }));
}

export function applyEffectsMuted(muted) {
  if (typeof document === "undefined") return;
  const next = Boolean(muted);
  document.documentElement.classList.toggle("gahookz-muted", next);
  document.documentElement.dataset.effectsMuted = next ? "true" : "false";
  applyEffectsReduced(next || reducedEffectsPreferred() || systemPrefersReducedEffects());
  if (!next) return;
  window.speechSynthesis?.cancel?.();
  try {
    window.gahookzCustomAudio?.pause?.();
    window.gahookzCustomAudio = null;
  } catch (_error) {}
  const gain = window.gahookzPokeGain;
  const ctx = window.gahookzAudioContext;
  try {
    if (gain && ctx) gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    ctx?.suspend?.();
  } catch (_error) {}
}

export function setEffectsMuted(muted) {
  const next = Boolean(muted);
  try {
    localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch (_error) {}
  applyEffectsMuted(next);
  window.dispatchEvent(new CustomEvent(MUTE_EVENT, { detail: next }));
  dispatchReducedEffectsChange();
}

export function setEffectsReducedPreference(reduced) {
  const next = Boolean(reduced);
  try {
    localStorage.setItem(REDUCED_EFFECTS_KEY, next ? "1" : "0");
  } catch (_error) {}
  applyEffectsReduced(effectsMuted() || next || systemPrefersReducedEffects());
  dispatchReducedEffectsChange();
}

export function useMutePreference() {
  const [muted, setMuted] = useState(effectsMuted);
  useEffect(() => {
    applyEffectsMuted(muted);
    const sync = (event) => setMuted(Boolean(event.detail));
    window.addEventListener(MUTE_EVENT, sync);
    return () => window.removeEventListener(MUTE_EVENT, sync);
  }, []);
  return [muted, () => setEffectsMuted(!muted)];
}

export function useReducedEffectsPreference() {
  const [preference, setPreference] = useState(() => ({
    preferred: reducedEffectsPreferred(),
    effective: effectsReduced()
  }));
  useEffect(() => {
    applyEffectsReduced(effectsReduced());
    const sync = (event) => setPreference({
      preferred: Boolean(event.detail?.preferred),
      effective: Boolean(event.detail?.effective)
    });
    window.addEventListener(REDUCED_EFFECTS_EVENT, sync);
    return () => window.removeEventListener(REDUCED_EFFECTS_EVENT, sync);
  }, []);
  return [
    preference.preferred,
    () => setEffectsReducedPreference(!preference.preferred),
    preference.effective
  ];
}

function installReducedEffectsSync() {
  if (typeof window === "undefined" || !window.matchMedia) return;
  const mediaQuery = window.matchMedia(REDUCED_EFFECTS_QUERY);
  const sync = () => {
    applyEffectsReduced(effectsMuted() || reducedEffectsPreferred() || mediaQuery.matches);
    dispatchReducedEffectsChange();
  };
  if (mediaQuery.addEventListener) mediaQuery.addEventListener("change", sync);
  else mediaQuery.addListener?.(sync);
}

if (typeof document !== "undefined") {
  applyEffectsMuted(effectsMuted());
  installReducedEffectsSync();
}
