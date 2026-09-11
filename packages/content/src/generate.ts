// Turning a template into one rendered question instance.
//
// The whole point of an instance is that it is *frozen*. Everyone in the room
// must read the same sentence, and a reconnect, a rename, someone leaving or
// someone joining must not reword a question that is already in play. So the
// chosen player and the rendered text are decided once, here, and stored.

import {
  ABSENT_PLAYER_NAME,
  EDUCATIONAL_TEMPLATES,
  FUNNY_TEMPLATES,
  PLAYER_PLACEHOLDER,
  type PromptTemplate,
  type TemplateOption,
  isPersonalised
} from "./templates.ts";
import { LEGACY_TEMPLATES, type LegacyTemplate } from "./legacy.ts";

/** Anything the generator can render: a new catalogue entry or a migrated one. */
export type PlayableTemplate = PromptTemplate | LegacyTemplate;

function hasAnswerKey(template: PlayableTemplate): boolean {
  return template.kind === "educational" || template.kind === "factual";
}

export interface EligiblePlayer {
  readonly id: string;
  readonly name: string;
}

export interface QuestionInstance {
  readonly templateId: string;
  readonly templateVersion: number;
  readonly kind: PlayableTemplate["kind"];
  /** The finished sentence. Never re-rendered. */
  readonly text: string;
  /** Ids of the players named in it, for moderation and for tests. */
  readonly namedPlayerIds: readonly string[];
  /**
   * The display names actually used. The client emphasises these when it
   * renders the prompt, by splitting the string and wrapping the matches in
   * elements -- never by putting markup into the text, which would turn a
   * display name into an injection vector.
   */
  readonly namedPlayerNames: readonly string[];
  /** Presented order; ids stay stable so the key survives the shuffle. */
  readonly options: readonly TemplateOption[];
  /** Present only for educational templates, and only server-side. */
  readonly factualAnswerId: string | null;
  readonly explanation: string | null;
}

/**
 * Substitute a display name as *literal text*.
 *
 * Not a regex replacement and not string interpolation, because a display name
 * is attacker-controlled. `$&` in a replacement string would expand to the
 * match, a name containing `{Player1}` would be re-expanded on a second pass,
 * and markup in a name must stay inert. Splitting on the placeholder and
 * joining avoids all three: nothing in the inserted text is ever interpreted.
 */
export function substitutePlayerName(template: string, name: string): string {
  return template.split(PLAYER_PLACEHOLDER).join(name);
}

/**
 * Choose one eligible player uniformly by id.
 *
 * The requester may be chosen. Excluding them sounds fair but makes a
 * one-player lobby impossible to serve, and the prompts are about the room
 * rather than about secrets.
 */
export function choosePlayer(
  eligible: readonly EligiblePlayer[],
  random: () => number
): EligiblePlayer | null {
  if (!eligible.length) return null;
  const drawn = random();
  const safe = Number.isFinite(drawn) ? Math.min(Math.max(drawn, 0), 0.999_999_999) : 0;
  return eligible[Math.floor(safe * eligible.length)] ?? eligible[0] ?? null;
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const out = [...values];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const drawn = random();
    const safe = Number.isFinite(drawn) ? Math.min(Math.max(drawn, 0), 0.999_999_999) : 0;
    const target = Math.floor(safe * (index + 1));
    const current = out[index] as T;
    out[index] = out[target] as T;
    out[target] = current;
  }
  return out;
}

/**
 * Render one instance.
 *
 * `includeAnswerKey` is false for anything a player may see. The factual answer
 * and its explanation belong to the reveal, and a snapshot that carries them
 * during answering has decided the round for whoever reads the payload.
 */
