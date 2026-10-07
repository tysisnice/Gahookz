import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// A merge on 2026-10-07 dropped one closing brace in styles.css. Browsers
// then read the last ~330 lines as rules nested inside the unclosed block, so
// none of them applied, and nothing failed: the build, the smoke scripts and
// most screenshots all passed. Merges that resolve stylesheet conflicts by
// hand are the usual cause, so every stylesheet's braces are checked here.

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

function stylesheets() {
  const files = [path.join(publicDir, "styles.css")];
  for (const name of fs.readdirSync(path.join(publicDir, "client"))) {
    if (name.endsWith(".css")) files.push(path.join(publicDir, "client", name));
  }
  return files;
}

// Comments and quoted strings may contain braces; neither counts.
export function braceProblems(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, "\"\"");
  let depth = 0;
  let line = 1;
  for (const character of text) {
    if (character === "\n") line += 1;
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth < 0) return `an extra "}" on line ${line}`;
    }
  }
  return depth === 0 ? "" : `${depth} unclosed "{" at the end of the file`;
}

test("every stylesheet closes every brace it opens", () => {
  for (const file of stylesheets()) {
    const problem = braceProblems(fs.readFileSync(file, "utf8"));
    assert.equal(problem, "", `${path.relative(publicDir, file)}: ${problem}`);
  }
});

test("the brace check catches a dropped brace and an extra one", () => {
  assert.equal(braceProblems(".a { color: red; }\n.b { color: blue; }"), "");
  assert.match(braceProblems(".a { .b { color: red; }\n.c { color: blue; }"), /unclosed/);
  assert.match(braceProblems(".a { color: red; } }"), /extra/);
  assert.equal(braceProblems('/* { */ .a::after { content: "}"; }'), "");
});
