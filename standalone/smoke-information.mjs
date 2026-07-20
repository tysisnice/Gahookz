import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const baseUrl = (process.env.GAHOOKZ_TEST_BASE_URL || "http://127.0.0.1:3102").replace(/\/$/, "");
const requireServer = process.env.GAHOOKZ_TEST_REQUIRE_SERVER === "1";

const [
  serverSource,
  buildSource,
  appSource,
  builtAppSource,
  informationSource,
  builtInformationSource,
  releaseSource,
  indexSource,
  bootstrapSource,
  workerSource
] = await Promise.all([
  fs.readFile(path.join(__dirname, "server.js"), "utf8"),
  fs.readFile(path.join(__dirname, "build-client.mjs"), "utf8"),
  fs.readFile(path.join(publicDir, "app.jsx"), "utf8"),
  fs.readFile(path.join(publicDir, "app.js"), "utf8"),
  fs.readFile(path.join(publicDir, "client", "information.jsx"), "utf8"),
  fs.readFile(path.join(publicDir, "client", "information.js"), "utf8"),
  fs.readFile(path.join(publicDir, "release.json"), "utf8"),
  fs.readFile(path.join(publicDir, "index.html"), "utf8"),
  fs.readFile(path.join(publicDir, "vendor-bootstrap.js"), "utf8"),
  fs.readFile(path.join(publicDir, "service-worker.js"), "utf8")
]);

// The Node server and client router must both recognize the public report URL.
assert(serverSource.includes('pathname === "/information"'));
assert(serverSource.includes('pathname === "/information/"'));
assert.match(appSource, /parts\[0\]\?\.toLowerCase\(\) === "information"/);
assert.match(appSource, /return \{ mode: "information", code: "" \}/);
assert.match(appSource, /mode === "information" \? <InformationHub \/>/);

// The static report must remain readable even when the live game API is offline.
assert.match(appSource, /serverConnection\.offline\s*&&\s*mode\s*!==\s*"information"/);
assert(appSource.includes('document.title = mode === "room"'));
assert(appSource.includes('mode === "information" ? "Gahookz Information"'));
assert(appSource.includes('<a href="/information">Information, reports and roadmap</a>'));

// Source and production builds must both include the InformationHub module.
assert.match(appSource, /import \{ InformationHub \} from "\.\/client\/information\.jsx"/);
assert.match(buildSource, /\["\.\/client\/information\.jsx",\s*versioned\("\.\/client\/information\.js"\)\]/);
assert.match(buildSource, /transformFile\("client\/information\.jsx",\s*"client\/information\.js",\s*"jsx"\)/);

const assetVersion = JSON.parse(releaseSource).version;
assert.match(assetVersion, /^release-[a-f0-9]{16}$/, "release.json must contain a content-derived release ID");
assert(buildSource.includes("const assetVersion = await sourceAssetVersion()"));
assert(buildSource.includes("writeReleaseFiles()"));
assert(builtAppSource.includes(`./client/information.js?v=${assetVersion}`));
assert(builtInformationSource.length > 1_000, "built information module looks incomplete");

// Keep every versioned shell reference on one release identifier so stale modules
// cannot be mixed with a newer report route.
for (const [name, source] of [
  ["index.html", indexSource],
  ["vendor-bootstrap.js", bootstrapSource],
  ["service-worker.js", workerSource],
  ["app.js", builtAppSource]
]) {
  const versions = [...source.matchAll(/\?v=([A-Za-z0-9._-]+)/g)].map((match) => match[1]);
  assert(versions.length > 0, `${name} has no versioned assets`);
  assert.deepEqual([...new Set(versions)], [assetVersion], `${name} contains mixed asset versions`);
}
assert(workerSource.includes(`const CACHE_NAME = "gahookz-shell-${assetVersion}"`));
assert(workerSource.includes(`"/client/information.js?v=${assetVersion}"`));
assert(workerSource.includes('caches.match("/index.html")'));

// The hub should expose all planned reports and retain the core Herd analysis.
const reportDeclaration = informationSource.slice(0, informationSource.indexOf("const REPORT_IDS"));
const reportIds = [...reportDeclaration.matchAll(/\{ id: "([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(reportIds, ["herd", "overview", "roadmap", "launch", "business", "operations", "about"]);

for (const expectedContent of [
  "Current game flow",
  "Why it is fun",
  "UI and clarity assessment",
  "Most important improvements",
  "Comparison with nearby games",
  "Where Herd fits in Gahookz",
  "Recommended target experience",
  "Gahookz overview",
  "Product roadmap",
  "Public launch checklist",
  "Fair monetisation",
  "Hosting and operations",
  "About these reports"
]) {
  assert(informationSource.includes(expectedContent), `missing report content: ${expectedContent}`);
}
assert(informationSource.includes('window.history.pushState(null, "", "/information#" + reportId)'));
assert(informationSource.includes('document.getElementById("information-report-title")?.focus()'));
assert(informationSource.includes("https://bigpotato.com/products/herd-mentality"));
assert(informationSource.includes("https://www.jackboxgames.com/games/fibbage-4"));

const integration = await verifyRunningServer();

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  assetVersion,
  server: integration,
  checked: [
    "/information server and client routing",
    "offline API bypass",
    "source-to-production information module build",
    "asset and service-worker version consistency",
    "seven report destinations and Herd analysis content",
    integration.checked ? "/information and /information#herd HTTP navigation" : "HTTP checks skipped because the local server is not running"
  ]
}, null, 2));

async function verifyRunningServer() {
  let serverAvailable = false;
  try {
    const healthResponse = await fetch(baseUrl + "/api/health", {
      cache: "no-store",
      signal: AbortSignal.timeout(1_500)
    });
    serverAvailable = true;
    assert.equal(healthResponse.status, 200, "running server health endpoint failed");
    assert.equal((await healthResponse.json()).ok, true, "running server reported unhealthy");

    await verifyInformationNavigation("/information");
    await verifyInformationNavigation("/information#herd");
    return { checked: true, status: "passed" };
  } catch (error) {
    if (serverAvailable || requireServer) throw error;
    return {
      checked: false,
      status: "skipped",
      reason: "No server responded at the configured base URL. Set GAHOOKZ_TEST_REQUIRE_SERVER=1 to require integration checks."
    };
  }
}

async function verifyInformationNavigation(relativeUrl) {
  const response = await fetch(baseUrl + relativeUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(2_500)
  });
  assert.equal(response.status, 200, `${relativeUrl} did not return 200`);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  const body = await response.text();
  assert(body.includes('<div id="root"></div>'), `${relativeUrl} did not serve the app shell`);
  assert(body.includes(`/vendor-bootstrap.js?v=${assetVersion}`), `${relativeUrl} served a stale app shell`);
}
