import assert from "node:assert/strict";
import fs from "node:fs/promises";

const source = (await fs.readFile(new URL("./public/app.jsx", import.meta.url), "utf8")).replaceAll("\r\n", "\n");

function sourceBetween(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Could not find prompt block: ${start}`);
  return source.slice(from + start.length, to);
}

const partyBlock = sourceBetween("const PARTY_QUESTION_PRESETS = [", "];\n\nconst GAME_MODES");
const majorityBlock = sourceBetween("const MAJORITY_QUESTION_PRESETS = [", "];\n\nconst EDUCATION_QUESTION_PRESETS");
const educationBlock = sourceBetween("const EDUCATION_QUESTION_PRESETS = [", "const emptyLobby");

const partyEntries = [...partyBlock.matchAll(/\{ text: "([^"]+)", answers: \["([^"]+)", "([^"]+)"\] \}/g)];
const majorityEntries = [...majorityBlock.matchAll(/\{ text: "([^"]+)", answers: \[([^\]]+)\] \}/g)];
const educationEntries = [...educationBlock.matchAll(/\{ text: "([^"]+)", correct: "([^"]+)", wrong: \[([^\]]+)\] \}/g)];

assert.equal(partyEntries.length, 50, "Quiz party library should contain the original 40 plus 10 new prompts");
assert.equal(majorityEntries.length, 40, "Majority Rulz should have 40 opinion-based party questions");
assert.equal(educationEntries.length, 58, "Education Quiz library should contain the original 8 plus 50 new questions");

assert.equal(new Set(partyEntries.map((entry) => entry[1])).size, partyEntries.length, "Quiz party prompts should be unique");
assert.equal(new Set(majorityEntries.map((entry) => entry[1])).size, majorityEntries.length, "Majority Rulz questions should be unique");
assert.equal(new Set(educationEntries.map((entry) => entry[1])).size, educationEntries.length, "Education Quiz questions should be unique");

for (const [, question, correct, wrongSource] of educationEntries) {
  const wrong = [...wrongSource.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.equal(wrong.length, 3, `${question} should have exactly three wrong answers`);
  assert.equal(new Set([correct, ...wrong]).size, 4, `${question} should have four distinct answers`);
}

for (const expected of [
  "Which snack disappears first at every party?",
  "What is the funniest emergency announcement?",
  "What would make the worst group-chat name?"
]) assert.ok(majorityEntries.some((entry) => entry[1] === expected), `Missing Majority Rulz question: ${expected}`);

for (const expected of [
  "Which formula gives the area of a circle?",
  "Which organelle is often called the powerhouse of the cell?",
  "Which is the largest planet in our solar system?"
]) assert.ok(educationEntries.some((entry) => entry[1] === expected), `Missing education question: ${expected}`);

console.log(`Prompt library smoke passed (${educationEntries.length} education Quiz, ${partyEntries.length} party Quiz, ${majorityEntries.length} Majority Rulz).`);
