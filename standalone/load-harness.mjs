// A load harness for the one thing Gahookz has never measured: what happens
// when a full room of people Gahook each other at once.
//
// Everything here is a *client*. It speaks the same HTTP + SSE protocol a
// browser does, over its own keep-alive sockets, and it deliberately does not
// import the server. That is the point: the numbers it reports are the numbers
// a player's phone would see, not an optimistic in-process estimate.
//
// Two measurements matter more than the rest.
//
//   * Fan-out latency -- the time from a player pressing Gahook to every other
//     player's live stream carrying it. That is what "lag" means to Tyson.
//   * Health-probe latency -- an idle request issued every 100ms throughout the
//     run. When the event loop is saturated this is the first thing to suffer,
//     and it is the honest measure of whether the process is keeping up.
//
// Never point this at production or beta. It creates and mutates real rooms.
import fs from "node:fs";
import http from "node:http";
import { execFileSync } from "node:child_process";

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const POKE_ID = /"latestPokeId":"([^"]*)"/g;

export function roomCode() {
  let value = "";
  while (value.length < 4) value += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  return value;
}

export function percentile(sortedValues, p) {
  if (!sortedValues.length) return null;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1));
  return sortedValues[index];
}

export function summarise(values) {
  if (!values.length) return { count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    min: round(sorted[0]),
    mean: round(total / sorted.length),
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    max: round(sorted[sorted.length - 1])
  };
}

