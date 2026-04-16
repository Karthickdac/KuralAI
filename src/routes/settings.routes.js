/**
 * Settings Routes - /api/settings
 * All settings are stored in the app_settings table (DB) as a single JSONB row.
 * On every write, the file config/app-settings.json is also updated so that
 * service modules that read the file directly continue to work without changes.
 */

const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const SETTINGS_FILE = path.join(__dirname, '../../config/app-settings.json');
const { clearTtsCache } = require('../services/speechService');
const { clearCache: clearSettingsCache } = require('../services/settingsService');

// Fields that are credentials — masked in GET response as '••••••••'
const CREDENTIAL_FIELDS = [
  'exotelSid', 'exotelApiKey', 'exotelApiToken', 'exotelWebhookToken',
  'twilioAccountSid', 'twilioAuthToken',
  'openaiApiKey', 'azureSpeechKey', 'awsAccessKeyId', 'awsSecretAccessKey',
  'elevenLabsApiKey', 'apiKey',
  'razorpayKeyId', 'razorpayKeySecret',
];

const DEFAULTS = {
  // Telephony provider
  telephonyProvider:    process.env.TELEPHONY_PROVIDER || 'twilio',
  // Exotel
  exotelSid:            process.env.EXOTEL_SID || '',
  exotelApiKey:         process.env.EXOTEL_API_KEY || '',
  exotelApiToken:       process.env.EXOTEL_API_TOKEN || '',
  exotelPhoneNumber:    process.env.EXOTEL_PHONE_NUMBER || '',
  exotelWebhookToken:   process.env.EXOTEL_WEBHOOK_TOKEN || '',
  appUrl:               process.env.APP_URL || '',
  // Twilio
  twilioAccountSid:     process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken:      process.env.TWILIO_AUTH_TOKEN || '',
  twilioPhoneNumber:    process.env.TWILIO_PHONE_NUMBER || '',
  // OpenAI
  openaiApiKey:         process.env.OPENAI_API_KEY || '',
  openaiModel:          process.env.OPENAI_MODEL || 'gpt-4o',
  // TTS Provider
  ttsProvider:          process.env.TTS_PROVIDER || 'azure',
  // Azure Speech
  azureSpeechKey:       process.env.AZURE_SPEECH_KEY || '',
  azureSpeechRegion:    process.env.AZURE_SPEECH_REGION || '',
  azureSpeechVoice:     process.env.AZURE_SPEECH_VOICE || 'ta-IN-PallaviNeural',
  // ElevenLabs TTS
  elevenLabsApiKey:     process.env.ELEVENLABS_API_KEY || '',
  elevenLabsVoiceId:    process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM',
  // AWS S3
  awsAccessKeyId:       process.env.AWS_ACCESS_KEY_ID || '',
  awsSecretAccessKey:   process.env.AWS_SECRET_ACCESS_KEY || '',
  s3BucketName:         process.env.S3_BUCKET_NAME || '',
  awsRegion:            process.env.AWS_REGION || '',
  // Call behaviour
  maxCallDurationSeconds:  parseInt(process.env.MAX_CALL_DURATION_SECONDS) || 300,
  callRetryAttempts:       parseInt(process.env.CALL_RETRY_ATTEMPTS) || 3,
  callRetryDelaySeconds:   parseInt(process.env.CALL_RETRY_DELAY_SECONDS) || 60,
  silenceTimeoutSeconds:   parseInt(process.env.SILENCE_TIMEOUT_SECONDS) || 5,
  // Escalation
  escalationPhone:         process.env.ESCALATION_PHONE || '',
  escalationWebhookUrl:    process.env.ESCALATION_WEBHOOK_URL || '',
  // Inbound call routing
  inboundWorkflowId:       process.env.INBOUND_WORKFLOW_ID || '',
  // External API
  apiKey:                  process.env.KURAL_API_KEY || '',
  // Payment Gateway — Razorpay
  razorpayKeyId:           process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret:       process.env.RAZORPAY_KEY_SECRET || '',
};

// ── DB helpers ─────────────────────────────────────────────────────────────────

async function readSettingsFromDb() {
  try {
    const AppSetting = require('../models/AppSetting');
    const row = await AppSetting.findByPk('main');
    return { ...DEFAULTS, ...(row ? row.data : {}) };
  } catch {
    return readSettingsFromFile();
  }
}

async function writeSettingsToDb(data) {
  const AppSetting = require('../models/AppSetting');
  const [row] = await AppSetting.findOrBuild({ where: { key: 'main' } });
  row.data = data;
  row.changed('data', true);
  await row.save();
}

// ── File helpers (backward compat for service modules reading the file) ─────────

function readSettingsFromFile() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) };
    }
  } catch {}
  return { ...DEFAULTS };
}

