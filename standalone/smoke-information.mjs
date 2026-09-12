import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const baseUrl = (process.env.GAHOOKZ_TEST_BASE_URL || "http://127.0.0.1:3199").replace(/\/$/, "");
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
assert(!appSource.includes('<a href="/information">Information, reports and roadmap</a>'));
assert(appSource.includes('How to play &amp; tutorials'));
assert(appSource.includes('mode="overview"'));

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
  const versions = [...source.matchAll(/["'(](?:\/|\.)[^"')\s]*\?v=([A-Za-z0-9._-]+)/g)].map((match) => match[1]);
  assert(versions.length > 0, `${name} has no versioned assets`);
  assert.deepEqual([...new Set(versions)], [assetVersion], `${name} contains mixed asset versions`);
}
assert(workerSource.includes(`const CACHE_NAME = "gahookz-shell-${assetVersion}"`));
assert(workerSource.includes(`"/client/information.js?v=${assetVersion}"`));
assert(workerSource.includes('caches.match("/index.html")'));

// The public hub carries the game guides only. A product roadmap, release
// gates, a monetisation model and server operating detail were written for
// whoever runs Gahookz, not for somebody who joined a room to play, and now
// live in docs/product/internal-reports.md.
const reportDeclaration = informationSource.slice(0, informationSource.indexOf("const REPORT_IDS"));
const reportIds = [...reportDeclaration.matchAll(/\{ id: "([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(reportIds, ["majority", "herd", "overview"], "the public hub should list player guides only");

// Those links still answer rather than 404, because breaking a bookmark is its
// own small rudeness.
for (const moved of ["roadmap", "launch", "business", "operations", "about"]) {
  assert(
    informationSource.includes(moved + ":"),
    `the moved report ${moved} should still resolve and explain where it went`
  );
}
assert(
  informationSource.includes("has moved."),
  "a moved report should say so rather than render nothing"
);

// The internal content must not still be sitting in the shipped bundle.
// Titles remain, because the moved notice names what moved. It is the *content*
// that must be gone.
// Specific phrases only. "P0" was in this list and is wrong: the mode guides
// use priority levels for their own design guardrails, which is player-facing.
for (const internalContent of ["loot boxes", "32 active rooms per process", "Required before broad promotion", "Steam host edition", "host subscription"]) {
  assert(
    !informationSource.includes(internalContent),
    `internal content is still in the public page: ${internalContent}`
  );
}

for (const expectedContent of [
  "Current game flow",
  "Rules at a glance",
  "Design guardrails",
  "Most votes",
  "Fastest choice",
  "Up to 1,000",
  "Author bonus",
  "Herd guide",
  "Share the writing load",
  "Up to 500",
  "Author points",
  "Gahookz overview"
]) {
  assert(informationSource.includes(expectedContent), `missing report content: ${expectedContent}`);
}
assert(informationSource.includes('window.history.pushState(null, "", "/information#" + reportId)'));
assert(informationSource.includes('document.getElementById("information-report-title")?.focus()'));
assert(informationSource.includes("function HerdReport()"));

const integration = await verifyRunningServer();

// Terms, privacy, community rules and a takedown route are launch gates rather
// than decoration, so they are checked here alongside the information hub.
const legalSource = await fs.readFile(path.join(publicDir, "client", "legal.jsx"), "utf8");
const builtLegalSource = await fs.readFile(path.join(publicDir, "client", "legal.js"), "utf8");
for (const documentId of ["rules", "terms", "privacy", "contact"]) {
  assert(legalSource.includes(`id: "${documentId}"`), `The legal hub is missing the ${documentId} document`);
}
assert(appSource.includes('href="/legal"'), "The welcome screen must link to the legal documents");
assert(serverSource.includes('pathname === "/legal"'), "The server must serve the app shell at /legal");
assert(buildSource.includes('transformFile("client/legal.jsx"'), "legal.jsx must be part of the browser build");
assert(builtLegalSource.length > 2000, "The built legal module looks empty");
assert(
  legalSource.includes("play without an account"),
  "The terms must state that playing does not require an account"
);
assert(
  legalSource.includes("not been reviewed by a lawyer"),
  "The legal documents must be honest that they are not professionally reviewed"
);

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
    "eight report destinations and Majority Rulz/Herd rules",
    integration.checked ? "/information and /information#majority HTTP navigation" : "HTTP checks skipped because the local server is not running"
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
    await verifyInformationNavigation("/information#majority");
    await verifyInformationNavigation("/legal");
    await verifyInformationNavigation("/legal#privacy");
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
