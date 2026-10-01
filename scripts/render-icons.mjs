#!/usr/bin/env node
// Renders the Gahookz app icons from their one source,
// standalone/public/icons/gahookz-monkey.svg, with the headless Chromium that
// Puppeteer already installs for the browser checks. Icons are never edited
// as PNGs: change the SVG, run this, commit both.
//
//   npm run icons:render                          # rewrite the four PNGs
//   npm run icons:render -- --preview <dir>       # also write 512 and 48 px previews
//   npm run icons:render -- --check               # fail if a PNG is stale
//
// Chromium is heavy on the shared server: hold the verification lock.
//   flock /tmp/gahookz-verify.lock npm run icons:render
//
// The maskable icon is the same picture as the 512 px one. That is deliberate:
// the background is full-bleed and the monkey (face, ears and headband,
// furthest point about 190 units from the centre) already sits inside the
// maskable safe zone, the centred circle of radius 40% (204.8 of 512 units),
// so launchers can crop it to any shape without cutting the face. Keep it that
// way when editing the SVG, or give the maskable icon its own padding here.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconDir = path.join(root, "standalone", "public", "icons");
const sourcePath = path.join(iconDir, "gahookz-monkey.svg");

const OUTPUTS = [
  { file: "gahookz-180.png", size: 180 },
  { file: "gahookz-192.png", size: 192 },
  { file: "gahookz-512.png", size: 512 },
  { file: "gahookz-maskable-512.png", size: 512 }
];

const args = process.argv.slice(2);
const check = args.includes("--check");
const previewIndex = args.indexOf("--preview");
const previewDir = previewIndex >= 0 ? path.resolve(args[previewIndex + 1] || "") : "";
assert(previewIndex < 0 || args[previewIndex + 1], "--preview needs a directory");

const source = await fs.readFile(sourcePath, "utf8");
// Inline SVG in a page exactly the icon's size: no scrollbars, no margin, and
// the SVG's own width="100%" fills it.
const page = (size) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; width: ${size}px; height: ${size}px; overflow: hidden; background: transparent; }
  svg { display: block; width: ${size}px; height: ${size}px; }
</style></head><body>${source}</body></html>`;

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const stale = [];
try {
  const tab = await browser.newPage();
  async function render(size) {
    await tab.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await tab.setContent(page(size), { waitUntil: "load" });
    return Buffer.from(await tab.screenshot({ type: "png", clip: { x: 0, y: 0, width: size, height: size } }));
  }

  for (const output of OUTPUTS) {
    const png = await render(output.size);
    const target = path.join(iconDir, output.file);
    if (check) {
      const current = await fs.readFile(target).catch(() => null);
      if (!current || !current.equals(png)) stale.push(output.file);
      continue;
    }
    await fs.writeFile(target, png);
    console.log(`wrote standalone/public/icons/${output.file} (${output.size} px, ${png.length} bytes)`);
  }

  if (previewDir) {
    await fs.mkdir(previewDir, { recursive: true });
    for (const size of [512, 48]) {
      const file = path.join(previewDir, `icon-${size}.png`);
      await fs.writeFile(file, await render(size));
      console.log(`wrote ${path.relative(root, file)}`);
    }
  }
} finally {
  await browser.close();
}

if (check) {
  // Chromium's rasteriser can differ by a pixel between versions, so a stale
  // result means "re-render and look", not necessarily a wrong icon.
  if (stale.length) {
    console.error("Icons differ from a fresh render of gahookz-monkey.svg: " + stale.join(", "));
    process.exit(1);
  }
  console.log("Icons match a fresh render of gahookz-monkey.svg.");
}
