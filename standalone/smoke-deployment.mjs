import fs from "node:fs/promises";
import { isExecutableSmokeFile, selectProductionPortDefaults } from "./smoke-policy.mjs";

const [dockerfile, dockerignore, compose, nginx, envExample, deployScript, devServer, server, packageSource] = await Promise.all([
  fs.readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
  fs.readFile(new URL("../.dockerignore", import.meta.url), "utf8"),
  fs.readFile(new URL("../compose.yaml", import.meta.url), "utf8"),
  fs.readFile(new URL("../deploy/nginx/gahookz.conf.example", import.meta.url), "utf8"),
  fs.readFile(new URL("../.env.example", import.meta.url), "utf8"),
  fs.readFile(new URL("../scripts/docker-deploy.sh", import.meta.url), "utf8"),
  fs.readFile(new URL("./dev.mjs", import.meta.url), "utf8"),
  fs.readFile(new URL("./server.js", import.meta.url), "utf8"),
  fs.readFile(new URL("../package.json", import.meta.url), "utf8")
]);

// The stateful smoke suite writes rooms into whatever server it is pointed at.
// On the live host port 3102 is production, so a default of 3102 meant an
// unconfigured `npm test` ran the suite against real players' games. 3199 is
// the disposable port used by CI and the runbook; nothing listens on it by
// default, so a misconfigured run fails fast instead of hitting production.
const smokeSources = await Promise.all(
  (await fs.readdir(new URL("./", import.meta.url)))
    .filter((name) => isExecutableSmokeFile(name))
    .map(async (name) => [name, await fs.readFile(new URL("./" + name, import.meta.url), "utf8")])
);
const productionTargets = selectProductionPortDefaults(smokeSources);

const checks = [
  [dockerfile.includes("FROM node:24-alpine"), "Docker image must use the tested Node 24 runtime."],
  [dockerfile.includes("AS development") && dockerfile.includes('CMD ["npm", "run", "dev"]'), "Docker image must provide the development watcher target."],
  [dockerfile.includes("AS browser-build") && dockerfile.includes("RUN node standalone/build-client.mjs"), "Docker image must compile the current browser source."],
  [dockerfile.includes("COPY --from=browser-build"), "Runtime image must use the newly compiled browser assets."],
  [!dockerignore.split(/\r?\n/).includes("standalone/build-client.mjs"), "Docker context must include the browser build script."],
  [!dockerignore.split(/\r?\n/).includes("standalone/dev.mjs"), "Docker context must include the development watcher."],
  [dockerfile.includes("USER node"), "Container must run as a non-root user."],
  [dockerfile.includes("AS production-dependencies") && dockerfile.includes("npm ci --omit=dev"), "Production account dependencies must be installed without development tooling."],
  [dockerfile.includes("COPY --chown=node:node infra/postgres ./infra/postgres"), "Production image must include the PostgreSQL account migration."],
  [dockerfile.includes("HEALTHCHECK"), "Container must define a health check."],
  [compose.includes("${GAHOOKZ_BIND_ADDRESS:-127.0.0.1}:${GAHOOKZ_DEV_PORT:-3101}:3001"), "Development must default to loopback port 3101."],
  [compose.includes("${GAHOOKZ_BIND_ADDRESS:-127.0.0.1}:${GAHOOKZ_PROD_PORT:-3102}:3001"), "Production must default to loopback port 3102."],
  [compose.includes("./standalone:/app/standalone:z"), "Development must bind-mount the live application source."],
  [compose.includes("./packages:/app/packages:ro,z"), "Development must bind-mount typed server packages so browser and server releases cannot drift."],
  [devServer.includes("serverPackageDirectories") && devServer.includes("queueServerRestart()"), "Development must restart when a typed server package changes."],
  [devServer.includes('previous.once("exit"') && devServer.includes("attempt < 30"), "Development restart/reload must wait for the old server and retry the browser notification."],
  [compose.includes("read_only: true"), "Container filesystem must be read-only."],
  [compose.includes("no-new-privileges:true") && compose.includes("cap_drop:"), "Container hardening is incomplete."],
  [compose.includes("mem_limit:") && compose.includes("pids_limit:"), "Container resource limits are missing."],
  [nginx.includes("proxy_buffering off;"), "Nginx must not buffer live SSE responses."],
  [nginx.includes("proxy_read_timeout 1h;"), "Nginx live connection timeout is too short."],
  [nginx.includes("client_max_body_size 10m;"), "Nginx must allow bounded image/audio request bodies."],
  [envExample.includes("GAHOOKZ_BIND_ADDRESS=127.0.0.1"), "Environment example must use a private bind address."],
  [envExample.includes("GAHOOKZ_DEV_PORT=3101") && envExample.includes("GAHOOKZ_PROD_PORT=3102"), "Environment example must document both host ports."],
  [envExample.includes("GAHOOKZ_PUBLIC_ORIGIN=https://") && envExample.includes("GOOGLE_CLIENT_ID=") && envExample.includes("GAHOOKZ_DATABASE_URL="), "Environment example must document account and Google OIDC configuration."],
  [compose.includes('GAHOOKZ_TRUST_PROXY: "${GAHOOKZ_TRUST_PROXY:-1}"') && compose.includes('GAHOOKZ_HTTPS: "${GAHOOKZ_HTTPS:-1}"'), "Production must enable proxy-aware HTTPS protections explicitly."],
  [deployScript.includes("docker compose config --quiet"), "Deployment must validate Compose before starting."],
  [deployScript.includes("standalone/public/app.jsx") && deployScript.includes("standalone/build-client.mjs"), "Deployment must verify the browser source used by the in-image build."],
  [deployScript.includes("docker compose build --pull gahookz"), "Deployment must explicitly build the current source."],
  [deployScript.includes("--force-recreate"), "Deployment must recreate the container from the current image."],
  [deployScript.includes("running_image") && deployScript.includes("expected_image"), "Deployment must verify the running image."],
  [deployScript.includes('health" == "healthy"'), "Deployment must wait for container health."],
  [server.includes('server.listen(PORT, HOST'), "Server must honor the container bind host."],
  [server.includes('process.once("SIGTERM"'), "Server must handle Docker shutdown."],
  [server.includes('url.pathname === "/api/health"'), "Server health endpoint is missing."],
  [productionTargets.length === 0, "Smoke tests must not default to the production port 3102: " + productionTargets.join(", ")],
  [server.includes("release: releaseInfo.version"), "Server health must identify the running release."]
];

for (const [ok, message] of checks) {
  if (!ok) throw new Error(message);
}

const packageJson = JSON.parse(packageSource);
if (packageJson.scripts["deploy:docker"] !== "bash scripts/docker-deploy.sh") {
  throw new Error("package.json does not point to the Docker deployment script.");
}
if (!packageJson.dependencies?.tsx || !packageJson.scripts.start.includes("--import tsx") || !packageJson.scripts["test:unit"].includes("--import tsx") || !packageJson.scripts["test:simulation"].includes("--import tsx")) {
  throw new Error("Local start, unit tests, and simulations must load incremental TypeScript on every supported Node version.");
}
if (packageJson.engines?.node !== ">=20.0.0") {
  throw new Error("The declared Node range must match the Node 20-compatible TypeScript runtime.");
}

console.log(JSON.stringify({
  ok: true,
  checked: [
    "non-root read-only Node container",
    "loopback-only development and production ports with resource limits",
    "SSE-safe Nginx proxy",
    "health-gated, release-verified deployment",
    "in-image browser build from current JSX source",
    "graceful server shutdown"
  ]
}, null, 2));
