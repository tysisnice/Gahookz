import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { HttpError, assertSameOrigin, readJson, writeSseState } from "./transport.mjs";

function request(body, headers = { "content-type": "application/json" }) {
  const stream = Readable.from(body === undefined ? [] : [body]);
  stream.headers = headers;
  return stream;
}

test("readJson accepts bounded JSON objects", async () => {
  const payload = await readJson(request('{"answerId":"blue"}'), { maxBytes: 64 });
  assert.deepEqual(payload, { answerId: "blue" });
});

test("readJson returns classified client errors", async () => {
  await assert.rejects(
    readJson(request("not json")),
    (error) => error instanceof HttpError && error.statusCode === 400 && error.code === "invalid_json"
  );
  await assert.rejects(
    readJson(request("{}", { "content-type": "text/plain" })),
    (error) => error instanceof HttpError && error.statusCode === 415
  );
  await assert.rejects(
    readJson(request('{"tooLarge":true}'), { maxBytes: 4 }),
    (error) => error instanceof HttpError && error.statusCode === 413
  );
  await assert.rejects(
    readJson(request("[]")),
    (error) => error instanceof HttpError && error.statusCode === 400 && error.code === "invalid_json_shape"
  );
});

test("same-origin checks reject browser cross-site mutations", () => {
  assert.doesNotThrow(() => assertSameOrigin({ headers: { host: "play.example.com", origin: "https://play.example.com" } }));
  assert.doesNotThrow(() => assertSameOrigin({ headers: { host: "127.0.0.1:3001" } }));
  assert.throws(
    () => assertSameOrigin({ headers: { host: "play.example.com", origin: "https://attacker.example" } }),
    (error) => error instanceof HttpError && error.statusCode === 403
  );
  assert.throws(
    () => assertSameOrigin({ headers: { host: "play.example.com", "sec-fetch-site": "cross-site" } }),
    (error) => error instanceof HttpError && error.statusCode === 403
  );
});

test("a state frame is one write, and reports backpressure", () => {
  // One write so a slow socket cannot be left holding half an event, and the
  // return value is the signal that the socket is full. Ignoring it is how one
  // stalled reader grows the server's memory for as long as it stays connected.
  const writes = [];
  const fullSocket = { write(chunk) { writes.push(chunk); return false; } };
  assert.equal(writeSseState(fullSocket, { stateVersion: 1 }), false);
  assert.equal(writes.length, 1, "a frame must not be split across writes");
  assert.match(writes[0], /^event: state\ndata: \{.*\}\n\n$/);

  const readySocket = { write() { return true; } };
  assert.equal(writeSseState(readySocket, { stateVersion: 2 }), true);
});
