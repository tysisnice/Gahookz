import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A repeated key in an object literal is always a mistake: the later value
// silently wins and the earlier line is dead. It has happened twice -- the
// backlog item "publicMajorityResults sets unanimous twice", and a second
// `namedPlayerNames` in the Herd review payload that the first guard could not
// see, because it only inspected a function's own top-level `return {`. The
// Herd one was nested two objects deep inside a `.map`, which is where this
// class of bug actually lives: a merge that lands both sides of a conflict.
//
// So the check is no longer per function. It reads every object literal in
// every source file we own, at any depth. There is no parser to hand --
// TypeScript 7 is the native port and exposes no JS compiler API, and this
// project stays dependency-light on purpose -- so the scanner below walks
// characters, skipping comments and strings, and collects the property names
// at each brace's own level. `scanSource` is also tested against shapes that
// are legal and easy to mistake for keys, which is what makes a clean scan of
// the real tree mean something.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..");

/** Property names declared with `name:` directly inside each object literal. */
export function scanSource(source) {
  const found = [];
  const stack = [];
  let line = 1;
  let index = 0;
  const isIdent = (char) => /[A-Za-z0-9_$]/.test(char);

  const close = () => {
    const done = stack.pop();
    if (!done) return;
    const repeated = [...new Set(done.keys.filter((key, at) => done.keys.indexOf(key) !== at))];
    if (repeated.length) found.push({ line: done.line, keys: repeated });
  };

  while (index < source.length) {
    const char = source[index];
    const after = source[index + 1];
    if (char === "\n") { line += 1; index += 1; continue; }
    if (char === "/" && after === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && after === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        if (source[index] === "\n") line += 1;
        index += 1;
      }
      index += 2;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      index += 1;
      while (index < source.length && source[index] !== char) {
        if (source[index] === "\\") index += 1;
        else if (source[index] === "\n") line += 1;
        index += 1;
      }
      index += 1;
      if (stack.length) stack[stack.length - 1].expectKey = false;
      continue;
    }
    if (char === "{") { stack.push({ keys: [], expectKey: true, line, nested: 0 }); index += 1; continue; }
    if (char === "}") { close(); index += 1; continue; }
    // A key only ever sits outside parentheses and brackets, so track those to
    // keep `map((answer) => ...)` and `[index]` from looking like one.
    if (char === "(" || char === "[") {
      if (stack.length) stack[stack.length - 1].nested += 1;
      index += 1;
      continue;
    }
    if (char === ")" || char === "]") {
      if (stack.length) stack[stack.length - 1].nested = Math.max(0, stack[stack.length - 1].nested - 1);
      index += 1;
      continue;
    }
    const open = stack[stack.length - 1];
    if (char === "," && open && open.nested === 0) { open.expectKey = true; index += 1; continue; }
    if (open && open.nested === 0 && open.expectKey && isIdent(char)) {
      let end = index;
      while (end < source.length && isIdent(source[end])) end += 1;
      const word = source.slice(index, end);
      let colon = end;
      while (colon < source.length && /[ \t]/.test(source[colon])) colon += 1;
      // `case x:` and `default:` are a switch body, not an object.
      if (source[colon] === ":" && source[colon + 1] !== ":" && word !== "case" && word !== "default") {
        open.keys.push(word);
        open.expectKey = false;
        index = colon + 1;
        continue;
      }
      open.expectKey = false;
      index = end;
      continue;
    }
    if (open && !/\s/.test(char)) open.expectKey = open.expectKey && (char === "." || char === "?");
    index += 1;
  }
  while (stack.length) close();
  return found;
}

// Generated browser modules are listed in .gitignore by the build that writes
// them, so that file is the authority on what is ours to check. vendor/ is
// third-party and minified; legacy/ is kept history.
function generatedPaths() {
  return new Set(readFileSync(path.join(repoRoot, ".gitignore"), "utf8").
    split("\n").
    map((entry) => entry.trim()).
    filter((entry) => entry && !entry.startsWith("#")).
    map((entry) => path.join(repoRoot, entry)));
}

function sourceFiles(dir, skip) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "vendor", "legacy", ".git"].includes(entry.name)) continue;
      found.push(...sourceFiles(full, skip));
    } else if (/\.(mjs|js|jsx|ts|tsx)$/.test(entry.name) && !skip.has(full)) {
      found.push(full);
    }
  }
  return found;
}

test("the scanner finds a repeated key wherever it is nested", () => {
  const shallow = scanSource("const a = { ok: true, ok: false };");
  assert.deepEqual(shallow.map((hit) => hit.keys), [["ok"]]);

  // The shape that actually occurred: two objects deep, inside a callback.
  const nested = scanSource(`
    function publicThing(room) {
      return room.items.map((item) => ({
        id: item.id,
        detail: {
          text: item.text,
          names: item.names || [],
          names: item.names || [],
          image: item.image
        }
      }));
    }
  `);
  assert.deepEqual(nested.map((hit) => hit.keys), [["names"]], "a duplicate inside a nested literal must be reported");

  // And the historical one, which is why this guard exists at all.
  const historical = scanSource(`
    function publicMajorityResults(room, question) {
      return { unanimous: Boolean(a), counts: 1, unanimous: Boolean(b) };
    }
  `);
  assert.deepEqual(historical.map((hit) => hit.keys), [["unanimous"]]);
});

test("the scanner does not mistake legal code for a repeated key", () => {
  const legal = `
    // A comment with ok: twice, ok: again.
    const text = "ok: one, ok: two";
    const template = \`ok: three, ok: four\`;
    function choose(value) {
      switch (value) {
        case "a": return 1;
        case "b": return 2;
        default: return 3;
      }
    }
    const ternary = { label: value ? { name: "x" } : { name: "y" }, other: 1 };
    const sameNameDifferentObjects = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const shorthand = { ok, error };
    const computed = { [key]: 1, [other]: 2 };
    const spread = { ...base, id: 1 };
    const deep = { a: { a: { a: 1 } } };
    const mapped = items.map((item) => ({ id: item.id, id2: item.id }));
    const colonInUrl = { href: "https://example.com", title: "x" };
    const arrow = { run: (a, b) => ({ a, b }), done: true };
  `;
  assert.deepEqual(scanSource(legal), [], "legal shapes must not be reported: " + JSON.stringify(scanSource(legal)));
});

test("no source file we own repeats a key in an object literal", () => {
  const skip = generatedPaths();
  const files = [
    ...sourceFiles(path.join(repoRoot, "standalone"), skip),
    ...sourceFiles(path.join(repoRoot, "packages"), skip)];
  assert.ok(files.length > 60, "the scan must actually reach the tree, saw " + files.length + " files");
  assert.ok(
    files.some((file) => file.endsWith(path.join("standalone", "server.js"))),
    "server.js must be in the scan set");
  assert.ok(
    !files.some((file) => file.endsWith(path.join("public", "app.js"))),
    "generated browser modules must stay out of the scan set");

  const offenders = [];
  for (const file of files) {
    for (const hit of scanSource(readFileSync(file, "utf8"))) {
      offenders.push(`${path.relative(repoRoot, file)}:${hit.line} repeats ${hit.keys.join(", ")}`);
    }
  }
  assert.deepEqual(offenders, [], "duplicate object keys:\n" + offenders.join("\n"));
});
