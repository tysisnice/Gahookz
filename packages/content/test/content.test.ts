import assert from "node:assert/strict";
import test from "node:test";

import {
  ABSENT_PLAYER_NAME,
  EDUCATIONAL_TEMPLATES,
  FUNNY_TEMPLATES,
  PLAYER_PLACEHOLDER,
  TemplateBag,
  choosePlayer,
  instantiateTemplate,
  substitutePlayerName,
  templatesForStyle,
  validateCatalogue
} from "../src/index.ts";

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const funny = FUNNY_TEMPLATES[0]!;
const educational = EDUCATIONAL_TEMPLATES[0]!;

test("the catalogue holds exactly the 20 + 20 new drafts and is structurally valid", () => {
  assert.equal(EDUCATIONAL_TEMPLATES.length, 20);
  assert.equal(FUNNY_TEMPLATES.length, 20);
  assert.deepEqual(validateCatalogue(), []);
  for (let index = 1; index <= 20; index += 1) {
    const suffix = String(index).padStart(2, "0");
    assert.ok(EDUCATIONAL_TEMPLATES.some((t) => t.id === `EDU-NEW-${suffix}`), `missing EDU-NEW-${suffix}`);
    assert.ok(FUNNY_TEMPLATES.some((t) => t.id === `FUN-NEW-${suffix}`), `missing FUN-NEW-${suffix}`);
  }
});

// A display name is attacker-controlled, so every one of these is a real case.
test("a player name is inserted as literal text, never interpreted", () => {
  const cases: Array<[string, string]> = [
    ["$&", "$&"],
    ["$1 $` $'", "$1 $` $'"],
    ["<img src=x onerror=alert(1)>", "<img src=x onerror=alert(1)>"],
    ["{Player1}", "{Player1}"],
    ["🐸🎉", "🐸🎉"],
    ["Ada\\nLovelace", "Ada\\nLovelace"]
  ];
  for (const [name, expected] of cases) {
    const rendered = substitutePlayerName("Hello {Player1}!", name);
    assert.equal(rendered, `Hello ${expected}!`, `name ${name} was altered`);
  }
});

test("a name containing the placeholder is not expanded a second time", () => {
  // Otherwise a player called {Player1} would have their own name replaced by
  // somebody else's on a later pass.
  const rendered = substitutePlayerName("What would {Player1} do?", "{Player1}");
  assert.equal(rendered, "What would {Player1} do?");
  assert.equal(substitutePlayerName(rendered, "Sam"), "What would Sam do?");
});

test("every placeholder occurrence is filled, leaving no token behind", () => {
  const rendered = substitutePlayerName("{Player1} and {Player1} again", "Sam");
  assert.equal(rendered, "Sam and Sam again");
  assert.ok(!rendered.includes(PLAYER_PLACEHOLDER));
});

test("an empty room gets a stand-in rather than a raw token", () => {
  const instance = instantiateTemplate(funny, { eligible: [], random: seeded(1) });
  assert.ok(instance.text.includes(ABSENT_PLAYER_NAME));
  assert.ok(!instance.text.includes(PLAYER_PLACEHOLDER));
  assert.deepEqual(instance.namedPlayerIds, []);
});

test("a one-player room names that player", () => {
  const instance = instantiateTemplate(funny, {
    eligible: [{ id: "p1", name: "Solo" }],
    random: seeded(3)
  });
  assert.ok(instance.text.includes("Solo"));
  assert.deepEqual(instance.namedPlayerIds, ["p1"]);
});

test("duplicate display names still resolve to one identified player", () => {
  const instance = instantiateTemplate(funny, {
    eligible: [{ id: "p1", name: "Sam" }, { id: "p2", name: "Sam" }],
    random: seeded(7)
  });
  assert.equal(instance.namedPlayerIds.length, 1);
  assert.ok(["p1", "p2"].includes(instance.namedPlayerIds[0]!));
  assert.ok(instance.text.includes("Sam"));
});

test("selection is spread across the room rather than fixed on one player", () => {
  // Drawn from one stream rather than one draw from each of many seeds. A
  // linear generator advances by a fixed step, so its *first* output for
  // consecutive seeds barely moves and lands in one or two buckets -- which
  // would look exactly like a biased chooser while telling us nothing.
  const eligible = ["a", "b", "c", "d"].map((id) => ({ id, name: id.toUpperCase() }));
  const random = seeded(17);
  const counts = new Map<string, number>();
  const draws = 2_000;
  for (let index = 0; index < draws; index += 1) {
    const chosen = choosePlayer(eligible, random)!;
    counts.set(chosen.id, (counts.get(chosen.id) ?? 0) + 1);
  }
  assert.equal(counts.size, 4, "every player should be reachable, saw " + [...counts.keys()].join(","));
  for (const [id, count] of counts) {
    const share = count / draws;
    assert.ok(share > 0.15 && share < 0.35, `player ${id} was chosen ${(share * 100).toFixed(1)}% of the time`);
  }
});

