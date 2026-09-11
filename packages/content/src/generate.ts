// Turning a template into one rendered question instance.
//
// The whole point of an instance is that it is *frozen*. Everyone in the room
// must read the same sentence, and a reconnect, a rename, someone leaving or
// someone joining must not reword a question that is already in play. So the
// chosen player and the rendered text are decided once, here, and stored.

import {
  ABSENT_PLAYER_NAME,
  PLAYER_PLACEHOLDER,
  type PromptTemplate,
  type TemplateOption,
  findTemplate,
  templatesForStyle
} from "./templates.ts";

export interface EligiblePlayer {
  readonly id: string;
  readonly name: string;
}

export interface QuestionInstance {
  readonly templateId: string;
  readonly templateVersion: number;
  readonly kind: "educational" | "funny";
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
  template: PromptTemplate,
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
    factualAnswerId: includeAnswerKey && template.kind === "educational" ? template.factualAnswerId : null,
    explanation: includeAnswerKey && template.kind === "educational" ? template.explanation : null
  };
}

/**
 * A shuffled bag of template ids, drawn without replacement.
 *
 * Random choice alone repeats a prompt embarrassingly often in a short game.
 * A bag guarantees the whole library is seen before anything comes round
 * again. Player selection stays independent and uniform, so this is not a
 * claim that the *questions* are uniformly distributed over time.
 */
export class TemplateBag {
  private remaining: string[] = [];

  constructor(
    private readonly style: "educational" | "funny",
    private readonly random: () => number = Math.random
  ) {}

  private refill(): void {
    this.remaining = shuffled(
      templatesForStyle(this.style).map((template) => template.id),
      this.random
    );
  }

  /** The next template, refilling when the library has been exhausted. */
  next(): PromptTemplate {
    if (!this.remaining.length) this.refill();
    const id = this.remaining.pop();
    const template = id ? findTemplate(id) : null;
    if (!template) {
      const all = templatesForStyle(this.style);
      return all[0] as PromptTemplate;
    }
    return template;
  }

  get remainingCount(): number {
    return this.remaining.length;
  }
}
