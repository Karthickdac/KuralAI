/**
 * TTS Preview Route - /api/tts/preview
 * Synthesises text using the configured TTS provider (Azure or ElevenLabs) and streams audio.
 * Used by the Workflow script preview panel in the dashboard.
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const { buildTamilSSML, getTtsProvider, getElevenLabsConfig } = require('../services/speechService');

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

  const provider = getTtsProvider();

  // ─── ElevenLabs ────────────────────────────────────────────────────────────
  if (provider === 'elevenlabs') {
    const cfg = getElevenLabsConfig();

    if (!cfg.apiKey) {
      return res.status(503).json({
        error: 'ElevenLabs API key is not configured. Add it in Settings → ElevenLabs TTS.',
      });
    }

    const voiceId = voice || cfg.voiceId;
    const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    try {
      const response = await axios.post(
        endpoint,
        {
          text,
          model_id: cfg.modelId,
          voice_settings: { stability: 0.50, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
        },
        {
          headers: {
            'xi-api-key': cfg.apiKey,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          responseType: 'arraybuffer',
          timeout: 30000,
        }
      );

      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': response.data.byteLength,
        'Cache-Control': 'no-store',
      });
      return res.send(Buffer.from(response.data));
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data ? Buffer.from(err.response.data).toString('utf-8') : err.message;
      const msg = status === 401
        ? 'ElevenLabs API key is invalid or expired.'
        : status === 422
        ? `ElevenLabs rejected the request — check Voice ID. (${detail})`
        : `ElevenLabs TTS request failed (${status}): ${err.message}`;
      return res.status(502).json({ error: msg });
    }
  }

  // ─── Azure (default) ────────────────────────────────────────────────────────
  const cfg = getAzureConfig();

  if (!cfg.key || !cfg.region) {
    return res.status(503).json({
      error: 'Azure Speech credentials are not configured. Add your key and region in Settings.',
    });
  }

  const selectedVoice = voice || cfg.voice;
  const ssml = buildTamilSSML(text, selectedVoice);
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
