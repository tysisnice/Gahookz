import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const baseUrl = process.env.GAHOOKZ_TEST_BASE_URL || "http://127.0.0.1:3102";

const [indexSource, manifestSource, workerSource, bootstrapSource, appSource, builtAppSource, offlineSource, releaseSource, iconSource] = await Promise.all([
  fs.readFile(path.join(publicDir, "index.html"), "utf8"),
  fs.readFile(path.join(publicDir, "manifest.webmanifest"), "utf8"),
  fs.readFile(path.join(publicDir, "service-worker.js"), "utf8"),
  fs.readFile(path.join(publicDir, "vendor-bootstrap.js"), "utf8"),
  fs.readFile(path.join(publicDir, "app.jsx"), "utf8"),
  fs.readFile(path.join(publicDir, "app.js"), "utf8"),
  fs.readFile(path.join(publicDir, "client", "offline.jsx"), "utf8"),
  fs.readFile(path.join(publicDir, "release.json"), "utf8"),
  fs.readFile(path.join(publicDir, "icons", "gahookz-monkey.svg"), "utf8")
]);

const manifest = JSON.parse(manifestSource);
const release = JSON.parse(releaseSource);
assert.equal(manifest.name, "Gahookz");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "/");
assert.equal(manifest.scope, "/");
assert(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.type === "image/png"));
assert(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.type === "image/png"));
assert(manifest.icons.some((icon) => icon.purpose === "maskable"));
assert(indexSource.includes('rel="manifest"') && indexSource.includes('rel="apple-touch-icon"'));
assert(indexSource.includes('rel="icon" type="image/svg+xml" href="/icons/gahookz-monkey.svg"'));
assert(iconSource.includes('aria-label="Gahookz monkey"'));
assert(iconSource.includes('fill="#8a4f21"') && !iconSource.includes(">G<"));
assert(bootstrapSource.includes('serviceWorker.register("/service-worker.js"'));
assert(bootstrapSource.includes("beforeinstallprompt"));
assert.match(release.version, /^release-[a-f0-9]{16}$/);
assert(indexSource.includes("?v=" + release.version));
assert(bootstrapSource.includes("?v=" + release.version));
assert(workerSource.includes("gahookz-shell-" + release.version) && workerSource.includes("?v=" + release.version));
assert(builtAppSource.includes("?v=" + release.version));
assert(workerSource.includes('url.pathname.startsWith("/api/")') && workerSource.includes('url.pathname === "/events"'));
assert(workerSource.includes('caches.match("/index.html")'));
assert(/"\/client\/offline\.js\?v=[^"]+"/.test(workerSource));
assert(appSource.includes("useServerConnection") && appSource.includes("OfflineExperience"));
assert(appSource.includes("ServerUpdateExperience") && appSource.includes("serverConnection.protocolMismatch"));
assert(offlineSource.includes("Gahook Dash") && offlineSource.includes("Get back online"));
assert(offlineSource.includes("EXPECTED_SNAPSHOT_SCHEMA_VERSION = 1"));
assert(offlineSource.includes("The game server and this screen are on different releases."));
assert(offlineSource.includes("Gahook the dev IRL"));
assert(offlineSource.includes("Choose your runner") && offlineSource.includes("GAHOOK_FORMS.map"));
assert(offlineSource.includes("onPointerUp={releaseJump}") && offlineSource.includes("jumpHoldMs < 180"));
assert(offlineSource.includes("Congratulations Bird") && offlineSource.includes("drawFlyingChicken"));
assert(offlineSource.includes("PokeJumpScare") && offlineSource.includes("playGahookFormSound"));
assert(offlineSource.includes("chooseDashObstacleForm") && offlineSource.includes("createDashObstacleSequence"));
assert(
  offlineSource.includes("offline: false") && offlineSource.includes("recovered: previous.offline") && !offlineSource.includes("previous.offline ?\n            { offline: true"),
  "A successful health check must automatically restore the live room instead of trapping players behind the offline game."
);
assert(
  offlineSource.includes("if (checkInFlight) return;") &&
    offlineSource.indexOf("if (checkInFlight) return;") < offlineSource.indexOf('requestController = "AbortController"'),
  "Concurrent health checks must share the in-flight request instead of aborting one another and falsely switching the app offline."
);
assert(
  offlineSource.includes("active = false;\n      requestController?.abort();"),
  "Unmounting the connection hook must still cancel its active health request."
);
assert(
  offlineSource.includes("consecutiveHealthFailures >= 2"),
  "One delayed health request must not replace a live game with the offline experience."
);

await Promise.all([
  verifyPng("gahookz-180.png", 180),
  verifyPng("gahookz-192.png", 192),
  verifyPng("gahookz-512.png", 512),
  verifyPng("gahookz-maskable-512.png", 512)
]);

const healthResponse = await fetch(baseUrl + "/api/health", { cache: "no-store" });
assert.equal(healthResponse.status, 200);
assert.equal((await healthResponse.json()).ok, true);
const manifestResponse = await fetch(baseUrl + "/manifest.webmanifest", { cache: "no-store" });
assert.equal(manifestResponse.status, 200);
assert.match(manifestResponse.headers.get("content-type") || "", /application\/manifest\+json/);
const workerResponse = await fetch(baseUrl + "/service-worker.js", { cache: "no-store" });
assert.equal(workerResponse.status, 200);

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  checked: [
    "installable manifest and app icons",
    "service worker registration and shell cache",
    "content-hashed release consistency",
    "network-only APIs and event stream",
    "offline navigation fallback",
    "server/client protocol mismatch recovery",
    "Gahook Dash and recovery handoff",
    "health and manifest endpoints"
  ]
}, null, 2));

async function verifyPng(fileName, expectedSize) {
  const bytes = await fs.readFile(path.join(publicDir, "icons", fileName));
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(bytes.readUInt32BE(16), expectedSize);
  assert.equal(bytes.readUInt32BE(20), expectedSize);
}
