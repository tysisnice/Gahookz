import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const generatedFiles = new Set([
  "app.js",
  "release.json",
  "client/audio.runtime.js",
  "client/custom-gahook.js",
  "client/drawing.js",
  "client/information.js",
  "client/offline.js",
  "client/preferences.js",
  "client/presentation.js",
  "client/qr.js",
  "client/social.js",
  "client/tutorial.js"
]);
const assetVersion = await sourceAssetVersion();
const versioned = (value) => value + "?v=" + assetVersion;

async function sourceAssetVersion() {
  const hash = crypto.createHash("sha256");
  const files = await listFiles(publicDir);
  for (const absolutePath of files.sort()) {
    const relativePath = path.relative(publicDir, absolutePath).replaceAll("\\", "/");
    if (generatedFiles.has(relativePath)) continue;
    let contents = await fs.readFile(absolutePath);
    if (["index.html", "service-worker.js", "vendor-bootstrap.js"].includes(relativePath)) {
      contents = Buffer.from(contents.toString("utf8")
        .replace(/gahookz-shell-[A-Za-z0-9._-]+/g, "gahookz-shell-ASSET_VERSION")
        .replace(/\?v=[A-Za-z0-9._-]+/g, "?v=ASSET_VERSION"));
    }
    hash.update(relativePath);
    hash.update("\0");
    hash.update(contents);
    hash.update("\0");
  }
  return "release-" + hash.digest("hex").slice(0, 16);
}

async function listFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(absolutePath) : [absolutePath];
  }));
  return nested.flat();
}

async function writeTextIfChanged(absolutePath, source) {
  let current = null;
  try {
    current = await fs.readFile(absolutePath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (current !== source) await fs.writeFile(absolutePath, source, "utf8");
}

async function writeReleaseFiles() {
  const replaceVersions = (source) => source
    .replace(/gahookz-shell-[A-Za-z0-9._-]+/g, "gahookz-shell-" + assetVersion)
    .replace(/\?v=[A-Za-z0-9._-]+/g, "?v=" + assetVersion);

  const shellFiles = ["index.html", "service-worker.js", "vendor-bootstrap.js"];
  const shellSources = await Promise.all(shellFiles.map(async (fileName) => {
    const source = await fs.readFile(path.join(publicDir, fileName), "utf8");
    if (!source.trim()) throw new Error(`Required browser shell file is empty: ${fileName}`);
    return [fileName, replaceVersions(source)];
  }));

  await Promise.all([
    ...shellSources.map(([fileName, source]) => writeTextIfChanged(path.join(publicDir, fileName), source)),
    fs.writeFile(path.join(publicDir, "release.json"), JSON.stringify({
      version: assetVersion,
      builtAt: new Date().toISOString()
    }, null, 2) + "\n", "utf8")
  ]);
}

async function transformFile(input, output, loader, replacements = []) {
  let source = await fs.readFile(path.join(publicDir, input), "utf8");
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  const result = await esbuild.transform(source, {
    loader,
    format: "esm",
    target: "es2019",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    minify: true,
    legalComments: "none"
  });
  await fs.writeFile(path.join(publicDir, output), result.code, "utf8");
}

await Promise.all([
  transformFile("app.jsx", "app.js", "jsx", [
    ["./client/preferences.jsx", versioned("./client/preferences.js")],
    ["./client/offline.jsx", versioned("./client/offline.js")],
    ["./client/audio.js", versioned("./client/audio.runtime.js")],
    ["./client/gahook-forms.js", versioned("./client/gahook-forms.js")],
    ["./client/presentation.jsx", versioned("./client/presentation.js")],
    ["./client/tutorial.jsx", versioned("./client/tutorial.js")],
    ["./client/drawing.jsx", versioned("./client/drawing.js")],
    ["./client/social.jsx", versioned("./client/social.js")],
    ["./client/qr.jsx", versioned("./client/qr.js")],
    ["./client/custom-gahook.jsx", versioned("./client/custom-gahook.js")],
    ["./client/information.jsx", versioned("./client/information.js")]
  ]),
  transformFile("client/preferences.jsx", "client/preferences.js", "jsx"),
  transformFile("client/offline.jsx", "client/offline.js", "jsx", [
    ["./audio.js", versioned("./audio.runtime.js")],
    ["./gahook-forms.js", versioned("./gahook-forms.js")],
    ["./presentation.jsx", versioned("./presentation.js")]
  ]),
  transformFile("client/presentation.jsx", "client/presentation.js", "jsx", [
    ["./gahook-forms.js", versioned("./gahook-forms.js")]
  ]),
  transformFile("client/tutorial.jsx", "client/tutorial.js", "jsx"),
  transformFile("client/drawing.jsx", "client/drawing.js", "jsx"),
  transformFile("client/social.jsx", "client/social.js", "jsx"),
  transformFile("client/qr.jsx", "client/qr.js", "jsx"),
  transformFile("client/information.jsx", "client/information.js", "jsx"),
  transformFile("client/custom-gahook.jsx", "client/custom-gahook.js", "jsx", [
    ["./drawing.jsx", versioned("./drawing.js")]
  ]),
  transformFile("client/audio.js", "client/audio.runtime.js", "js", [
    ["./preferences.jsx", versioned("./preferences.js")],
    ["./gahook-forms.js", versioned("./gahook-forms.js")]
  ])
]);

await writeReleaseFiles();

console.log("Built standalone browser modules for " + assetVersion);
