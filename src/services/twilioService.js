/**
 * Twilio Service
 * Handles outgoing calls, TwiML responses, and recording management.
 * Drop-in equivalent of exotelService.js — same function signatures.
 * Docs: https://www.twilio.com/docs/voice/api
 *
 * Key differences from Exotel:
 *  - Twilio supports <Play> inside <Gather> — used for ElevenLabs audio
 *  - Status webhook sends 'CallStatus' (not 'Status')
 *  - Auth: Basic(accountSid, authToken)
 *  - HMAC-SHA1 signature validation available (optional, enabled via setting)
 */

const fs   = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { TAMIL_PROMPTS } = require('../config/tamilPrompts');

const SETTINGS_FILE = path.join(__dirname, '../../config/app-settings.json');
function getStoredSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); } catch { return {}; }
}

function getTwilioBase() {
  const s = getStoredSettings();
  const accountSid = s.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
  const authToken  = s.twilioAuthToken  || process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials not configured. Add Account SID and Auth Token in Settings → Telephony.');
  }

  return {
    baseUrl: `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`,
    auth: { username: accountSid, password: authToken },
    s,
  };
}

/**
 * Initiate an outgoing call via Twilio
 */
async function initiateCall(toPhone, callId, callMeta = {}) {
  const { baseUrl, auth, s } = getTwilioBase();
  const webhookBase = (s.appUrl || process.env.APP_URL || '').replace(/\/$/, '');
  const token       = s.webhookToken || s.exotelWebhookToken || process.env.EXOTEL_WEBHOOK_TOKEN || 'kuralai-wh';
  const callerId    = s.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER || '';
  const timeLimit   = s.maxCallDurationSeconds || parseInt(process.env.MAX_CALL_DURATION_SECONDS) || 300;

  const params = new URLSearchParams();
  params.append('To',                   toPhone);
  params.append('From',                 callerId);
  params.append('Url',                  `${webhookBase}/webhook/call/answer?callId=${callId}&wt=${token}`);
  params.append('StatusCallback',       `${webhookBase}/webhook/call/status?callId=${callId}&wt=${token}`);
  params.append('StatusCallbackMethod', 'POST');
  params.append('StatusCallbackEvent',  'initiated');
  params.append('StatusCallbackEvent',  'ringing');
  params.append('StatusCallbackEvent',  'answered');
  params.append('StatusCallbackEvent',  'completed');
  params.append('TimeLimit',            String(timeLimit));
  const shouldRecord = callMeta.recordCalls !== false;
  if (shouldRecord) {
    params.append('Record',               'true');
    params.append('RecordingStatusCallback', `${webhookBase}/webhook/recording/status?callId=${callId}&wt=${token}`);
    params.append('RecordingStatusCallbackMethod', 'POST');
    params.append('RecordingChannels',    'dual');
  }

  const response = await axios.post(
    `${baseUrl}/Calls.json`,
    params.toString(),
    {
      auth,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );

  const call = response.data;
  logger.info(`Twilio call initiated: ${call?.sid} -> ${toPhone}`);

  return {
    sid:    call?.sid,
    status: call?.status,
  };
}

// ── TwiML Builders ─────────────────────────────────────────────────────────────

function _xml(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${body}\n</Response>`;
}

function _escapeXml(text) {
  return String(text)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * TwiML served when the callee picks up.
 * Plays consent message then redirects to the conversation loop.
 */
function generateAnswerExoML(callId) {
  const s = getStoredSettings();
  const webhookBase = (s.appUrl || process.env.APP_URL || '').replace(/\/$/, '');
  const token = s.webhookToken || s.exotelWebhookToken || process.env.EXOTEL_WEBHOOK_TOKEN || 'kuralai-webhook';

  return _xml(`
  <Redirect method="POST">${webhookBase}/webhook/call/conversation?callId=${callId}&amp;turn=0&amp;wt=${token}</Redirect>`);
}

/**
 * TwiML for a conversation turn: play pre-generated audio (from ElevenLabs/Azure),
 * then gather speech input.
 *
 * Unlike Exotel, Twilio DOES support <Play> inside <Gather> — this gives the
 * natural ElevenLabs voice quality on live calls.
 *
 * @param {string} audioUrl   - Pre-generated TTS audio URL — played via <Play>
 * @param {string} callId
 * @param {number} turn
 * @param {string} [sayText]  - Fallback text if audioUrl is missing
 */
function generateConversationExoML(audioUrl, callId, turn, sayText) {
  const s = getStoredSettings();
  const webhookBase = (s.appUrl || process.env.APP_URL || '').replace(/\/$/, '');
  const token = s.webhookToken || s.exotelWebhookToken || process.env.EXOTEL_WEBHOOK_TOKEN || 'kuralai-webhook';

  const speechUrl  = `${webhookBase}/webhook/call/speech?callId=${callId}&amp;turn=${turn + 1}&amp;wt=${token}`;
  const silenceUrl = `${webhookBase}/webhook/call/silence?callId=${callId}&amp;turn=${turn + 1}&amp;wt=${token}`;

  // Prefer <Play> for ElevenLabs audio; fall back to <Say> when URL is missing
  const spokenContent = audioUrl
    ? `<Play>${audioUrl}</Play>`
    : `<Say language="ta-IN">${_escapeXml(sayText || 'கேள்வி கேளுங்கள்.')}</Say>`;

  return _xml(`
  <Gather input="speech" timeout="10" speechTimeout="auto"
          language="ta-IN"
          action="${speechUrl}"
          method="POST">
    ${spokenContent}
  </Gather>
  <Redirect method="POST">${silenceUrl}</Redirect>`);
}

/**
 * TwiML to play goodbye and hang up.
 */
function generateEndCallExoML(goodbyeAudioUrl, sayText) {
  if (goodbyeAudioUrl) {
    return _xml(`
  <Play>${goodbyeAudioUrl}</Play>
  <Pause length="1"/>
  <Hangup/>`);
  }
  const text = sayText || TAMIL_PROMPTS.GOODBYE;
  return _xml(`
  <Say language="ta-IN">${_escapeXml(text)}</Say>
  <Pause length="1"/>
  <Hangup/>`);
}

/**
 * TwiML for human escalation — plays message then dials agent.
 */
function generateEscalationExoML(escalationAudioUrl, sayText) {
  const s = getStoredSettings();
  const escalationPhone  = s.escalationPhone || process.env.ESCALATION_PHONE;
  const callerIdPhone    = s.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER;

  const spokenContent = escalationAudioUrl
    ? `<Play>${escalationAudioUrl}</Play>`
    : `<Say language="ta-IN">${_escapeXml(sayText || TAMIL_PROMPTS.ESCALATION_MESSAGE)}</Say>`;

  let dialBlock = '';
  if (escalationPhone) {
    dialBlock = `\n  <Dial callerId="${callerIdPhone}" timeout="30"><Number>${escalationPhone}</Number></Dial>`;
  } else {
    dialBlock = `\n  <Say language="ta-IN">மன்னிக்கவும், இப்போது எந்த ஒரு ஆதரவாளரும் கிடைக்கவில்லை.</Say>\n  <Hangup/>`;
  }

  return _xml(`\n  ${spokenContent}\n  <Pause length="1"/>${dialBlock}`);
}

/**
 * Validate Twilio webhook signature (HMAC-SHA1).
 * Falls back to shared-secret token check if Twilio auth token is not configured.
 */
function validateWebhookToken(req) {
  const s = getStoredSettings();
  const expected = s.webhookToken || s.exotelWebhookToken || process.env.EXOTEL_WEBHOOK_TOKEN;

  // In dev mode (no token set), skip validation
  if (!expected || expected === 'kuralai-webhook') return true;

  // Check shared-secret query token first (same mechanism as Exotel)
  if (req.query.wt === expected) return true;

  // Optional: Twilio HMAC signature validation
  const authToken  = s.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;
  const twilioSig  = req.headers['x-twilio-signature'];
  if (authToken && twilioSig) {
    try {
      const url = `${(s.appUrl || '').replace(/\/$/, '')}${req.originalUrl}`;
      const params = req.body || {};
      const sortedParams = Object.keys(params).sort().reduce((str, key) => str + key + params[key], url);
      const expected = crypto.createHmac('sha1', authToken).update(sortedParams).digest('base64');
      return expected === twilioSig;
    } catch {}
  }

  return false;
}

module.exports = {
  initiateCall,
  generateAnswerExoML,
  generateConversationExoML,
  generateEndCallExoML,
  generateEscalationExoML,
  validateWebhookToken,
};
