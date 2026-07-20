import { spawn } from "node:child_process";
import { watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneDir = path.join(rootDir, "standalone");
const publicDir = path.join(standaloneDir, "public");
const clientDir = path.join(publicDir, "client");
const serverModulesDir = path.join(standaloneDir, "server");
const port = String(process.env.PORT || 3101);
const host = process.env.HOST || "127.0.0.1";
const buildSources = new Set([
  "app.jsx",
  "client/audio.js",
  "client/offline.jsx",
  "client/preferences.jsx",
  "client/presentation.jsx",
  "client/tutorial.jsx",
  "client/drawing.jsx",
  "client/social.jsx",
  "client/qr.jsx",
  "client/custom-gahook.jsx",
  "client/information.jsx"
]);
const shellSources = new Set([
  "index.html",
  "manifest.webmanifest",
  "service-worker.js",
  "styles.css",
  "vendor-bootstrap.js",
  "client/gahook-forms.js"
]);

let serverProcess = null;
let buildTimer = null;
let reloadTimer = null;
let restartTimer = null;
let buildRunning = false;
let buildAgain = false;
const watchers = [];

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
  serverProcess = spawn(process.execPath, [path.join(standaloneDir, "server.js")], {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, HOST: host, PORT: port, GAHOOKZ_DEV_RELOAD: "1" }
  });
  serverProcess.on("exit", (code, signal) => {
    if (serverProcess && code !== 0 && signal !== "SIGTERM") {
      console.error("Development server stopped unexpectedly. Restarting...");
      setTimeout(startServer, 500);
    }
  });
}

function queueBuild() {
  clearTimeout(buildTimer);
  buildTimer = setTimeout(buildClient, 90);
}

function queueReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => {
    try {
      await fetch(`http://127.0.0.1:${port}/__dev/reload`, { method: "POST" });
    } catch (_error) {}
  }, 100);
}

function queueServerRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    const previous = serverProcess;
    serverProcess = null;
    if (previous && !previous.killed) previous.kill("SIGTERM");
    setTimeout(startServer, 180);
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
watchDirectory(standaloneDir, "standalone", (fileName) => {
  if (fileName === "standalone/server.js") queueServerRestart();
});

console.log(`Gahookz development mode: http://${host}:${port}/`);
console.log("Client rebuilds, server restarts, and browser reloads are automatic.");

function shutdown() {
  watchers.forEach((watcher) => watcher.close());
  if (serverProcess && !serverProcess.killed) serverProcess.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
