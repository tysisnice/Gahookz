export const DEFAULT_GAHOOK_FORM = "monkey";
export const CUSTOM_GAHOOK_FORM = "custom";
export const CUSTOM_GAHOOK_FORM_DEFINITION = { id: CUSTOM_GAHOOK_FORM, label: "Your Custom Gahook" };

export const GAHOOK_FORMS = [
  { id: "monkey", label: "Classic Monkey" },
  { id: "gorilla", label: "Rage Gorilla" },
  { id: "koala", label: "Chonky Koala" },
  { id: "croc", label: "Cool Croc" },
  { id: "capybara", label: "Airhorn Capy" },
  { id: "chicken", label: "Cymbal Chicken" }
];

const FORM_IDS = new Set([...GAHOOK_FORMS.map((form) => form.id), CUSTOM_GAHOOK_FORM]);
const STORAGE_KEY = "gahookz-gahook-form";

export function normaliseGahookFormId(value) {
  const id = String(value || "").toLowerCase();
  return FORM_IDS.has(id) ? id : DEFAULT_GAHOOK_FORM;
}

export function getGahookForm(value) {
  const id = normaliseGahookFormId(value);
  if (id === CUSTOM_GAHOOK_FORM) return CUSTOM_GAHOOK_FORM_DEFINITION;
  return GAHOOK_FORMS.find((form) => form.id === id) || GAHOOK_FORMS[0];
}

export function getStoredGahookForm() {
  try {
    return normaliseGahookFormId(localStorage.getItem(STORAGE_KEY));
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
