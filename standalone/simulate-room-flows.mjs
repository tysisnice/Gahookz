import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
const summaries = [];
for (const mode of ["quiz", "majority", "herd"]) {
  for (const count of [4, 8, 12, 20]) {
    const requestedCode = Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
    const host = randomUUID();
    let code = requestedCode;
    const post = async (path, body = {}) => {
      const data = await (await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, playerKey: host, ...body }) })).json();
      assert.notEqual(data.ok, false, `${mode}/${count} ${path}: ${data.error}`);
      return data;
    };
    const state = (key = host) => post("/api/state", { playerKey: key, role: key === host ? "host" : "player" });
    const created = await post("/api/room");
    code = created.code || requestedCode;
    await post("/api/host/settings", { gameMode: mode, roundPreset: "quick" });
    const players = Array.from({ length: count }, () => randomUUID());
    for (const [i, key] of players.entries()) await post("/api/player/join", { playerKey: key, name: `Sim Player ${i + 1}`, avatarId: "frog" });
    await post("/api/host/lock-setup");
    await post("/api/host/force-start");
    const loads = [];
    if (mode === "herd") {
      for (const key of players) {
        const own = await state(key);
        loads.push(own.ownHerdAssignments.length);
        for (const [i, task] of own.ownHerdAssignments.entries()) await post("/api/herd/answer", { playerKey: key, questionId: task.questionId, text: `Simulated response ${players.indexOf(key)} / ${i}` });
        await post("/api/player/ready", { playerKey: key, ready: true });
      }
      await post("/api/host/start");
    }
    let snapshot = await state();
    const expectedRounds = snapshot.totalQuestions;
    let rounds = 0, votes = 0;
    for (let guard = 0; snapshot.phase !== "finished" && guard < 200; guard++) {
      if (snapshot.phase === "reading") await post("/api/host/skip");
      else if (snapshot.phase === "answering") {
        for (const [i, key] of players.entries()) {
          const own = await state(key);
          if (own.phase !== "answering" || own.ownAnswer) continue;
          const choices = own.currentQuestion.answers.filter(answer => !answer.ownAnswer);
          assert(choices.length > 0, "Every simulated player must have a legal answer");
          await post("/api/answer", { playerKey: key, answerId: choices[i % choices.length].id });
          votes++;
        }
        if ((await state()).phase === "answering") await post("/api/host/skip");
      } else if (snapshot.phase === "reveal") {
        rounds++;
        assert(snapshot.leaderboard.every(player => Number.isInteger(player.score)));
        await post("/api/host/skip");
      } else throw Error(`Unexpected phase ${snapshot.phase}`);
      snapshot = await state();
    }
    assert.equal(snapshot.phase, "finished");
    assert.equal(rounds, expectedRounds);
    assert.equal(snapshot.leaderboard.length, count);
    assert.equal(votes, rounds * count);
    summaries.push({ mode, players: count, rounds, votes, ...(loads.length ? { writingLoads: loads, workloadSpread: Math.max(...loads) - Math.min(...loads) } : {}) });
    await post("/api/host/reset");
    assert.equal((await state()).phase, "lobby");
  }
}
console.log(JSON.stringify({ ok: true, games: summaries.length, summaries }, null, 2));
