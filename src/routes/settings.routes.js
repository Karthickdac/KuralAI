/**
 * Settings Routes - /api/settings
 * Read and update application configuration
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const SETTINGS_FILE = path.join(__dirname, '../../config/app-settings.json');

const DEFAULTS = {
  escalationPhone: process.env.ESCALATION_PHONE || '',
  escalationWebhookUrl: process.env.ESCALATION_WEBHOOK_URL || '',
  maxCallDurationSeconds: parseInt(process.env.MAX_CALL_DURATION_SECONDS) || 300,
  callRetryAttempts: parseInt(process.env.CALL_RETRY_ATTEMPTS) || 3,
  callRetryDelaySeconds: parseInt(process.env.CALL_RETRY_DELAY_SECONDS) || 60,
  silenceTimeoutSeconds: parseInt(process.env.SILENCE_TIMEOUT_SECONDS) || 5,
  azureSpeechVoice: process.env.AZURE_SPEECH_VOICE || 'ta-IN-PallaviNeural',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o',
  appUrl: process.env.APP_URL || '',
  exotelPhoneNumber: process.env.EXOTEL_PHONE_NUMBER || '',
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

router.use(authenticateToken);

// GET /api/settings
router.get('/', (req, res) => {
  res.json({ success: true, settings: readSettings() });
});

// PUT /api/settings — admin only
router.put('/', requireAdmin, (req, res) => {
  try {
    const current = readSettings();
    const allowed = [
      'escalationPhone', 'escalationWebhookUrl', 'maxCallDurationSeconds',
      'callRetryAttempts', 'callRetryDelaySeconds', 'silenceTimeoutSeconds',
      'azureSpeechVoice', 'openaiModel', 'appUrl', 'exotelPhoneNumber',
    ];
    const updated = { ...current };
    for (const key of allowed) {
      if (req.body[key] !== undefined) updated[key] = req.body[key];
    }
    writeSettings(updated);

    // Sync back to process.env so running services pick them up
    process.env.ESCALATION_PHONE = updated.escalationPhone;
    process.env.ESCALATION_WEBHOOK_URL = updated.escalationWebhookUrl;
    process.env.MAX_CALL_DURATION_SECONDS = String(updated.maxCallDurationSeconds);
    process.env.CALL_RETRY_ATTEMPTS = String(updated.callRetryAttempts);
    process.env.CALL_RETRY_DELAY_SECONDS = String(updated.callRetryDelaySeconds);
    process.env.SILENCE_TIMEOUT_SECONDS = String(updated.silenceTimeoutSeconds);
    process.env.AZURE_SPEECH_VOICE = updated.azureSpeechVoice;
    process.env.OPENAI_MODEL = updated.openaiModel;
    process.env.APP_URL = updated.appUrl;
    process.env.EXOTEL_PHONE_NUMBER = updated.exotelPhoneNumber;

    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
