import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { once } from 'node:events';
import { markSseClientSaturated } from './sse-backpressure.mjs';

test('a quiet saturated writable is destroyed on deadline without another snapshot', async () => {
  const res = new PassThrough({ highWaterMark: 1 });
  assert.equal(res.write(Buffer.alloc(1024)), false);
  const client = { res };
  const closed = once(res, 'close');
  markSseClientSaturated(client, { limitMs: 15, isOpen: () => true, resume: () => assert.fail('no drain expected') });
  await closed;
  client.clearSaturation?.();
  assert.ok(res.destroyed);
  assert.equal(res.listenerCount('drain'), 0);
});

test('drain cancels the eviction and resumes one latest snapshot; close cleans up', () => {
  const res = new PassThrough();
  let expire, cleared = 0, resumed = 0;
  const client = { res, pendingSnapshot: { stateVersion: 10 } };
  const options = { isOpen: () => true, resume: () => resumed++, timers: { setTimeout: (fn) => { expire = fn; return 1; }, clearTimeout: () => cleared++ } };
  markSseClientSaturated(client, options);
  markSseClientSaturated(client, options);
  assert.equal(res.listenerCount('drain'), 1);
  res.emit('drain');
  assert.equal(cleared, 1); assert.equal(resumed, 1);
  assert.equal(client.pendingSnapshot, null);
  markSseClientSaturated(client, options); client.clearSaturation();
  assert.equal(res.listenerCount('drain'), 0);
  assert.equal(cleared, 2);
  assert.equal(typeof expire, 'function');
  res.destroy();
});