test("an instance is frozen: it does not reword when the room changes", () => {
  const eligible = [{ id: "p1", name: "Sam" }];
  const instance = instantiateTemplate(funny, { eligible, random: seeded(5) });
  const original = instance.text;
  // Renaming, leaving or new joiners cannot reach a rendered instance: it is a
  // value, not a view over the roster.
  eligible[0]!.name = "Renamed";
  assert.equal(instance.text, original);
});

test("the answer key is withheld unless explicitly asked for", () => {
  const forPlayers = instantiateTemplate(educational, { random: seeded(2) });
  assert.equal(forPlayers.factualAnswerId, null);
  assert.equal(forPlayers.explanation, null);

  const forReveal = instantiateTemplate(educational, { random: seeded(2), includeAnswerKey: true });
  assert.equal(forReveal.factualAnswerId, educational.factualAnswerId);
  assert.ok(forReveal.explanation);
});

test("a funny prompt never acquires a correct answer", () => {
  const instance = instantiateTemplate(funny, {
    eligible: [{ id: "p1", name: "Sam" }],
    random: seeded(9),
    includeAnswerKey: true
  });
  assert.equal(instance.factualAnswerId, null, "an opinion has no correct answer, even at reveal");
  assert.equal(instance.explanation, null);
});

test("options are shuffled but keep their ids, so the key survives", () => {
  const orders = new Set<string>();
  for (let seed = 1; seed <= 40; seed += 1) {
    const instance = instantiateTemplate(educational, { random: seeded(seed), includeAnswerKey: true });
    orders.add(instance.options.map((option) => option.id).join(","));
    assert.equal(instance.options.length, 4);
    assert.equal(new Set(instance.options.map((o) => o.id)).size, 4);
    const key = instance.options.find((option) => option.id === instance.factualAnswerId);
    assert.ok(key, "the keyed option must still be present after shuffling");
    const source = educational.options.find((option) => option.id === instance.factualAnswerId);
    assert.equal(key!.text, source!.text, "the key must still point at the same text");
  }
  assert.ok(orders.size > 1, "options should not always appear in the same order");
});

test("a room sees the whole library before anything repeats", () => {
  const bag = new TemplateBag("funny", seeded(11));
  const drawn = new Set<string>();
  for (let index = 0; index < FUNNY_TEMPLATES.length; index += 1) {
    drawn.add(bag.next().id);
  }
  assert.equal(drawn.size, FUNNY_TEMPLATES.length, "the bag repeated before the library was exhausted");
  assert.ok(bag.next(), "the bag must refill rather than run dry");
});

test("a style only ever yields its own templates", () => {
  assert.equal(templatesForStyle("educational").length, 20);
  assert.ok(templatesForStyle("educational").every((t) => t.kind === "educational"));
  assert.ok(templatesForStyle("funny").every((t) => t.kind === "funny"));
});

test("a broken random source cannot produce an out-of-range choice", () => {
  const eligible = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
  for (const broken of [() => Number.NaN, () => 1, () => 1.5, () => -3, () => Infinity]) {
    const chosen = choosePlayer(eligible, broken);
    assert.ok(chosen && eligible.includes(chosen), "a hostile random must still yield a real player");
  }
});

test("an instance reports the names it used, for emphasis", () => {
  const instance = instantiateTemplate(funny, {
    eligible: [{ id: "p1", name: "Sam" }],
    random: seeded(4)
  });
  assert.deepEqual(instance.namedPlayerNames, ["Sam"]);
  assert.ok(instance.text.includes("Sam"));
});

test("a hostile display name is still only ever data", () => {
  // Emphasis is applied by the client splitting the string and rendering
  // elements. Nothing here may produce markup, or a player could name
  // themselves into everyone else's prompt.
  const hostile = '<strong onclick="steal()">Sam</strong>';
  const instance = instantiateTemplate(funny, {
    eligible: [{ id: "p1", name: hostile }],
    random: seeded(6)
  });
  assert.deepEqual(instance.namedPlayerNames, [hostile]);
  assert.ok(instance.text.includes(hostile), "the name must survive verbatim as text");
  // The instance carries no markup of its own for a client to trust.
  assert.ok(!instance.text.includes("</em>"));
});

test("an empty room names nobody, so nothing is emphasised", () => {
  const instance = instantiateTemplate(funny, { eligible: [], random: seeded(8) });
  assert.deepEqual(instance.namedPlayerNames, []);
});
