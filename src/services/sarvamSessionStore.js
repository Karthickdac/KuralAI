/**
 * Tiny in-memory store mapping callId → metadata for in-flight Sarvam calls.
 * Survives long enough for Twilio to pick up and connect the Media Stream.
 * Auto-evicts entries older than 30 minutes to prevent leaks.
 */

const META = new Map();
const MAX_AGE_MS = 30 * 60 * 1000;

function rememberCallMeta(callId, meta) {
  META.set(callId, { meta: meta || {}, ts: Date.now() });
}

function getCallMeta(callId) {
  const e = META.get(callId);
  return e ? e.meta : null;
}

function forgetCallMeta(callId) {
  META.delete(callId);
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of META.entries()) {
    if (now - v.ts > MAX_AGE_MS) META.delete(k);
  }
}, 5 * 60 * 1000).unref();

module.exports = { rememberCallMeta, getCallMeta, forgetCallMeta };
