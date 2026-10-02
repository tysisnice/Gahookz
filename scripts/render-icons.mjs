#!/usr/bin/env node
// Renders the Gahookz app icons from their one source,
// standalone/public/icons/gahookz-monkey.svg, with the headless Chromium that
// Puppeteer already installs for the browser checks. Icons are never edited
// as PNGs: change the SVG, run this, commit both.
//
//   npm run icons:render                          # rewrite the four PNGs
//   npm run icons:render -- --preview <dir>       # also write 512 and 48 px previews and the safe-zone picture
//   npm run icons:render -- --check               # fail if a PNG is stale
//
// Chromium is heavy on the shared server: hold the verification lock.
//   flock /tmp/gahookz-verify.lock npm run icons:render
//
// The maskable icon is the same picture as the 512 px one. That is deliberate:
// the background is full-bleed and the monkey (face, ears and headband,
// furthest point about 190 units from the centre) already sits inside the
// maskable safe zone, the centred circle of radius 40% (204.8 of 512 units),
// so launchers can crop it to any shape without cutting the face. Every run
// measures this on the rendered maskable PNG and fails if the monkey's outline
// reaches past the safe zone; if it ever does, give the maskable icon its own
// padding here instead of editing the PNG.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconDir = path.join(root, "standalone", "public", "icons");
const sourcePath = path.join(iconDir, "gahookz-monkey.svg");

// Maskable safe zone (W3C Web App Manifest): a circle of radius 40% of the icon.
const SAFE_ZONE_RADIUS = 0.4 * 512;

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

  // The monkey's outline (#111214) is its outermost solid edge, so the farthest
  // pixel of that colour from the centre is how far the monkey reaches. The
  // soft drop shadow is decoration and may extend past it.
  async function monkeyReach(png) {
    return tab.evaluate(async (dataUrl) => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
      let far = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          if (Math.abs(data[i] - 0x11) <= 6 && Math.abs(data[i + 1] - 0x12) <= 6 && Math.abs(data[i + 2] - 0x14) <= 6) {
            far = Math.max(far, Math.hypot(x + 0.5 - width / 2, y + 0.5 - height / 2));
          }
        }
      }
      return far;
    }, "data:image/png;base64," + png.toString("base64"));
  }

  // Left: the maskable icon with its safe-zone circle drawn on. Right: the
  // worst crop a launcher may apply, the safe-zone circle alone.
  async function safeZonePicture() {
    const icon = "data:image/svg+xml;base64," + Buffer.from(source).toString("base64");
    const panel = 256;
    const circle = panel * 0.8;
    await tab.setViewport({ width: panel * 2, height: panel, deviceScaleFactor: 1 });
    await tab.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      html, body { margin: 0; width: ${panel * 2}px; height: ${panel}px; overflow: hidden; background: #e5e7eb; }
      .row { display: flex; }
      .panel { position: relative; width: ${panel}px; height: ${panel}px; }
      .panel img { display: block; width: ${panel}px; height: ${panel}px; }
      .panel svg { position: absolute; inset: 0; }
      .crop { position: absolute; left: ${(panel - circle) / 2}px; top: ${(panel - circle) / 2}px; width: ${circle}px; height: ${circle}px; border-radius: 50%; overflow: hidden; }
      .crop img { position: absolute; left: ${-(panel - circle) / 2}px; top: ${-(panel - circle) / 2}px; }
    </style></head><body><div class="row">
      <div class="panel"><img src="${icon}" alt=""><svg viewBox="0 0 ${panel} ${panel}"><circle cx="${panel / 2}" cy="${panel / 2}" r="${circle / 2}" fill="none" stroke="#ff3d8b" stroke-width="2"/></svg></div>
      <div class="panel"><div class="crop"><img src="${icon}" alt=""></div></div>
    </div></body></html>`, { waitUntil: "load" });
    return Buffer.from(await tab.screenshot({ type: "png", clip: { x: 0, y: 0, width: panel * 2, height: panel } }));
  }

  for (const output of OUTPUTS) {
    const png = await render(output.size);
    if (output.file.includes("maskable")) {
      const reach = await monkeyReach(png);
      assert(reach < SAFE_ZONE_RADIUS, `The monkey reaches ${reach.toFixed(1)} units from the centre of the maskable icon; the safe zone is ${SAFE_ZONE_RADIUS.toFixed(1)}. Add padding for the maskable icon in render-icons.mjs.`);
      console.log(`maskable safe zone: monkey outline reaches ${reach.toFixed(1)} of ${SAFE_ZONE_RADIUS.toFixed(1)} units from the centre`);
    }
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
    const zoneFile = path.join(previewDir, "icon-maskable-safe-zone.png");
    await fs.writeFile(zoneFile, await safeZonePicture());
    console.log(`wrote ${path.relative(root, zoneFile)}`);
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
