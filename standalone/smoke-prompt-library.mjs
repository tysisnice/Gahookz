import assert from "node:assert/strict";

// The prompt banks are imported and validated rather than counted with a
// regular expression over source. Counting source text is how a content
// mistake sits behind a green test: the count matches, so nobody reads what
// the entries actually say.
import {
  EDUCATIONAL_TEMPLATES,
  FUNNY_TEMPLATES,
  LEGACY_TEMPLATES,
  PLAYER_PLACEHOLDER,
  validateCatalogue,
  validateLegacy
} from "../packages/content/src/index.ts";

// --- the 40 new drafts from Appendices A and B ------------------------------

const catalogueProblems = validateCatalogue();
assert.deepEqual(
  catalogueProblems,
  [],
  "The shared catalogue must be structurally valid: " + JSON.stringify(catalogueProblems.slice(0, 5))
);

assert.equal(EDUCATIONAL_TEMPLATES.length, 20, "Appendix A contributes exactly 20 educational prompts");
assert.equal(FUNNY_TEMPLATES.length, 20, "Appendix B contributes exactly 20 funny prompts");

for (let index = 1; index <= 20; index += 1) {
  const suffix = String(index).padStart(2, "0");
  assert.ok(EDUCATIONAL_TEMPLATES.some((entry) => entry.id === "EDU-NEW-" + suffix), "Missing EDU-NEW-" + suffix);
  assert.ok(FUNNY_TEMPLATES.some((entry) => entry.id === "FUN-NEW-" + suffix), "Missing FUN-NEW-" + suffix);
}

for (const template of [...EDUCATIONAL_TEMPLATES, ...FUNNY_TEMPLATES]) {
  assert.equal(template.options.length, 4, template.id + " needs four options");
  const texts = template.options.map((option) => option.text.trim().toLowerCase());
  assert.equal(new Set(texts).size, 4, template.id + " has duplicate options");
  for (const token of template.question.match(/\{[^}]*\}/g) || []) {
    assert.equal(token, PLAYER_PLACEHOLDER, template.id + " uses an unsupported token " + token);
  }
}

for (const template of EDUCATIONAL_TEMPLATES) {
  assert.ok(
    template.options.some((option) => option.id === template.factualAnswerId),
    template.id + " keys an option that does not exist"
  );
  assert.ok(template.explanation.trim().length > 8, template.id + " needs a real explanation");
  assert.ok(!template.question.includes(PLAYER_PLACEHOLDER), template.id + " must not name a player");
}

for (const template of FUNNY_TEMPLATES) {
  assert.ok(template.question.includes(PLAYER_PLACEHOLDER), template.id + " must name a player");
  assert.equal(template.factualAnswerId, undefined, template.id + " must not carry an answer key");
}

// --- the legacy banks, migrated out of inline arrays ------------------------

const legacyProblems = validateLegacy();
assert.deepEqual(
  legacyProblems,
  [],
  "Migrated legacy prompts must be valid: " + JSON.stringify(legacyProblems.slice(0, 5))
);

// Prompts appeared verbatim in more than one bank, so ids reflect where the
// *kept* version came from. Where a prompt was duplicated, the richer entry
// wins: five prompts existed as two-option party questions and as four-option
// Majority ones, and keeping whichever came first silently threw the extra
// options away.
const byPrefix = (prefix) => LEGACY_TEMPLATES.filter((entry) => entry.id.startsWith(prefix));
assert.equal(byPrefix("MAJ-").length, 40, "Every Majority prompt must survive, with its four options");
assert.equal(byPrefix("EDU-LEGACY-").length, 58, "The 58 educational prompts must survive migration");
assert.equal(LEGACY_TEMPLATES.length, 175, "The migrated bank should hold 175 distinct prompts");

for (const entry of byPrefix("MAJ-")) {
  assert.equal(entry.options.length, 4, entry.id + " must keep four options");
}

// Spot-check that content came across intact rather than merely counted.
const redPlanet = LEGACY_TEMPLATES.find((entry) => entry.question.includes("Red Planet"));
assert.ok(redPlanet, "A known educational prompt should have migrated");
assert.equal(
  redPlanet.options.find((option) => option.id === redPlanet.factualAnswerId)?.text,
  "Mars",
  "A migrated educational prompt must keep its verified answer"
);

// The bug this whole stage exists to prevent: an opinion with a correct answer.
for (const entry of LEGACY_TEMPLATES) {
  if (entry.kind !== "opinion") continue;
  assert.equal(entry.factualAnswerId, null, entry.id + " is an opinion and must carry no answer key");
}

console.log(JSON.stringify({
  ok: true,
  newTemplates: EDUCATIONAL_TEMPLATES.length + FUNNY_TEMPLATES.length,
  migratedLegacy: LEGACY_TEMPLATES.length,
  checked: [
    "all 40 new ids present and structurally valid",
    "four distinct options and only supported tokens",
    "every educational entry keys a real option and explains it",
    "no funny or opinion prompt carries an answer key",
    "all 40 Majority prompts kept their four options through deduplication",
    "58 educational prompts survived migration",
    "a migrated educational prompt kept its verified answer"
  ]
}, null, 2));
