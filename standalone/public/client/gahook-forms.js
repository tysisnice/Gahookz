export const DEFAULT_GAHOOK_FORM = "monkey";
export const CUSTOM_GAHOOK_FORM = "custom";
export const CUSTOM_GAHOOK_FORM_DEFINITION = { id: CUSTOM_GAHOOK_FORM, label: "Your Custom Gahook" };

// Picker order. Sad Pig sits with the monkeys, straight after Classic Monkey
// and Rage Gorilla (Tyson, 2026-09-25).
export const GAHOOK_FORMS = [
  { id: "monkey", label: "Classic Monkey" },
  { id: "gorilla", label: "Rage Gorilla" },
  { id: "pig", label: "Sad Pig" },
  { id: "koala", label: "Chonky Koala" },
  { id: "croc", label: "Cool Croc" },
  { id: "chicken", label: "Cymbal Chicken" }
];

// Retired form ids and the form that replaced them. A choice saved in this
// browser, a cached snapshot or an older client can still say "capybara"
// (Airhorn Capy, replaced by Sad Pig on 2026-09-25); it becomes the pig rather
// than silently falling back to the monkey. The server keeps the same table.
export const LEGACY_GAHOOK_FORMS = Object.freeze({ capybara: "pig" });

const FORM_IDS = new Set([...GAHOOK_FORMS.map((form) => form.id), CUSTOM_GAHOOK_FORM]);
const STORAGE_KEY = "gahookz-gahook-form";

export function normaliseGahookFormId(value) {
  const raw = String(value || "").toLowerCase();
  const id = Object.prototype.hasOwnProperty.call(LEGACY_GAHOOK_FORMS, raw) ? LEGACY_GAHOOK_FORMS[raw] : raw;
  return FORM_IDS.has(id) ? id : DEFAULT_GAHOOK_FORM;
}

export function getGahookForm(value) {
  const id = normaliseGahookFormId(value);
  if (id === CUSTOM_GAHOOK_FORM) return CUSTOM_GAHOOK_FORM_DEFINITION;
  return GAHOOK_FORMS.find((form) => form.id === id) || GAHOOK_FORMS[0];
}

export function getStoredGahookForm() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const id = normaliseGahookFormId(stored);
    // Rewrite a retired id once, so the saved choice stops depending on the
    // legacy table.
    if (stored && stored !== id && Object.prototype.hasOwnProperty.call(LEGACY_GAHOOK_FORMS, String(stored).toLowerCase())) {
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch (_error) {
    return DEFAULT_GAHOOK_FORM;
  }
}

export function storeGahookForm(value) {
  const id = normaliseGahookFormId(value);
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch (_error) {}
  return id;
}
