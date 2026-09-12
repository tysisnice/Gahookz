// Remove exactly the files the build generates, and nothing else.
//
// `standalone/public/client/` mixes generated output with hand-written source:
// `arena.js` and `net.js` are built, while `audio.js` and `gahook-forms.js` are
// written by hand. A `rm client/*.js` looks like a clean and is actually a
// deletion of source -- which is precisely what happened while preparing a
// clean candidate build for P12.
//
// The list comes from build-client.mjs, so it cannot drift from what is
// actually generated.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const source = await fs.readFile(new URL("./build-client.mjs", import.meta.url), "utf8");

const block = source.slice(source.indexOf("const generatedFiles = new Set(["), source.indexOf("]);"));
const generated = [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
if (!generated.length) throw new Error("Could not read the generated-file list from build-client.mjs");

const removed = [];
for (const relative of generated) {
  const absolute = path.join(publicDir, relative);
  try {
    await fs.unlink(absolute);
    removed.push(relative);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

console.log(JSON.stringify({ ok: true, declared: generated.length, removed }, null, 2));
