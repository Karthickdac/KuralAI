/**
 * TTS Preview Route - /api/tts/preview
 * Synthesises text using Azure Neural TTS and streams audio to the client.
 * Used by the Workflow script preview panel in the dashboard.
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const { buildTamilSSML } = require('../services/speechService');

const SETTINGS_FILE = path.join(__dirname, '../../config/app-settings.json');

function readSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function getAzureConfig() {
  const stored = readSettings();
  // User-saved settings (via the Settings UI) always take priority over env vars.
  // This prevents stale/mismatched environment variables from overriding the dashboard config.
  return {
    key:    stored.azureSpeechKey    || process.env.AZURE_SPEECH_KEY    || '',
    region: stored.azureSpeechRegion || process.env.AZURE_SPEECH_REGION || '',
    voice:  stored.azureSpeechVoice  || process.env.AZURE_SPEECH_VOICE  || 'ta-IN-PallaviNeural',
  };
}

// POST /api/tts/preview
// Body: { text: string, voice?: string }
// Returns: audio/mpeg stream
router.post('/preview', authenticateToken, async (req, res) => {
  const { text, voice } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  const cfg = getAzureConfig();

  if (!cfg.key || !cfg.region) {
    return res.status(503).json({
      error: 'Azure Speech credentials are not configured. Add your key and region in Settings.',
    });
  }

  // Allow per-request voice override; fall back to stored setting
  if (voice) process.env.AZURE_SPEECH_VOICE = voice;

  // Build rich SSML with slang-aware prosody, en-IN code-switching, and pauses
  const ssml = buildTamilSSML(text);

  // Restore env if we overrode it
  if (voice) process.env.AZURE_SPEECH_VOICE = cfg.voice;

  const endpoint = `https://${cfg.region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  try {
    const response = await axios.post(endpoint, ssml, {
      headers: {
        'Ocp-Apim-Subscription-Key': cfg.key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        'User-Agent': 'KuralAI/1.0',
      },
      responseType: 'arraybuffer',
      timeout: 20000,
    });

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': response.data.byteLength,
      'Cache-Control': 'no-store',
    });
    res.send(Buffer.from(response.data));
  } catch (err) {
    const status = err.response?.status;
    const msg = status === 401
      ? 'Azure Speech key is invalid or expired.'
      : status === 403
      ? 'Azure Speech key does not have permission for this region.'
      : `Azure TTS request failed (${status}): ${err.message}`;
    res.status(502).json({ error: msg });
  }
});

module.exports = router;
