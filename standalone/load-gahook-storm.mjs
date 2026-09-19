// Stage 1 of the hosting investigation: the Gahook storm.
//
//   npm run test:disposable -- node standalone/load-gahook-storm.mjs --players 15
//
// One room, N players, every one of them Gahooking a random other player at a
// fixed rate. This is the exact scenario the owner named, and it is the worst
// case the current design has: every Gahook calls broadcastState(room,
// { immediate: true }), which builds and serialises one snapshot per connected
// client with no coalescing at all.
//
// Refuses to run against anything but a loopback address. It creates and
// mutates real rooms, so pointing it at gahookz.com would end real games.
import fs from "node:fs";
import path from "node:path";
import { HealthProbe, ProcessSampler, VirtualClient, findListenerPid, roomCode, sleep, summarise } from "./load-harness.mjs";

const BASE_URL = process.env.GAHOOKZ_TEST_BASE_URL || process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";

export function parseOptions(argv) {
  const options = {
    players: 15,
    rooms: 1,
    durationSeconds: 20,
    pokesPerPlayerPerSecond: 4,
    sharedIp: false,
    label: "",
    out: "",
    warmupSeconds: 3
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--players") { options.players = Number(value); index += 1; }
    else if (flag === "--rooms") { options.rooms = Number(value); index += 1; }
    else if (flag === "--duration") { options.durationSeconds = Number(value); index += 1; }
    else if (flag === "--rate") { options.pokesPerPlayerPerSecond = Number(value); index += 1; }
    else if (flag === "--label") { options.label = String(value); index += 1; }
    else if (flag === "--out") { options.out = String(value); index += 1; }
    else if (flag === "--shared-ip") { options.sharedIp = true; }
    else if (flag === "--help") { options.help = true; }
  }
  return options;
}

function assertLoopback(baseUrl) {
  const host = new URL(baseUrl).hostname;
  if (!/^127\./.test(host) && host !== "localhost" && host !== "::1") {
    throw new Error("Refusing to load-test a non-loopback host: " + host);
  }
}

// Each virtual player gets its own loopback source address, so the server sees
// fifteen distinct clients the way it would if they were on fifteen phones.
// --shared-ip collapses them onto one address instead, which is what actually
// happens when a party plays together on one home connection behind NAT.
function sourceAddress(index, sharedIp) {
  if (sharedIp) return "127.0.0.1";
  return "127.0.0." + (2 + (index % 250));
}

