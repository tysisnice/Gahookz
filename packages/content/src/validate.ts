// Structural rules every template must satisfy.
//
// Run as a test rather than trusted, because the catalogue is generated from a
// document and a content mistake here reaches players as a broken or unfair
// question.

import { ALL_TEMPLATES, PLAYER_PLACEHOLDER, type PromptTemplate } from "./templates.ts";

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
