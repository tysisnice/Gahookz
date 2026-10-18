import { spawn } from "node:child_process";
import { watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRestartPolicy, describeExit } from "./dev-supervisor.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneDir = path.join(rootDir, "standalone");
const publicDir = path.join(standaloneDir, "public");
const clientDir = path.join(publicDir, "client");
const serverModulesDir = path.join(standaloneDir, "server");
const serverPackageDirectories = [
  path.join(rootDir, "packages", "accounts", "src"),
  path.join(rootDir, "packages", "contracts", "src"),
  path.join(rootDir, "packages", "game-engine", "src")
];
const port = String(process.env.PORT || 3101);
const host = process.env.HOST || "127.0.0.1";
const buildSources = new Set([
  "app.jsx",
  "client/arena.jsx",
  "client/net.ts",
  "client/reveal.jsx",
  "client/host-presence.jsx",
  "client/audio.js",
  "client/music.ts",
  "client/music-composer.ts",
  "client/offline.jsx",
  "client/preferences.jsx",
  "client/presentation.jsx",
  "client/tutorial.jsx",
  "client/tutorial-art.jsx",
  "client/drawing.jsx",
  "client/social.jsx",
  "client/qr.jsx",
  "client/custom-gahook.jsx",
  "client/account.jsx",
  "client/information.jsx",
  "client/legal.jsx",
  "client/report.jsx",
  "client/controls.jsx",
  "client/history.jsx",
  "client/back-stack.ts",
  "client/number-wheel.jsx"
]);
const shellSources = new Set([
  "index.html",
  "manifest.webmanifest",
  "service-worker.js",
  "styles.css",
  "client/arena.css",
  "client/number-wheel.css",
  "client/reveal.css",
  "vendor-bootstrap.js",
  "client/gahook-forms.js"
]);

let serverProcess = null;
let buildTimer = null;
let reloadTimer = null;
let restartTimer = null;
let buildRunning = false;
let buildAgain = false;
let shuttingDown = false;
const watchers = [];
const restartPolicy = createRestartPolicy();

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: rootDir, stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(command + " exited with code " + code)));
  });
}

async function buildClient() {
  if (buildRunning) {
    buildAgain = true;
    return;
  }
  buildRunning = true;
  try {
    await run(process.execPath, [path.join(standaloneDir, "build-client.mjs")]);
    queueReload();
  } catch (error) {
    console.error("Client build failed:", error.message);
  } finally {
    buildRunning = false;
    if (buildAgain) {
      buildAgain = false;
      buildClient();
    }
  }
}

function startServer() {
  if (shuttingDown || serverProcess) return;
  const startedAt = Date.now();
  const child = spawn(process.execPath, ["--import", "tsx", path.join(standaloneDir, "server.js")], {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, HOST: host, PORT: port, GAHOOKZ_DEV_RELOAD: "1" }
  });
  serverProcess = child;
  child.on("exit", (code, signal) => {
    // A reload we asked for has already cleared `serverProcess` and arranged
    // its own relaunch, so this handler only ever sees an exit we did not
    // ask for. Every one of those gets a new server, whatever the exit code:
    // the server drains and exits *cleanly* when something stops it, and the
    // old "restart only on a non-zero code" rule therefore left the
    // development site dead with the container still reporting "Up".
    if (serverProcess !== child) return;
    serverProcess = null;
    if (shuttingDown) return;
    const reason = describeExit(code, signal);
    const decision = restartPolicy.exited({ upForMs: Date.now() - startedAt });
    if (decision.action === "give-up") {
      console.error(`Development server exited (${reason}) and would not stay up after ${decision.failures} attempts. Exiting so the container restart policy can replace this process.`);
      shuttingDown = true;
      watchers.forEach((watcher) => watcher.close());
      process.exit(1);
      return;
    }
    console.error(`Development server exited (${reason}). Restarting in ${decision.delayMs}ms (attempt ${decision.failures}).`);
    setTimeout(startServer, decision.delayMs);
  });
}

function queueBuild() {
  clearTimeout(buildTimer);
  buildTimer = setTimeout(buildClient, 90);
}

function queueReload() {
  clearTimeout(reloadTimer);
  const notify = async (attempt = 0) => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/__dev/reload`, { method: "POST" });
      if (!response.ok) throw new Error(String(response.status));
    } catch (_error) {
      if (!shuttingDown && attempt < 30) reloadTimer = setTimeout(() => notify(attempt + 1), 200);
    }
  };
  reloadTimer = setTimeout(() => notify(), 250);
}

function queueServerRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    const previous = serverProcess;
    serverProcess = null;
    if (previous && !previous.killed) {
      previous.once("exit", () => {
        if (!shuttingDown) setTimeout(() => { startServer(); queueReload(); }, 180);
      });
      previous.kill("SIGTERM");
      return;
    }
    startServer();
    queueReload();
  }, 100);
}

function watchDirectory(directory, prefix, handler) {
  const watcher = watch(directory, (eventType, fileName) => {
    if (!fileName) return;
    handler(path.posix.join(prefix, fileName.toString().replaceAll("\\", "/")), eventType);
  });
  watchers.push(watcher);
}

await buildClient();
startServer();

watchDirectory(publicDir, "", (fileName) => {
  if (buildSources.has(fileName)) queueBuild();
  else if (shellSources.has(fileName)) queueBuild();
});
watchDirectory(clientDir, "client", (fileName) => {
  if (buildSources.has(fileName)) queueBuild();
  else if (shellSources.has(fileName)) queueBuild();
});
watchDirectory(serverModulesDir, "server", (_fileName, eventType) => {
  if (eventType === "change" || eventType === "rename") queueServerRestart();
});
serverPackageDirectories.forEach((directory) => {
  watchDirectory(directory, path.relative(rootDir, directory), (_fileName, eventType) => {
    if (eventType === "change" || eventType === "rename") queueServerRestart();
  });
});
watchDirectory(standaloneDir, "standalone", (fileName) => {
  if (fileName === "standalone/server.js") queueServerRestart();
});

console.log(`Gahookz development mode: http://${host}:${port}/`);
console.log("Client rebuilds, server restarts, and browser reloads are automatic.");

function shutdown() {
  shuttingDown = true;
  watchers.forEach((watcher) => watcher.close());
  if (serverProcess && !serverProcess.killed) serverProcess.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
