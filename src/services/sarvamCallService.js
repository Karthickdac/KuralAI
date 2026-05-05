/**
 * Sarvam Conversational Call Service — telephony-aware dispatcher.
 *
 * Routes outbound dialing to either Twilio Media Streams or Exotel Voicebot
 * Applet based on the active telephonyProvider setting. In both cases the
 * audio is bridged to /sarvam-stream where the Sarvam STT→Chat→TTS loop runs.
 *
 *   telephonyProvider = 'twilio' (default)
 *     → POST Calls to Twilio with TwiML answer URL /webhook/sarvam-voice
 *       which returns <Connect><Stream url="wss://APP_URL/sarvam-stream"/>
 *
 *   telephonyProvider = 'exotel'
 *     → POST /Calls/connect.json with Url = the public ExoML URL of an Exotel
 *       App that contains a Voicebot Applet pointing at wss://APP_URL/sarvam-stream
 *       The user creates this App once in Exotel dashboard and pastes its
 *       App ID (or full URL) into Settings → Sarvam.ai.
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { getSettingsSync } = require('./settingsService');
const { rememberCallMeta, rememberCallSid } = require('./sarvamSessionStore');

async function initiateCall(toPhone, callId, callMeta = {}) {
  const s = getSettingsSync();
  const provider = (s.telephonyProvider || process.env.TELEPHONY_PROVIDER || 'twilio').toLowerCase();
  rememberCallMeta(callId, callMeta);

  if (provider === 'exotel') return initiateExotel(toPhone, callId, callMeta, s);
  return initiateTwilio(toPhone, callId, callMeta, s);
}

// ─── Twilio path ──────────────────────────────────────────────────────────────
async function initiateTwilio(toPhone, callId, callMeta, s) {
  const accountSid = s.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
  const authToken  = s.twilioAuthToken  || process.env.TWILIO_AUTH_TOKEN;
  const callerId   = s.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER || '';
  const apiKey     = s.sarvamApiKey || process.env.SARVAM_API_KEY;
  const webhookBase = (s.appUrl || process.env.APP_URL || '').replace(/\/$/, '');
  const token       = require('../utils/webhookToken').requireWebhookToken('Sarvam call');
  const timeLimit   = s.maxCallDurationSeconds || parseInt(process.env.MAX_CALL_DURATION_SECONDS) || 300;

  if (!accountSid || !authToken) throw new Error('Twilio credentials not configured');
  if (!callerId)                throw new Error('Twilio phone number not configured');
  if (!apiKey)                  throw new Error('Sarvam API key not configured');
  if (!webhookBase)             throw new Error('APP_URL not configured — Sarvam needs a public HTTPS base');

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

  logger.info(`[Sarvam→Twilio] Dialing ${toPhone} (call ${callId})`);
  const resp = await axios.post(`${baseUrl}/Calls.json`, params.toString(), {
    auth: { username: accountSid, password: authToken },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
  if (resp.data?.sid) rememberCallSid(resp.data.sid, callId);
  return { sid: resp.data?.sid, status: resp.data?.status };
}

// ─── Exotel path ──────────────────────────────────────────────────────────────
async function initiateExotel(toPhone, callId, callMeta, s) {
  const sid       = s.exotelSid      || process.env.EXOTEL_SID;
  const apiKey    = s.exotelApiKey   || process.env.EXOTEL_API_KEY;
  const apiToken  = s.exotelApiToken || process.env.EXOTEL_API_TOKEN;
  const callerId  = s.exotelPhoneNumber  || process.env.EXOTEL_PHONE_NUMBER || '';
  const webhookBase = (s.appUrl || process.env.APP_URL || '').replace(/\/$/, '');
  const token       = require('../utils/webhookToken').requireWebhookToken('Sarvam call');
  const timeLimit   = s.maxCallDurationSeconds || parseInt(process.env.MAX_CALL_DURATION_SECONDS) || 300;

  // The Voicebot App ID/URL the user configured in Exotel dashboard with a
  // Voicebot applet pointing at wss://<appUrl>/sarvam-stream.
  // Accepts either a full http(s) URL or a bare App ID (numeric).
  const voicebotApp = (s.exotelSarvamAppId || s.exotelVoicebotAppId || process.env.EXOTEL_SARVAM_APP_ID || '').trim();
  const sarvamKey   = s.sarvamApiKey || process.env.SARVAM_API_KEY;

  if (!sid || !apiKey || !apiToken) throw new Error('Exotel credentials not configured');
  if (!callerId)                    throw new Error('Exotel ExoPhone (CallerId) not configured');
  if (!voicebotApp)                 throw new Error('Exotel Voicebot App ID not configured (Settings → Sarvam.ai → Exotel Voicebot App ID)');
  if (!sarvamKey)                   throw new Error('Sarvam API key not configured');
  if (!webhookBase)                 throw new Error('APP_URL not configured — Voicebot Applet needs a public WSS URL');

  const appUrl = /^https?:\/\//i.test(voicebotApp)
    ? voicebotApp
    : `http://my.exotel.com/${sid}/exoml/start_voice/${voicebotApp}`;

  const baseUrl = `https://api.exotel.com/v1/Accounts/${sid}`;
  const params = new URLSearchParams({
    From:           toPhone,
    CallerId:       callerId,
    Url:            appUrl,
    StatusCallback: `${webhookBase}/webhook/call/status?callId=${callId}&wt=${token}`,
    StatusCallbackContentType: 'application/json',
    TimeLimit:      String(timeLimit),
    // Recording is controlled by the Voicebot App in Exotel dashboard.
    CustomField:    callId,  // Exotel echoes this back in callbacks
  });

  logger.info(`[Sarvam→Exotel] Dialing ${toPhone} via Voicebot App (call ${callId})`);
  const resp = await axios.post(
    `${baseUrl}/Calls/connect.json`,
    params.toString(),
    {
      auth: { username: apiKey, password: apiToken },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    }
  );
  const call = resp.data?.Call;
  if (call?.Sid) rememberCallSid(call.Sid, callId);
  return { sid: call?.Sid, status: call?.Status };
}

module.exports = { initiateCall };