export async function runStorm(options) {
  assertLoopback(BASE_URL);
  const startedAt = new Date();
  const pid = findListenerPid(new URL(BASE_URL).port || 80);
  const runs = [];

  const rooms = [];
  let addressCursor = 0;
  for (let roomIndex = 0; roomIndex < options.rooms; roomIndex += 1) {
    const code = roomCode();
    const host = new VirtualClient({
      baseUrl: BASE_URL,
      name: "Host " + (roomIndex + 1),
      playerKey: "load-host-" + roomIndex + "-" + Date.now() + "-" + Math.random().toString(36).slice(2),
      localAddress: sourceAddress(addressCursor++, options.sharedIp)
    });
    const created = await host.post("/api/room", { code, playerKey: host.playerKey });
    if (!created.data?.ok) throw new Error("Could not create room " + code + ": " + JSON.stringify(created.data));
    const players = [];
    for (let playerIndex = 0; playerIndex < options.players; playerIndex += 1) {
      const client = new VirtualClient({
        baseUrl: BASE_URL,
        name: "P" + (roomIndex + 1) + "-" + (playerIndex + 1),
        playerKey: "load-player-" + roomIndex + "-" + playerIndex + "-" + Date.now() + "-" + Math.random().toString(36).slice(2),
        localAddress: sourceAddress(addressCursor++, options.sharedIp)
      });
      const joined = await client.post("/api/player/join", {
        code: created.data.code,
        playerKey: client.playerKey,
        name: client.name,
        avatarId: "panda"
      });
      if (!joined.data?.ok) throw new Error("Join failed for " + client.name + ": " + JSON.stringify(joined.data));
      client.playerId = joined.data.player.id;
      players.push(client);
    }
    rooms.push({ code: created.data.code, host, players });
  }

  // Live streams last, so joining is not competing with fan-out for the loop.
  const streamFailures = [];
  for (const room of rooms) {
    for (const client of [room.host, ...room.players]) {
      const ticket = await client.post("/api/events/ticket", { code: room.code, playerKey: client.playerKey, role: client === room.host ? "host" : "player" });
      if (!ticket.data?.ok) {
        streamFailures.push(client.name + ": ticket " + ticket.status + " " + JSON.stringify(ticket.data));
        continue;
      }
      try {
        await client.openStream(room.code, ticket.data.ticket);
      } catch (error) {
        streamFailures.push(client.name + ": " + String(error.message || error));
      }
    }
  }

  // Let every stream deliver its first snapshot and the room settle.
  await sleep(1200);

  const sampler = new ProcessSampler(pid, 250).start();
  const harnessSampler = new ProcessSampler(process.pid, 250).start();
  const probe = new HealthProbe(BASE_URL, 100).start();
  await sleep(options.warmupSeconds * 1000);
  const idleReport = sampler.report();
  const idleProbe = summarise(probe.latencies.slice());

  const pokeLatencies = [];
  const pokeStarts = new Map();
  const outcomes = { sent: 0, ok: 0, rejected: 0, rateLimited: 0, transportErrors: 0 };
  const rejectionReasons = new Map();
  const stormStartedAt = Date.now();
  const stormEndsAt = stormStartedAt + options.durationSeconds * 1000;
  const intervalMs = 1000 / options.pokesPerPlayerPerSecond;

  async function stormOnePlayer(room, sender) {
    while (Date.now() < stormEndsAt) {
      const candidates = room.players.filter((player) => player !== sender);
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      const targetId = target.playerId;
      if (!targetId) { await sleep(intervalMs); continue; }
      const sentAt = Date.now();
      outcomes.sent += 1;
      const result = await sender.post("/api/player/poke", { code: room.code, playerKey: sender.playerKey, playerId: targetId });
      pokeLatencies.push(result.latencyMs);
      if (result.status === 0) {
        outcomes.transportErrors += 1;
      } else if (result.status === 429) {
        outcomes.rateLimited += 1;
      } else if (result.data?.ok) {
        outcomes.ok += 1;
        pokeStarts.set(result.data.pokeId, sentAt);
      } else {
        outcomes.rejected += 1;
        const reason = String(result.data?.error || result.status);
        rejectionReasons.set(reason, (rejectionReasons.get(reason) || 0) + 1);
      }
      // Jitter keeps fifteen clients from locking into one artificial lockstep
      // while preserving the requested aggregate rate.
      const wait = intervalMs * (0.8 + Math.random() * 0.4) - (Date.now() - sentAt);
      if (wait > 0) await sleep(wait);
    }
  }

  await Promise.all(rooms.flatMap((room) => room.players.map((sender) => stormOnePlayer(room, sender))));
  const stormWallMs = Date.now() - stormStartedAt;

  // Give the last broadcasts a moment to land before measuring fan-out.
  await sleep(1500);
  const stormReport = sampler.stop();
  const harnessReport = harnessSampler.stop();
  const probeReport = await probe.stop();

  // Fan-out: how long after the sender pressed Gahook did each *other* live
  // stream carry it. Pokes that never arrive were coalesced away by a newer
  // Gahook on the same target before the socket could be written.
  const fanoutLatencies = [];
  let observationsExpected = 0;
  let observationsSeen = 0;
  for (const room of rooms) {
    const observers = [room.host, ...room.players];
    for (const [pokeId, sentAt] of pokeStarts) {
      for (const observer of observers) {
        observationsExpected += 1;
        const seenAt = observer.seenPoke.get(pokeId);
        if (seenAt === undefined) continue;
        observationsSeen += 1;
        fanoutLatencies.push(Math.max(0, seenAt - sentAt));
      }
    }
  }

  const clientReports = [];
  for (const room of rooms) {
    for (const client of [room.host, ...room.players]) {
      clientReports.push({
        name: client.name,
        frames: client.frames,
        heartbeats: client.heartbeats,
        bytes: client.bytes,
        streamStatus: client.streamStatus,
        streamEnded: client.streamEnded,
        errors: client.streamErrors
      });
    }
  }

  const healthAfter = await rooms[0].host.post("/api/state", { code: rooms[0].code, playerKey: rooms[0].host.playerKey, role: "host" });

  for (const room of rooms) {
    for (const client of [room.host, ...room.players]) client.closeStream();
  }

  const totalFrames = clientReports.reduce((sum, report) => sum + report.frames, 0);
  const totalBytes = clientReports.reduce((sum, report) => sum + report.bytes, 0);

  const report = {
    label: options.label || (options.rooms + "x" + options.players + (options.sharedIp ? " shared-ip" : "")),
    startedAt: startedAt.toISOString(),
    options,
    baseUrl: BASE_URL,
    serverPid: pid,
    rooms: rooms.map((room) => room.code),
    streamFailures,
    idle: { cpu: idleReport.cpuPercentOfOneCore, rssMbPeak: idleReport.rssMbPeak, healthLatencyMs: idleProbe },
    storm: {
      wallSeconds: Math.round(stormWallMs / 10) / 100,
      pokes: outcomes,
      pokesPerSecondAchieved: Math.round((outcomes.sent / (stormWallMs / 1000)) * 100) / 100,
      rejectionReasons: Object.fromEntries(rejectionReasons),
      pokeRequestLatencyMs: summarise(pokeLatencies),
      fanoutLatencyMs: summarise(fanoutLatencies),
      fanoutCoveragePercent: observationsExpected ? Math.round((observationsSeen / observationsExpected) * 10000) / 100 : null,
      stateFramesDelivered: totalFrames,
      stateBytesDelivered: totalBytes,
      meanFrameBytes: totalFrames ? Math.round(totalBytes / totalFrames) : 0,
      broadcastAmplification: outcomes.ok ? Math.round((totalFrames / outcomes.ok) * 100) / 100 : null
    },
    server: stormReport,
    harness: harnessReport,
    healthProbe: probeReport,
    survived: Boolean(healthAfter.data?.code),
    clients: clientReports
  };

  runs.push(report);
  return report;
}

