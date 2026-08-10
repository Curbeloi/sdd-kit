/**
 * shutdown.js — Deterministic CLI exit.
 *
 * Node keeps running while any handle is referenced, so one leaked interval,
 * undrained pipe or pending timer is enough to make a *finished* command hang
 * forever. Commands own their own cleanup; this is the backstop that guarantees
 * the process actually leaves once the last byte is on the wire.
 *
 * Ordering matters: stdout may be a pipe (`sdd arch | tee`), where writes are
 * asynchronous — calling `process.exit()` straight away truncates output. So we
 * flush first, then exit.
 */

import { debugLog } from './log.js';

const FLUSH_TIMEOUT_MS = 2000;

/** Resolve once `stream`'s pending writes have drained (or the guard fires). */
function flushStream(stream) {
  return new Promise((resolve) => {
    if (!stream || stream.destroyed || !stream.writable) return resolve();
    if (!stream.writableLength) return resolve();

    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const guard = setTimeout(finish, FLUSH_TIMEOUT_MS);
    guard.unref();
    stream.write('', () => { clearTimeout(guard); finish(); });
  });
}

/**
 * What is still holding the event loop open. Used by the `SDD_DEBUG=1` trace so
 * the next leak of this kind is diagnosable in one run instead of by bisection.
 */
export function activeHandleSummary() {
  const resources = typeof process.getActiveResourcesInfo === 'function'
    ? process.getActiveResourcesInfo()
    : [];
  const counts = {};
  for (const r of resources) counts[r] = (counts[r] || 0) + 1;
  return Object.entries(counts).map(([k, v]) => `${k}×${v}`).join(', ') || 'none';
}

/**
 * Flush stdio, then exit.
 *
 * The explicit exit is deliberate. Leaving it to the event loop means any
 * stray handle — a provider's keepalive socket, a spinner interval, an
 * unconsumed child pipe — silently turns "command finished" into "terminal
 * never comes back", which is indistinguishable from "still working".
 *
 * @param {number} [code] - exit status; defaults to whatever commands set.
 */
export async function exitWhenFlushed(code = process.exitCode ?? 0) {
  if (process.env.SDD_DEBUG === '1') {
    debugLog('shutdown', `active handles at exit: ${activeHandleSummary()}`);
  }
  await Promise.all([flushStream(process.stdout), flushStream(process.stderr)]);
  process.exit(code);
}
