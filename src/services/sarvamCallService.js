/**
 * Sarvam Conversational Call Service
 *
 * Initiates a Twilio outbound call whose answer URL points at our
 * /webhook/sarvam-voice route. That route returns TwiML that opens a
 * Media Stream WebSocket back to /sarvam-stream where the conversation
 * loop runs (Sarvam STT → Chat → TTS).
 *
 * Same signature as elevenlabsCallService / twilioService.initiateCall.
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { getSettingsSync } = require('./settingsService');
const { rememberCallMeta } = require('./sarvamSessionStore');

async function initiateCall(toPhone, callId, callMeta = {}) {
  const s = getSettingsSync();
  const accountSid = s.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
  const authToken  = s.twilioAuthToken  || process.env.TWILIO_AUTH_TOKEN;
  const callerId   = s.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER || '';
  const apiKey     = s.sarvamApiKey || process.env.SARVAM_API_KEY;
  const webhookBase = (s.appUrl || process.env.APP_URL || '').replace(/\/$/, '');
  const token       = s.webhookToken || s.exotelWebhookToken || process.env.EXOTEL_WEBHOOK_TOKEN || 'kuralai-wh';
  const timeLimit   = s.maxCallDurationSeconds || parseInt(process.env.MAX_CALL_DURATION_SECONDS) || 300;

  if (!accountSid || !authToken) throw new Error('Twilio credentials not configured (Sarvam engine uses Twilio for telephony)');
  if (!callerId)                throw new Error('Twilio phone number not configured');
  if (!apiKey)                  throw new Error('Sarvam API key not configured (set sarvamApiKey in Settings)');
  if (!webhookBase)             throw new Error('APP_URL not configured — Sarvam engine needs a public HTTPS base for webhooks');

  // Cache call metadata so the WebSocket can pick it up by callId
  rememberCallMeta(callId, callMeta);

  const baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;
  const params  = new URLSearchParams();
  params.append('To',                   toPhone);
  params.append('From',                 callerId);
  params.append('Url',                  `${webhookBase}/webhook/sarvam-voice?callId=${callId}&wt=${token}`);
  params.append('StatusCallback',       `${webhookBase}/webhook/call/status?callId=${callId}&wt=${token}`);
  params.append('StatusCallbackMethod', 'POST');
  params.append('StatusCallbackEvent',  'initiated');
  params.append('StatusCallbackEvent',  'ringing');
  params.append('StatusCallbackEvent',  'answered');
  params.append('StatusCallbackEvent',  'completed');
  params.append('TimeLimit',            String(timeLimit));

  const shouldRecord = callMeta.recordCalls !== false;
  if (shouldRecord) {
    params.append('Record',                       'true');
    params.append('RecordingStatusCallback',      `${webhookBase}/webhook/recording/status?callId=${callId}&wt=${token}`);
    params.append('RecordingStatusCallbackMethod','POST');
    params.append('RecordingChannels',            'dual');
  }

  logger.info(`[Sarvam] Dialing ${toPhone} (call ${callId})`);

  const resp = await axios.post(`${baseUrl}/Calls.json`, params.toString(), {
    auth: { username: accountSid, password: authToken },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });

  return { sid: resp.data?.sid, status: resp.data?.status };
}

module.exports = { initiateCall };
