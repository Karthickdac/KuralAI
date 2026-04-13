/**
 * Settings Routes - /api/settings
 * Read and update application configuration including API credentials
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const SETTINGS_FILE = path.join(__dirname, '../../config/app-settings.json');

// Fields that are credentials — masked in GET response
const CREDENTIAL_FIELDS = [
  'exotelSid', 'exotelApiKey', 'exotelApiToken', 'exotelWebhookToken',
  'openaiApiKey', 'azureSpeechKey', 'awsAccessKeyId', 'awsSecretAccessKey',
  'elevenLabsApiKey',
];

const DEFAULTS = {
  // Exotel
  exotelSid:            process.env.EXOTEL_SID || '',
  exotelApiKey:         process.env.EXOTEL_API_KEY || '',
  exotelApiToken:       process.env.EXOTEL_API_TOKEN || '',
  exotelPhoneNumber:    process.env.EXOTEL_PHONE_NUMBER || '',
  exotelWebhookToken:   process.env.EXOTEL_WEBHOOK_TOKEN || '',
  appUrl:               process.env.APP_URL || '',
  // OpenAI
  openaiApiKey:         process.env.OPENAI_API_KEY || '',
  openaiModel:          process.env.OPENAI_MODEL || 'gpt-4o',
  // TTS Provider selection
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
};

function readSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) };
    }
  } catch {}
  return { ...DEFAULTS };
}

function writeSettings(data) {
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

// Mask credential fields in the response — return '••••••••' if set, '' if empty
function maskCredentials(settings) {
  const masked = { ...settings };
  for (const field of CREDENTIAL_FIELDS) {
    masked[field] = settings[field] ? '••••••••' : '';
  }
  return masked;
}

router.use(authenticateToken);

// GET /api/settings
router.get('/', (req, res) => {
  const settings = readSettings();
  res.json({ success: true, settings: maskCredentials(settings) });
});

// PUT /api/settings — admin only
router.put('/', requireAdmin, (req, res) => {
  try {
    const current = readSettings();
    const updated = { ...current };

    const allAllowed = Object.keys(DEFAULTS);

    for (const key of allAllowed) {
      const val = req.body[key];
      if (val === undefined) continue;

      // For credential fields: skip if value is empty or purely bullets (masked display value)
      if (CREDENTIAL_FIELDS.includes(key)) {
        if (!val || /^•+$/.test(val)) continue; // keep existing — user left field blank
        // Strip any leading bullet characters that might have been accidentally prepended
        updated[key] = String(val).replace(/^•+/, '');
      } else {
        updated[key] = val;
      }
    }

    // Also clean up any existing stored values that start with bullets (fix corrupted saves)
    for (const key of CREDENTIAL_FIELDS) {
      if (updated[key] && /^•/.test(updated[key])) {
        updated[key] = updated[key].replace(/^•+/, '');
      }
    }

    writeSettings(updated);

    // Sync all values back to process.env so running services pick them up immediately
    const envMap = {
      exotelSid:            'EXOTEL_SID',
      exotelApiKey:         'EXOTEL_API_KEY',
      exotelApiToken:       'EXOTEL_API_TOKEN',
      exotelPhoneNumber:    'EXOTEL_PHONE_NUMBER',
      exotelWebhookToken:   'EXOTEL_WEBHOOK_TOKEN',
      appUrl:               'APP_URL',
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
    };

    for (const [key, envKey] of Object.entries(envMap)) {
      if (updated[key] !== undefined) {
        process.env[envKey] = String(updated[key]);
      }
    }

    res.json({ success: true, settings: maskCredentials(updated) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
