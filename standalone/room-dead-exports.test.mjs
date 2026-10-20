import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Regression guard for the backlog item "assertRoomAssetCapacity and
// roomAssetChars in server/room.mjs are unused": the two functions were dead
// exports — nothing imported them, and the working cap is the byte check in
// server/media.mjs. They are removed; this guard refuses their return to
// server/room.mjs and refuses any live (non-legacy) file under standalone/ from
// importing them. MAX_ROOM_ASSET_CHARS stays, because media.mjs imports it.
const here = path.dirname(fileURLToPath(import.meta.url));
const roomPath = path.join(here, "server", "room.mjs");
const DEAD_NAMES = ["roomAssetChars", "assertRoomAssetCapacity"];

function exportedNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const entry of match[1].split(",")) {
      const name = entry.split(/\bas\b/).pop().trim();
      if (name) names.add(name);
    }
  }
  return names;
}

function importedNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/\bimport\s+([\s\S]*?)\s+from\s*['"][^'"]+['"]/g)) {
    const clause = match[1];
    const braces = clause.match(/\{([^}]*)\}/);
    if (braces) {
      for (const entry of braces[1].split(",")) {
        const name = entry.split(/\bas\b/)[0].trim();
        if (name) names.add(name);
      }
    }
    const before = clause.split("{")[0].trim().replace(/,$/, "").trim();
    if (/^[A-Za-z_$][\w$]*$/.test(before)) names.add(before);
  }
  return names;
}

function liveSourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "legacy") continue;
      found.push(...liveSourceFiles(full));
    } else if (/\.(mjs|js|jsx|ts|tsx)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

test("server/room.mjs no longer exports the dead room-asset functions", () => {
  const exported = exportedNames(readFileSync(roomPath, "utf8"));
  for (const name of DEAD_NAMES) {
    assert.ok(!exported.has(name), `server/room.mjs must not export ${name}`);
  }
  assert.ok(exported.has("MAX_ROOM_ASSET_CHARS"), "server/room.mjs must still export MAX_ROOM_ASSET_CHARS");
});

test("no live file under standalone/ imports the dead room-asset names", () => {
  for (const file of liveSourceFiles(here)) {
    const imported = importedNames(readFileSync(file, "utf8"));
    for (const name of DEAD_NAMES) {
      assert.ok(!imported.has(name), `${path.relative(here, file)} must not import ${name}`);
    }
  }
});
