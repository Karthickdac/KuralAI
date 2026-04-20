/**
 * Tiny in-memory store mapping callId → metadata for in-flight Sarvam calls.
 * Survives long enough for Twilio to pick up and connect the Media Stream.
 * Auto-evicts entries older than 30 minutes to prevent leaks.
 */

const META = new Map();          // callId → { meta, ts }
const SID_TO_CALLID = new Map(); // providerCallSid → callId
const MAX_AGE_MS = 30 * 60 * 1000;

function rememberCallMeta(callId, meta) {
  META.set(callId, { meta: meta || {}, ts: Date.now() });
}

function rememberCallSid(providerCallSid, callId) {
  if (!providerCallSid || !callId) return;
  SID_TO_CALLID.set(String(providerCallSid), { callId, ts: Date.now() });
}

function getCallIdBySid(providerCallSid) {
  const e = SID_TO_CALLID.get(String(providerCallSid || ''));
  return e ? e.callId : null;
}

function getCallMeta(callId) {
  const e = META.get(callId);
  return e ? e.meta : null;
}

function hasCall(callId) {
  return META.has(callId);
}

function forgetCallMeta(callId) {
  META.delete(callId);
  for (const [sid, v] of SID_TO_CALLID.entries()) {
    if (v.callId === callId) SID_TO_CALLID.delete(sid);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of META.entries())          if (now - v.ts > MAX_AGE_MS) META.delete(k);
  for (const [k, v] of SID_TO_CALLID.entries()) if (now - v.ts > MAX_AGE_MS) SID_TO_CALLID.delete(k);
}, 5 * 60 * 1000).unref();

module.exports = {
  rememberCallMeta, getCallMeta, hasCall, forgetCallMeta,
  rememberCallSid, getCallIdBySid,
};
