/**
 * Exotel Service
 * Handles outgoing calls, ExoML responses, and recording management
 * Docs: https://developer.exotel.com/api/
 */

const fs   = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('../utils/logger');
const { TAMIL_PROMPTS } = require('../config/tamilPrompts');

const { getSettingsSync } = require('./settingsService');
function getStoredSettings() {
  return getSettingsSync();
}

// ── Exotel REST Client ─────────────────────────────────────────────────────────

function getExotelBase() {
  const s = getStoredSettings();
  const sid      = s.exotelSid      || process.env.EXOTEL_SID;
  const apiKey   = s.exotelApiKey   || process.env.EXOTEL_API_KEY;
  const apiToken = s.exotelApiToken || process.env.EXOTEL_API_TOKEN;

  if (!sid || !apiKey || !apiToken) {
    throw new Error('Exotel credentials not configured. Add them in Settings → Exotel API Credentials.');
  }

  return {
    baseUrl: `https://api.exotel.com/v1/Accounts/${sid}`,
    auth: { username: apiKey, password: apiToken },
    s,
  };
}

/**
 * Initiate an outgoing call via Exotel
 * Exotel calls the `Url` webhook when the callee picks up (ExoML response expected).
 * @param {string} toPhone - Destination number (E.164, e.g. +919876543210)
 * @param {string} callId - Internal DB call ID
 */
