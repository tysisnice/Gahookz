// Structural rules every template must satisfy.
//
// Run as a test rather than trusted, because the catalogue is generated from a
// document and a content mistake here reaches players as a broken or unfair
// question.

import { ALL_TEMPLATES, PLAYER_PLACEHOLDER, type PromptTemplate } from "./templates.ts";
import { LEGACY_TEMPLATES, type LegacyTemplate } from "./legacy.ts";

export interface TemplateProblem {
  readonly templateId: string;
  readonly problem: string;
}

/** Every token the catalogue is allowed to contain. */
const ALLOWED_TOKENS = [PLAYER_PLACEHOLDER];

export function validateTemplate(template: PromptTemplate): TemplateProblem[] {
  const problems: TemplateProblem[] = [];
  const fail = (problem: string) => problems.push({ templateId: template.id, problem });

  if (!/^[A-Z]+-NEW-\d{2}$/.test(template.id)) fail("id is not a stable catalogue id");
  if (!template.question.trim()) fail("question is empty");
  if (template.options.length !== 4) fail("needs exactly four options");

  const ids = template.options.map((option) => option.id);
  if (new Set(ids).size !== ids.length) fail("option ids must be unique");
  const texts = template.options.map((option) => option.text.trim().toLowerCase());
  if (new Set(texts).size !== texts.length) fail("options must be distinct");
  if (texts.some((text) => !text)) fail("an option is empty");

  // Any brace token other than the ones we support would reach a player as
  // literal text like "{Player2}", which reads as a bug.
  for (const token of template.question.match(/\{[^}]*\}/g) ?? []) {
    if (!ALLOWED_TOKENS.includes(token)) fail(`unsupported token ${token}`);
  }

  if (template.kind === "educational") {
    if (template.question.includes(PLAYER_PLACEHOLDER)) fail("educational prompts must not name a player");
    if (!ids.includes(template.factualAnswerId)) fail("factualAnswerId does not match an option");
    if (!template.explanation.trim()) fail("educational prompts need an explanation");
  } else {
    if (!template.question.includes(PLAYER_PLACEHOLDER)) fail("a funny prompt must name a player");
    // Deliberately no factual answer: see templates.ts.
    if ("factualAnswerId" in template) fail("a funny prompt must not carry an answer key");
  }

  return problems;
}

export function validateCatalogue(): TemplateProblem[] {
  const problems = ALL_TEMPLATES.flatMap(validateTemplate);
  const ids = ALL_TEMPLATES.map((template) => template.id);
  if (new Set(ids).size !== ids.length) {
    problems.push({ templateId: "catalogue", problem: "duplicate template ids" });
  }
  const questions = ALL_TEMPLATES.map((template) => template.question.trim().toLowerCase());
  if (new Set(questions).size !== questions.length) {
    problems.push({ templateId: "catalogue", problem: "duplicate prompts" });
  }
  return problems;
}


/**
 * Legacy entries are checked more loosely than the new catalogue, because
 * their shapes genuinely differ: party prompts offer two options, Majority
 * four, and a Herd seed none. Inventing options to make them uniform would be
 * changing the content, not validating it.
 */
export function validateLegacy(): TemplateProblem[] {
  const problems: TemplateProblem[] = [];
  const fail = (id: string, problem: string) => problems.push({ templateId: id, problem });

  const ids = LEGACY_TEMPLATES.map((template) => template.id);
  if (new Set(ids).size !== ids.length) problems.push({ templateId: "legacy", problem: "duplicate ids" });

  const questions = LEGACY_TEMPLATES.map((template) => template.question.trim().toLowerCase());
  if (new Set(questions).size !== questions.length) {
    problems.push({ templateId: "legacy", problem: "duplicate prompts survived migration" });
  }

  for (const template of LEGACY_TEMPLATES as readonly LegacyTemplate[]) {
    if (!template.question.trim()) fail(template.id, "empty question");
    if (template.kind === "seed") {
      if (template.options.length) fail(template.id, "a writing seed must not carry options");
      if (template.factualAnswerId) fail(template.id, "a writing seed must not carry a key");
      continue;
    }
    if (template.options.length < 2) fail(template.id, "needs at least two options");
    const optionIds = template.options.map((option) => option.id);
    if (new Set(optionIds).size !== optionIds.length) fail(template.id, "option ids must be unique");
    const texts = template.options.map((option) => option.text.trim().toLowerCase());
    if (new Set(texts).size !== texts.length) fail(template.id, "options must be distinct");
    if (template.kind === "factual") {
      if (!optionIds.includes(String(template.factualAnswerId))) fail(template.id, "key does not match an option");
    } else if (template.factualAnswerId) {
      // An opinion with a key is the bug this whole stage exists to prevent.
      fail(template.id, "an opinion prompt must not carry an answer key");
    }
  }
  return problems;
}
