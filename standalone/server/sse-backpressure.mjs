// A deadline belongs to the stalled socket, independent of future room updates.
export function markSseClientSaturated(client, { isOpen, resume, limitMs = 30_000, timers = { setTimeout, clearTimeout } }) {
  if (client.saturated) return;
  client.saturated = true;
  client.saturatedSince = Date.now();
  const handle = timers.setTimeout(() => client.res.destroy(), limitMs);
  const drain = () => {
    cleanup();
    client.saturated = false;
    client.saturatedSince = 0;
    const queued = client.pendingSnapshot;
    client.pendingSnapshot = null;
    if (queued && isOpen()) resume();
  };
  const cleanup = () => {
    timers.clearTimeout(handle);
    client.res.off('drain', drain);
    client.clearSaturation = null;
  };
  client.clearSaturation = cleanup;
  client.res.once('drain', drain);
}