async function initiateCall(toPhone, callId) {
  const { baseUrl, auth, s } = getExotelBase();
  const webhookBase = s.appUrl || process.env.APP_URL || '';
  const token       = require('../utils/webhookToken').requireWebhookToken('Exotel call');
  const callerId    = s.exotelPhoneNumber  || process.env.EXOTEL_PHONE_NUMBER  || '';
  const timeLimit   = s.maxCallDurationSeconds || parseInt(process.env.MAX_CALL_DURATION_SECONDS) || 300;

  const params = new URLSearchParams({
    From: toPhone,
    CallerId: callerId,
    Url: `${webhookBase.replace(/\/$/, '')}/webhook/call/answer?callId=${callId}&wt=${token}`,
    StatusCallback: `${webhookBase.replace(/\/$/, '')}/webhook/call/status?callId=${callId}&wt=${token}`,
    StatusCallbackContentType: 'application/json',
    TimeLimit: String(timeLimit),
    Record: 'false',
  });

  const response = await axios.post(
    `${baseUrl}/Calls/connect.json`,
    params.toString(),
    {
      auth,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );

  const call = response.data?.Call;
  logger.info(`Exotel call initiated: ${call?.Sid} -> ${toPhone}`);

  return {
    sid: call?.Sid,
    status: call?.Status,
  };
}

// ── ExoML Builders ─────────────────────────────────────────────────────────────

/**
 * XML header for all ExoML responses
 */
function _xml(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${body}\n</Response>`;
}

/**
 * ExoML served when the callee picks up.
 * Plays a short greeting using <Say> then redirects to the conversation loop.
 */
function generateAnswerExoML(callId) {
  const s = getStoredSettings();
  const webhookBase = (s.appUrl || process.env.APP_URL || '').replace(/\/$/, '');
  const token = s.exotelWebhookToken || process.env.EXOTEL_WEBHOOK_TOKEN || 'kuralai-webhook';

  return _xml(`
  <Say language="ta-IN">${TAMIL_PROMPTS.RECORDING_CONSENT}</Say>
  <Pause length="1"/>
  <Redirect method="POST">${webhookBase}/webhook/call/conversation?callId=${callId}&amp;turn=0&amp;wt=${token}</Redirect>`);
}

/**
 * Escape XML special characters and sanitize text for safe embedding inside <Say>.
 * - Collapses newlines/tabs to a single space (Exotel TTS rejects multi-line Say content)
 * - Removes control characters
 * - Escapes XML entities
 */
function _escapeXml(text) {
  return String(text)
    .replace(/[\r\n\t]+/g, ' ')   // collapse newlines & tabs → single space
    .replace(/[ ]{2,}/g, ' ')     // collapse multiple spaces
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * ExoML for a conversation turn: speak AI response inside <Gather> and listen for speech.
 *
 * Exotel does NOT fetch <Play> audio URLs inside <Gather> (confirmed: zero audio-fetch
 * requests from Exotel IPs despite URL being publicly reachable). We therefore use
 * <Say> (Exotel's own TTS) to speak the response — no external audio URL required.
 *
 * <Record> causes immediate disconnection on this account, so we keep <Gather input="speech">.
 *
 * @param {string} audioUrl   - Pre-generated TTS URL (kept for DB/S3 logging; NOT sent to Exotel)
 * @param {string} callId
 * @param {number} turn
 * @param {string} [sayText]  - Tamil text for <Say>; falls back to generic prompt when omitted
 */
function generateConversationExoML(audioUrl, callId, turn, sayText) {
  const s = getStoredSettings();
  const webhookBase = (s.appUrl || process.env.APP_URL || '').replace(/\/$/, '');
  const token = s.exotelWebhookToken || process.env.EXOTEL_WEBHOOK_TOKEN || 'kuralai-webhook';

  const speechUrl  = `${webhookBase}/webhook/call/speech?callId=${callId}&amp;turn=${turn + 1}&amp;wt=${token}`;
  const silenceUrl = `${webhookBase}/webhook/call/silence?callId=${callId}&amp;turn=${turn + 1}&amp;wt=${token}`;

  // Use <Say language="ta-IN"> for Exotel's Tamil TTS.
  // IMPORTANT: Do NOT add language= attribute to <Gather> — confirmed to cause silent failure.
  // language= on <Say> (not Gather) is the correct placement.
  const spokenText = sayText || 'கேள்வி கேளுங்கள்.';
  const sayVerb = `<Say language="ta-IN">${_escapeXml(spokenText)}</Say>`;

  // timeout="20" — seconds to wait for caller to start speaking after Say finishes
  // speechTimeout="3" — seconds of end-of-speech silence
  return _xml(`
  <Gather input="speech" timeout="20" speechTimeout="3"
          action="${speechUrl}"
          method="POST">
    ${sayVerb}
  </Gather>
  <Redirect method="POST">${silenceUrl}</Redirect>`);
}

/**
 * ExoML to play a goodbye message and hang up.
 * @param {string|null} goodbyeAudioUrl - Ignored (kept for signature compat); Exotel uses <Say>
 * @param {string} [sayText] - Tamil text; falls back to GOODBYE prompt
 */
function generateEndCallExoML(goodbyeAudioUrl, sayText) {
  const text = sayText || TAMIL_PROMPTS.GOODBYE;
  return _xml(`
  <Say language="ta-IN">${_escapeXml(text)}</Say>
  <Pause length="1"/>
  <Hangup/>`);
}

/**
 * ExoML for human escalation — plays message then transfers to agent phone.
 * @param {string|null} escalationAudioUrl - Ignored; Exotel uses <Say>
 * @param {string} [sayText] - Tamil text; falls back to ESCALATION_MESSAGE prompt
 */
function generateEscalationExoML(escalationAudioUrl, sayText) {
  const s = getStoredSettings();
  const escalationPhone = s.escalationPhone || process.env.ESCALATION_PHONE;
  const callerIdPhone = s.exotelPhoneNumber || process.env.EXOTEL_PHONE_NUMBER;

  let dialBlock = '';
  if (escalationPhone) {
    dialBlock = `\n  <Dial callerId="${callerIdPhone}" timeout="30"><Number>${escalationPhone}</Number></Dial>`;
  } else {
    dialBlock = `\n  <Say language="ta-IN">மன்னிக்கவும், இப்போது எந்த ஒரு ஆதரவாளரும் கிடைக்கவில்லை.</Say>\n  <Hangup/>`;
  }

  const text = sayText || TAMIL_PROMPTS.ESCALATION_MESSAGE;
  return _xml(`\n  <Say language="ta-IN">${_escapeXml(text)}</Say>\n  <Pause length="1"/>${dialBlock}`);
}

/**
 * Fetch a recording's details from Exotel.
 * Recordings are accessible using Basic Auth.
 */
async function getRecording(callSid) {
  const { baseUrl, auth } = getExotelBase();
  const response = await axios.get(`${baseUrl}/Calls/${callSid}/Recordings.json`, { auth });
  const recordings = response.data?.recordings?.Recording || [];
  const latest = Array.isArray(recordings) ? recordings[recordings.length - 1] : recordings;
  return latest ? { url: latest.Url, duration: latest.Duration } : null;
}

/**
 * Validate the webhook token appended to all webhook URLs.
 * Exotel doesn't publish a standard HMAC scheme, so we use a shared secret
 * in the URL query string. Set EXOTEL_WEBHOOK_TOKEN to a long random string.
 */
function validateWebhookToken(req) {
  const expected = process.env.EXOTEL_WEBHOOK_TOKEN;
  if (!expected || expected === 'kuralai-webhook') return true; // dev mode — skip
  return req.query.wt === expected;
}

module.exports = {
  initiateCall,
  generateAnswerExoML,
  generateConversationExoML,
  generateEndCallExoML,
  generateEscalationExoML,
  getRecording,
  validateWebhookToken,
};
