/**
 * Local-engine Call Service — telephony-aware dispatcher.
 *
 * Mirrors sarvamCallService for the self-hosted inference stack:
 *   - Twilio:  dial → /webhook/local-voice → <Connect><Stream wss://.../local-stream/>
 *   - Exotel:  dial → Voicebot Applet (App ID configured by user) pointing at
 *              wss://APP_URL/local-stream
 *
 * Before dialing, the inference server health is probed. If it's not ready
 * AND the configured engineFallbackChain includes 'sarvam', the call is
 * automatically redispatched through the Sarvam engine so the customer always
 * gets answered.
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { getSettingsSync } = require('./settingsService');
const { rememberCallMeta, rememberCallSid } = require('./localSessionStore');
const localApi = require('./localApi');

async function initiateCall(toPhone, callId, callMeta = {}) {
  const s = getSettingsSync();
  rememberCallMeta(callId, callMeta);

  // Pre-flight: if the inference server isn't ready, fail over to the next
  // engine in the chain (typically Sarvam) so customers never get dead air.
  if (!localApi.isConfigured()) {
    return failover(toPhone, callId, callMeta, 'localInferenceUrl not configured');
  }
  const h = await localApi.health().catch(() => ({ ready: false, error: 'health probe failed' }));
  if (!h.ready) {
    return failover(toPhone, callId, callMeta, h.error || `inference not ready (status=${h.status || 'n/a'})`);
  }

  const provider = (s.telephonyProvider || process.env.TELEPHONY_PROVIDER || 'twilio').toLowerCase();
  if (provider === 'exotel') return initiateExotel(toPhone, callId, callMeta, s);
  return initiateTwilio(toPhone, callId, callMeta, s);
}

function fallbackChain() {
  const s = getSettingsSync();
  return (s.engineFallbackChain || 'local,sarvam')
    .toString().split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
}

// Cascade through every non-local engine in the configured chain. Each
// failover attempt + outcome is recorded into callMeta.failoverHistory so
// post-call analytics can show "answered by Sarvam after Local was down".
async function failover(toPhone, callId, callMeta, reason) {
  const chain = fallbackChain().filter(e => e !== 'local');
  callMeta.failoverHistory = callMeta.failoverHistory || [];
  callMeta.failoverHistory.push({
    at: new Date().toISOString(),
    from: 'local',
    reason,
  });

  if (!chain.length) {
    callMeta.failoverReason = reason;
    callMeta.engineUsed     = 'none';
    rememberCallMeta(callId, callMeta);
    throw new Error(`Local inference unavailable and no fallback engine configured (reason: ${reason})`);
  }

  for (const eng of chain) {
    let initiate = null;
    if (eng === 'sarvam')         initiate = require('./sarvamCallService').initiateCall;
    else if (eng === 'elevenlabs') initiate = require('./elevenlabsCallService').initiateCall;
    else if (eng === 'kuralai')   initiate = require('./telephonyService').initiateCall;
    if (!initiate) {
      logger.warn(`[local-call] unknown engine '${eng}' in fallback chain — skipping`);
      continue;
    }
    try {
      logger.warn(`[local-call] failing over to '${eng}' (reason: ${reason})`);
      const out = await initiate(toPhone, callId, callMeta);
      callMeta.failoverReason = reason;
      callMeta.engineUsed     = eng;
      callMeta.failoverHistory.push({ at: new Date().toISOString(), to: eng, ok: true });
      rememberCallMeta(callId, callMeta);
      return out;
    } catch (err) {
      logger.warn(`[local-call] fallback '${eng}' failed: ${err.message}`);
      callMeta.failoverHistory.push({ at: new Date().toISOString(), to: eng, ok: false, error: err.message });
    }
  }

  callMeta.failoverReason = reason;
  callMeta.engineUsed     = 'none';
  rememberCallMeta(callId, callMeta);
  throw new Error(`All fallback engines failed (initial reason: ${reason})`);
}

// ─── Twilio path ──────────────────────────────────────────────────────────────
async function initiateTwilio(toPhone, callId, callMeta, s) {
  const accountSid = s.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
  const authToken  = s.twilioAuthToken  || process.env.TWILIO_AUTH_TOKEN;
  const callerId   = s.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER || '';
  const webhookBase = (s.appUrl || process.env.APP_URL || '').replace(/\/$/, '');
  const token       = require('../utils/webhookToken').requireWebhookToken('Twilio call');
  const timeLimit   = s.maxCallDurationSeconds || parseInt(process.env.MAX_CALL_DURATION_SECONDS) || 300;

  if (!accountSid || !authToken) throw new Error('Twilio credentials not configured');
  if (!callerId)                throw new Error('Twilio phone number not configured');
  if (!webhookBase)             throw new Error('APP_URL not configured — Local engine needs a public HTTPS base');

  const baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;
  const params  = new URLSearchParams();
  params.append('To',                   toPhone);
  params.append('From',                 callerId);
  params.append('Url',                  `${webhookBase}/webhook/local-voice?callId=${callId}&wt=${token}`);
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

  logger.info(`[Local→Twilio] Dialing ${toPhone} (call ${callId})`);
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
  const token       = require('../utils/webhookToken').requireWebhookToken('Exotel call');
  const timeLimit   = s.maxCallDurationSeconds || parseInt(process.env.MAX_CALL_DURATION_SECONDS) || 300;

  // The user creates an Exotel Voicebot App pointing at wss://<appUrl>/local-stream
  // and pastes the App ID (or full URL) into Settings → Local Engine.
  const voicebotApp = (s.exotelLocalAppId || s.exotelVoicebotAppId || process.env.EXOTEL_LOCAL_APP_ID || '').trim();

  if (!sid || !apiKey || !apiToken) throw new Error('Exotel credentials not configured');
  if (!callerId)                    throw new Error('Exotel ExoPhone (CallerId) not configured');
  if (!voicebotApp)                 throw new Error('Exotel Voicebot App ID for Local engine not configured (Settings → Local Engine → Exotel Voicebot App ID)');
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
    CustomField:    callId,
  });

  logger.info(`[Local→Exotel] Dialing ${toPhone} via Voicebot App (call ${callId})`);
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
