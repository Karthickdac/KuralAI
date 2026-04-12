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

const SETTINGS_FILE = path.join(__dirname, '../../config/app-settings.json');
function getStoredSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); } catch { return {}; }
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
  const token       = s.exotelWebhookToken || process.env.EXOTEL_WEBHOOK_TOKEN || 'kuralai-wh';
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
  <Say language="ta-in">${TAMIL_PROMPTS.RECORDING_CONSENT}</Say>
  <Pause length="1"/>
  <Redirect method="POST">${webhookBase}/webhook/call/conversation?callId=${callId}&amp;turn=0&amp;wt=${token}</Redirect>`);
}

/**
 * ExoML for a conversation turn: play AI audio and capture user speech.
 * @param {string} audioUrl - Public URL of pre-generated TTS audio (S3/CDN)
 * @param {string} callId
 * @param {number} turn
 */
function generateConversationExoML(audioUrl, callId, turn) {
  const s = getStoredSettings();
  const webhookBase = (s.appUrl || process.env.APP_URL || '').replace(/\/$/, '');
  const token = s.exotelWebhookToken || process.env.EXOTEL_WEBHOOK_TOKEN || 'kuralai-webhook';
  const silence = s.silenceTimeoutSeconds || parseInt(process.env.SILENCE_TIMEOUT_SECONDS) || 5;

  return _xml(`
  <Gather input="speech" language="ta-in" timeout="${silence}" speechTimeout="auto"
          action="${webhookBase}/webhook/call/speech?callId=${callId}&amp;turn=${turn + 1}&amp;wt=${token}"
          method="POST">
    <Play>${audioUrl}</Play>
  </Gather>
  <Redirect method="POST">${webhookBase}/webhook/call/silence?callId=${callId}&amp;turn=${turn + 1}&amp;wt=${token}</Redirect>`);
}

/**
 * ExoML to play a goodbye message and hang up.
 */
function generateEndCallExoML(goodbyeAudioUrl) {
  if (goodbyeAudioUrl) {
    return _xml(`
  <Play>${goodbyeAudioUrl}</Play>
  <Pause length="1"/>
  <Hangup/>`);
  }
  return _xml(`
  <Say language="ta-in">${TAMIL_PROMPTS.GOODBYE}</Say>
  <Pause length="1"/>
  <Hangup/>`);
}

/**
 * ExoML for human escalation — plays message then transfers to agent phone.
 */
function generateEscalationExoML(escalationAudioUrl) {
  const s = getStoredSettings();
  const escalationPhone = s.escalationPhone || process.env.ESCALATION_PHONE;
  const callerIdPhone = s.exotelPhoneNumber || process.env.EXOTEL_PHONE_NUMBER;

  let dialBlock = '';
  if (escalationPhone) {
    dialBlock = `\n  <Dial callerId="${callerIdPhone}" timeout="30"><Number>${escalationPhone}</Number></Dial>`;
  } else {
    dialBlock = `\n  <Say language="ta-in">மன்னிக்கவும், இப்போது எந்த ஒரு ஆதரவாளரும் கிடைக்கவில்லை.</Say>\n  <Hangup/>`;
  }

  if (escalationAudioUrl) {
    return _xml(`\n  <Play>${escalationAudioUrl}</Play>\n  <Pause length="1"/>${dialBlock}`);
  }
  return _xml(`\n  <Say language="ta-in">${TAMIL_PROMPTS.ESCALATION_MESSAGE}</Say>${dialBlock}`);
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