export function formatReport(report) {
  const lines = [];
  const s = report.storm;
  lines.push("== " + report.label + " ==");
  lines.push("  rooms=" + report.rooms.length + " players/room=" + report.options.players +
    " rate=" + report.options.pokesPerPlayerPerSecond + "/s duration=" + s.wallSeconds + "s" +
    (report.options.sharedIp ? " [all on one source IP]" : " [one source IP per player]"));
  lines.push("  Gahooks: sent=" + s.pokes.sent + " ok=" + s.pokes.ok + " rejected=" + s.pokes.rejected +
    " rate-limited=" + s.pokes.rateLimited + " transport-errors=" + s.pokes.transportErrors +
    " (" + s.pokesPerSecondAchieved + "/s)");
  if (Object.keys(s.rejectionReasons).length) lines.push("  rejections: " + JSON.stringify(s.rejectionReasons));
  lines.push("  poke POST latency ms: " + fmt(s.pokeRequestLatencyMs));
  lines.push("  fan-out latency ms:   " + fmt(s.fanoutLatencyMs) + "  coverage=" + s.fanoutCoveragePercent + "%");
  lines.push("  health probe ms:      " + fmt(report.healthProbe.latencyMs) + "  failures=" + report.healthProbe.failures);
  lines.push("  idle health ms:       " + fmt(report.idle.healthLatencyMs));
  lines.push("  SSE: frames=" + s.stateFramesDelivered + " bytes=" + mb(s.stateBytesDelivered) +
    " meanFrame=" + s.meanFrameBytes + "B amplification=" + s.broadcastAmplification + " frames/Gahook");
  if (report.server.available) {
    lines.push("  server CPU % of one core: " + fmt(report.server.cpuPercentOfOneCore) +
      "  cpuSeconds=" + report.server.cpuSecondsUsed);
    lines.push("  server RSS MB: idle=" + report.idle.rssMbPeak + " peak=" + report.server.rssMbPeak);
  } else {
    lines.push("  server process metrics unavailable (pid not found)");
  }
  if (report.harness?.available) {
    lines.push("  harness CPU % of one core: " + fmt(report.harness.cpuPercentOfOneCore) +
      " (co-located; subtract mentally when reading the server figure)");
  }
  if (report.streamFailures.length) lines.push("  STREAM FAILURES: " + JSON.stringify(report.streamFailures));
  const brokenStreams = report.clients.filter((client) => client.streamEnded || client.errors.length);
  if (brokenStreams.length) lines.push("  BROKEN STREAMS: " + brokenStreams.length + " " + JSON.stringify(brokenStreams.slice(0, 3)));
  lines.push("  survived: " + report.survived);
  return lines.join("\n");
}

function fmt(stats) {
  if (!stats || !stats.count) return "(none)";
  return "p50=" + stats.p50 + " p95=" + stats.p95 + " p99=" + stats.p99 + " max=" + stats.max + " n=" + stats.count;
}

function mb(bytes) {
  return Math.round((bytes / 1024 / 1024) * 100) / 100 + "MB";
}

if (import.meta.url === "file://" + process.argv[1]) {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log("--players N --rooms N --duration S --rate PER_SECOND --shared-ip --label TEXT --out FILE");
    process.exit(0);
  }
  const report = await runStorm(options);
  console.log(formatReport(report));
  if (options.out) {
    fs.mkdirSync(path.dirname(options.out), { recursive: true });
    fs.writeFileSync(options.out, JSON.stringify(report, null, 2));
    console.log("Raw report written to " + options.out);
  }
}