function writeSettingsToFile(data) {
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

// ── Credential masking ─────────────────────────────────────────────────────────

function maskCredentials(settings) {
  const masked = { ...settings };
  for (const field of CREDENTIAL_FIELDS) {
    masked[field] = settings[field] ? '••••••••' : '';
  }
  return masked;
}

// ── Env sync (so running services pick up new values immediately) ──────────────

const ENV_MAP = {
  telephonyProvider:    'TELEPHONY_PROVIDER',
  exotelSid:            'EXOTEL_SID',
  exotelApiKey:         'EXOTEL_API_KEY',
  exotelApiToken:       'EXOTEL_API_TOKEN',
  exotelPhoneNumber:    'EXOTEL_PHONE_NUMBER',
  exotelWebhookToken:   'EXOTEL_WEBHOOK_TOKEN',
  appUrl:               'APP_URL',
  twilioAccountSid:     'TWILIO_ACCOUNT_SID',
  twilioAuthToken:      'TWILIO_AUTH_TOKEN',
  twilioPhoneNumber:    'TWILIO_PHONE_NUMBER',
  openaiApiKey:         'OPENAI_API_KEY',
  openaiModel:          'OPENAI_MODEL',
  ttsProvider:          'TTS_PROVIDER',
  azureSpeechKey:       'AZURE_SPEECH_KEY',
  azureSpeechRegion:    'AZURE_SPEECH_REGION',
  azureSpeechVoice:     'AZURE_SPEECH_VOICE',
  elevenLabsApiKey:     'ELEVENLABS_API_KEY',
  elevenLabsVoiceId:    'ELEVENLABS_VOICE_ID',
  awsAccessKeyId:       'AWS_ACCESS_KEY_ID',
  awsSecretAccessKey:   'AWS_SECRET_ACCESS_KEY',
  s3BucketName:         'S3_BUCKET_NAME',
  awsRegion:            'AWS_REGION',
  maxCallDurationSeconds:  'MAX_CALL_DURATION_SECONDS',
  callRetryAttempts:       'CALL_RETRY_ATTEMPTS',
  callRetryDelaySeconds:   'CALL_RETRY_DELAY_SECONDS',
  silenceTimeoutSeconds:   'SILENCE_TIMEOUT_SECONDS',
  escalationPhone:         'ESCALATION_PHONE',
  escalationWebhookUrl:    'ESCALATION_WEBHOOK_URL',
  inboundWorkflowId:       'INBOUND_WORKFLOW_ID',
  apiKey:                  'KURAL_API_KEY',
  razorpayKeyId:           'RAZORPAY_KEY_ID',
  razorpayKeySecret:       'RAZORPAY_KEY_SECRET',
};

function syncEnv(updated) {
  for (const [key, envKey] of Object.entries(ENV_MAP)) {
    if (updated[key] !== undefined) {
      process.env[envKey] = String(updated[key]);
    }
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────────

router.use(authenticateToken);

// POST /api/settings/generate-api-key — admin only — creates a new random API key
router.post('/generate-api-key', requireAdmin, async (req, res) => {
  try {
    const crypto = require('crypto');
    const newKey = 'kural_' + crypto.randomBytes(24).toString('hex');

    const current = await readSettingsFromDb();
    current.apiKey = newKey;
    await writeSettingsToDb(current);
    writeSettingsToFile(current);
    clearSettingsCache();
    syncEnv(current);

    res.json({ success: true, apiKey: newKey });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/settings
router.get('/', async (req, res) => {
  try {
    const settings = await readSettingsFromDb();
    res.json({ success: true, settings: maskCredentials(settings) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/settings — admin only
router.put('/', requireAdmin, async (req, res) => {
  try {
    const current = await readSettingsFromDb();
    const updated = { ...current };
    const allowed = Object.keys(DEFAULTS);

    for (const key of allowed) {
      const val = req.body[key];
      if (val === undefined) continue;

      if (CREDENTIAL_FIELDS.includes(key)) {
        if (!val || /^•+$/.test(val)) continue;
        updated[key] = String(val).replace(/^•+/, '');
      } else {
        updated[key] = val;
      }
    }

    // Clean up any bullet-corrupted credential values
    for (const key of CREDENTIAL_FIELDS) {
      if (updated[key] && /^•/.test(updated[key])) {
        updated[key] = updated[key].replace(/^•+/, '');
      }
    }

    // Write to DB (primary) and file (backward compat for services)
    await writeSettingsToDb(updated);
    writeSettingsToFile(updated);
    clearSettingsCache();

    // Sync to running process env
    syncEnv(updated);

    // If any TTS setting changed, clear the in-memory audio cache so the
    // new voice / provider is used immediately on the next call.
    const TTS_FIELDS = ['elevenLabsVoiceId', 'elevenLabsApiKey', 'ttsProvider',
                        'azureSpeechVoice', 'azureSpeechKey', 'azureSpeechRegion'];
    const ttsChanged = TTS_FIELDS.some(f => req.body[f] !== undefined && req.body[f] !== current[f]);
    if (ttsChanged) clearTtsCache();

    res.json({ success: true, settings: maskCredentials(updated) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