export function instantiateTemplate(
  template: PlayableTemplate,
  options: {
    readonly eligible?: readonly EligiblePlayer[];
    readonly random?: () => number;
    readonly includeAnswerKey?: boolean;
  } = {}
): QuestionInstance {
  const random = options.random ?? Math.random;
  const eligible = options.eligible ?? [];
  const includeAnswerKey = options.includeAnswerKey === true;

  const needsPlayer = template.question.includes(PLAYER_PLACEHOLDER);
  const chosen = needsPlayer ? choosePlayer(eligible, random) : null;
  const name = chosen ? chosen.name : ABSENT_PLAYER_NAME;
  const text = needsPlayer ? substitutePlayerName(template.question, name) : template.question;

  return {
    templateId: template.id,
    templateVersion: template.version,
    kind: template.kind,
    text,
    namedPlayerIds: chosen ? [chosen.id] : [],
    namedPlayerNames: chosen ? [chosen.name] : [],
    options: shuffled(template.options, random),
    factualAnswerId: includeAnswerKey && hasAnswerKey(template) ? (template as { factualAnswerId: string | null }).factualAnswerId ?? null : null,
    explanation: includeAnswerKey && template.kind === "educational" ? template.explanation : null
  };
}

/**
 * How often a funny prompt names somebody.
 *
 * Not all of them, on purpose. Every suggestion being "What would Sam..." wears
 * thin quickly and leaves whoever is not named with nothing to do, so the
 * personalised prompts are a seasoning rather than the whole menu. The rest
 * come from the general opinion bank, which is much larger.
 */
export const DEFAULT_PERSONALISED_SHARE = 0.35;

/** Everything playable for a style: the new catalogue plus the migrated banks. */
export function poolForStyle(style: "educational" | "funny"): readonly PlayableTemplate[] {
  if (style === "educational") {
    return [...EDUCATIONAL_TEMPLATES, ...LEGACY_TEMPLATES.filter((entry) => entry.kind === "factual")];
  }
  return [...FUNNY_TEMPLATES, ...LEGACY_TEMPLATES.filter((entry) => entry.kind === "opinion")];
}

/**
 * Draws prompts for a room, without replacement, mixing personalised prompts
 * in at a deliberate rate.
 *
 * Two bags rather than one. Drawing uniformly from a combined pool would make
 * the twenty personalised prompts vanish among the eighty-six general ones;
 * drawing only from the personalised pool, which is what this did at first,
 * names somebody in every single question. Each bag is still exhausted before
 * it repeats, so a room works through both libraries.
 */
export class TemplateBag {
  private personalised: string[] = [];
  private general: string[] = [];
  private readonly byId = new Map<string, PlayableTemplate>();
  private readonly personalisedIds: string[];
  private readonly generalIds: string[];

  constructor(
    private readonly style: "educational" | "funny",
    private readonly random: () => number = Math.random,
    private readonly personalisedShare: number = DEFAULT_PERSONALISED_SHARE
  ) {
    const pool = poolForStyle(style);
    for (const template of pool) this.byId.set(template.id, template);
    this.personalisedIds = pool.filter(isPersonalised).map((template) => template.id);
    this.generalIds = pool.filter((template) => !isPersonalised(template)).map((template) => template.id);
  }

  private draw(which: "personalised" | "general"): string | undefined {
    const source = which === "personalised" ? this.personalisedIds : this.generalIds;
    if (!source.length) return undefined;
    if (which === "personalised") {
      if (!this.personalised.length) this.personalised = shuffled(source, this.random);
      return this.personalised.pop();
    }
    if (!this.general.length) this.general = shuffled(source, this.random);
    return this.general.pop();
  }

  /** The next template, refilling a bag when its library has been exhausted. */
  next(): PlayableTemplate {
    const drawn = this.random();
    const roll = Number.isFinite(drawn) ? Math.min(Math.max(drawn, 0), 0.999_999_999) : 0.5;
    const wantPersonalised = roll < this.personalisedShare && this.personalisedIds.length > 0;
    const id = this.draw(wantPersonalised ? "personalised" : "general") ??
      this.draw(wantPersonalised ? "general" : "personalised");
    const template = id ? this.byId.get(id) : undefined;
    return template ?? (poolForStyle(this.style)[0] as PlayableTemplate);
  }

  get remainingCount(): number {
    return this.personalised.length + this.general.length;
  }
}
