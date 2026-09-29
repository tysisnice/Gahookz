import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error -- hand-written browser module without type declarations
import * as forms from "./gahook-forms.js";

const { GAHOOK_FORMS, LEGACY_GAHOOK_FORMS, getGahookForm, getStoredGahookForm, normaliseGahookFormId, storeGahookForm } = forms as {
  GAHOOK_FORMS: { id: string; label: string }[];
  LEGACY_GAHOOK_FORMS: Record<string, string>;
  getGahookForm: (value: unknown) => { id: string; label: string };
  getStoredGahookForm: () => string;
  normaliseGahookFormId: (value: unknown) => string;
  storeGahookForm: (value: unknown) => string;
};

/** A minimal localStorage double; the module only touches one key. */
function installStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage = {
    getItem: (key: string) => (values.has(key) ? values.get(key) as string : null),
    setItem: (key: string, value: string) => { values.set(key, String(value)); }
  };
  (globalThis as { localStorage?: unknown }).localStorage = storage;
  return values;
}

test("Sad Pig sits with the monkeys, after Classic Monkey and Rage Gorilla", () => {
  assert.deepEqual(GAHOOK_FORMS.map((form) => form.id), ["monkey", "gorilla", "pig", "koala", "croc", "chicken"]);
  assert.equal(getGahookForm("pig").label, "Sad Pig");
});

test("the retired Airhorn Capy id becomes the Sad Pig, not the default monkey", () => {
  assert.equal(LEGACY_GAHOOK_FORMS.capybara, "pig");
  assert.equal(normaliseGahookFormId("capybara"), "pig");
  assert.equal(normaliseGahookFormId("CAPYBARA"), "pig");
  assert.equal(getGahookForm("capybara").id, "pig");
  assert.equal(normaliseGahookFormId("not-a-form"), "monkey");
  assert.equal(normaliseGahookFormId("custom"), "custom");
});

test("a stored capybara choice is read as the pig and rewritten once", () => {
  const values = installStorage({ "gahookz-gahook-form": "capybara" });
  assert.equal(getStoredGahookForm(), "pig");
  assert.equal(values.get("gahookz-gahook-form"), "pig");
  assert.equal(storeGahookForm("capybara"), "pig");
  assert.equal(values.get("gahookz-gahook-form"), "pig");
});

test("an unreadable store falls back to the monkey", () => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); }
  };
  assert.equal(getStoredGahookForm(), "monkey");
});