function round(value) {
  return value === null || value === undefined ? null : Math.round(value * 100) / 100;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Watching the server process from the outside
// ---------------------------------------------------------------------------

// The disposable wrapper does not hand out a metrics token, and asking for one
// would mean editing another agent's file. /proc is better evidence anyway: it
// is the kernel's own accounting of the process, not the process's opinion of
// itself.
export function findListenerPid(port) {
  try {
    const output = execFileSync("ss", ["-lptnH", "sport = :" + port], { encoding: "utf8" });
    const match = output.match(/pid=(\d+)/);
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
}

const CLOCK_TICKS_PER_SECOND = 100;

function readFileOrNull(path) {
  try {
    return fs.readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function readProc(pid) {
  const stat = readFileOrNull("/proc/" + pid + "/stat");
  if (!stat) return null;
  // The comm field may contain spaces and brackets, so split after the last ')'.
  const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
  const utime = Number(fields[11]);
  const stime = Number(fields[12]);
  const status = readFileOrNull("/proc/" + pid + "/status") || "";
  const rssMatch = status.match(/VmRSS:\s+(\d+) kB/);
  return {
    cpuSeconds: (utime + stime) / CLOCK_TICKS_PER_SECOND,
    rssBytes: rssMatch ? Number(rssMatch[1]) * 1024 : 0,
    threads: Number((status.match(/Threads:\s+(\d+)/) || [])[1] || 0)
  };
}

export class ProcessSampler {
  constructor(pid, intervalMs = 250) {
    this.pid = pid;
    this.intervalMs = intervalMs;
    this.samples = [];
    this.timer = null;
    this.first = null;
    this.last = null;
  }

  start() {
    if (!this.pid) return this;
    this.first = readProc(this.pid);
    this.lastSampleAt = Date.now();
    this.lastCpu = this.first ? this.first.cpuSeconds : 0;
    this.timer = setInterval(() => {
      const now = Date.now();
      const sample = readProc(this.pid);
      if (!sample) return;
      const elapsed = (now - this.lastSampleAt) / 1000;
      const cpuPercent = elapsed > 0 ? ((sample.cpuSeconds - this.lastCpu) / elapsed) * 100 : 0;
      this.samples.push({ at: now, cpuPercent, rssBytes: sample.rssBytes });
      this.lastSampleAt = now;
      this.lastCpu = sample.cpuSeconds;
      this.last = sample;
    }, this.intervalMs);
    this.timer.unref();
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.last = readProc(this.pid) || this.last;
    return this.report();
  }

  report() {
    if (!this.pid || !this.samples.length) return { available: false, pid: this.pid };
    const cpu = this.samples.map((sample) => sample.cpuPercent);
    const rss = this.samples.map((sample) => sample.rssBytes);
    return {
      available: true,
      pid: this.pid,
      samples: this.samples.length,
      cpuPercentOfOneCore: summarise(cpu),
      cpuSecondsUsed: this.first && this.last ? round(this.last.cpuSeconds - this.first.cpuSeconds) : null,
      rssBytes: { start: this.first?.rssBytes || 0, peak: Math.max(...rss), end: this.last?.rssBytes || 0 },
      rssMbPeak: round(Math.max(...rss) / 1024 / 1024),
      threads: this.last?.threads || 0
    };
  }
}

// ---------------------------------------------------------------------------
// A virtual player: its own source address, its own sockets, its own SSE stream
// ---------------------------------------------------------------------------

export class VirtualClient {
  constructor({ baseUrl, name, playerKey, localAddress }) {
    const url = new URL(baseUrl);
    this.host = url.hostname;
    this.port = Number(url.port || 80);
    this.name = name;
    this.playerKey = playerKey;
    this.localAddress = localAddress;
    this.agent = new http.Agent({ keepAlive: true, maxSockets: 2, localAddress });
    this.streamAgent = new http.Agent({ keepAlive: true, maxSockets: 1, localAddress });
    this.playerId = "";
    this.frames = 0;
    this.heartbeats = 0;
    this.bytes = 0;
    this.streamErrors = [];
    this.streamEnded = false;
    this.streamStatus = 0;
    this.seenPoke = new Map();
    this.latestSnapshot = null;
    this.frameGaps = [];
    this.lastFrameAt = 0;
  }

  post(path, body) {
    return this.send("POST", path, body, this.agent);
  }

  send(method, path, body, agent) {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const startedAt = process.hrtime.bigint();
    return new Promise((resolve) => {
      const request = http.request({
        host: this.host,
        port: this.port,
        path,
        method,
        agent,
        localAddress: this.localAddress,
        headers: payload ? { "content-type": "application/json", "content-length": payload.length } : {}
      }, (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
          let data = null;
          try {
            data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            data = null;
          }
          resolve({ status: response.statusCode, data, latencyMs });
        });
      });
      request.on("error", (error) => {
        const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        resolve({ status: 0, data: null, latencyMs, error: String(error.message || error) });
      });
      if (payload) request.write(payload);
      request.end();
    });
  }

  openStream(code, ticket) {
    return new Promise((resolve, reject) => {
      const request = http.request({
        host: this.host,
        port: this.port,
        path: "/events?ticket=" + encodeURIComponent(ticket) + "&room=" + encodeURIComponent(code),
        method: "GET",
        agent: this.streamAgent,
        localAddress: this.localAddress,
        headers: { accept: "text/event-stream" }
      }, (response) => {
        this.streamStatus = response.statusCode;
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(this.name + " stream rejected with " + response.statusCode));
          return;
        }
        this.response = response;
        response.setEncoding("utf8");
        let buffer = "";
        response.on("data", (chunk) => {
          this.bytes += Buffer.byteLength(chunk, "utf8");
          buffer += chunk;
          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            this.consumeEvent(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf("\n\n");
          }
        });
        response.on("end", () => { this.streamEnded = true; });
        response.on("error", (error) => { this.streamErrors.push(String(error.message || error)); });
        resolve(response);
      });
      request.on("error", reject);
      this.request = request;
      request.end();
    });
  }

  // Deliberately NOT JSON.parse. The harness shares two cores with the server
  // it is measuring, and parsing 25,000 forty-kilobyte snapshots costs more CPU
  // than the server spends producing them -- which would quietly charge the
  // server for the harness's own cost. A scan for the one field this test needs
  // is roughly an order of magnitude cheaper and measures the same thing.
  consumeEvent(raw) {
    const now = Date.now();
    if (raw.startsWith("event: heartbeat")) {
      this.heartbeats += 1;
      return;
    }
    if (!raw.startsWith("event: state")) return;
    this.frames += 1;
    if (this.lastFrameAt) this.frameGaps.push(now - this.lastFrameAt);
    this.lastFrameAt = now;
    POKE_ID.lastIndex = 0;
    let match = POKE_ID.exec(raw);
    while (match) {
      if (match[1] && !this.seenPoke.has(match[1])) this.seenPoke.set(match[1], now);
      match = POKE_ID.exec(raw);
    }
  }

  closeStream() {
    try { this.request?.destroy(); } catch { /* already gone */ }
    try { this.response?.destroy(); } catch { /* already gone */ }
    this.agent.destroy();
    this.streamAgent.destroy();
  }
}

// A steady, low-cost observer. If the event loop stalls, this is where it shows.
export class HealthProbe {
  constructor(baseUrl, intervalMs = 100) {
    const url = new URL(baseUrl);
    this.host = url.hostname;
    this.port = Number(url.port || 80);
    this.intervalMs = intervalMs;
    this.agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    this.latencies = [];
    this.failures = 0;
    this.running = false;
  }

  start() {
    this.running = true;
    const tick = async () => {
      while (this.running) {
        const startedAt = process.hrtime.bigint();
        const ok = await new Promise((resolve) => {
          const request = http.request({ host: this.host, port: this.port, path: "/api/health", agent: this.agent }, (response) => {
            response.resume();
            response.on("end", () => resolve(response.statusCode === 200));
          });
          request.on("error", () => resolve(false));
          request.end();
        });
        const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        if (ok) this.latencies.push(latencyMs); else this.failures += 1;
        await sleep(this.intervalMs);
      }
    };
    this.loop = tick();
    return this;
  }

  async stop() {
    this.running = false;
    await this.loop;
    this.agent.destroy();
    return { latencyMs: summarise(this.latencies), failures: this.failures };
  }
}
