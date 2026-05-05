/**
 * Local engine — TwiML answer webhook + health proxy.
 *
 * Twilio dials → fetches /webhook/local-voice on answer → we return TwiML that
 * opens a bidirectional Media Stream to /local-stream where the conversation
 * loop (src/services/localStream.js) lives.
 *
 * /webhook/local-health proxies the inference server's /health to the
 * dashboard so the UI can show readiness without exposing the GPU box.
 */
const express = require('express');
const multer = (() => { try { return require('multer'); } catch { return null; } })();
const logger = require('../utils/logger');
const { getSettingsSync } = require('../services/settingsService');
const localApi = require('../services/localApi');

const router = express.Router();
const upload = multer ? multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }) : null;

// Auth middleware for write ops on the voice catalogue. Read ops are open so
// the dashboard can populate the picker without auth.
function requireAdmin(req, res, next) {
  const s = getSettingsSync();
  const expected = s.webhookToken || s.exotelWebhookToken || process.env.EXOTEL_WEBHOOK_TOKEN || 'kuralai-wh';
  const got = req.query.wt || req.headers['x-webhook-token'];
  if (got !== expected) return res.status(403).json({ error: 'unauthorized' });
  next();
}

router.post('/local-voice', (req, res) => {
  const { callId, wt } = req.query;
  const s = getSettingsSync();
  const expected = s.webhookToken || s.exotelWebhookToken || process.env.EXOTEL_WEBHOOK_TOKEN || 'kuralai-wh';
  if (wt !== expected) {
    logger.warn(`[local-voice] invalid webhook token for call ${callId}`);
    return res.status(403).type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
  }

  const appUrl  = (s.appUrl || process.env.APP_URL || '').replace(/\/$/, '');
  const wssBase = appUrl.replace(/^http/i, 'ws');
  const streamUrl = `${wssBase}/local-stream?callId=${encodeURIComponent(callId || '')}&wt=${encodeURIComponent(expected)}`;

  const disclaimer = (s.recordingDisclaimer || '').trim();
  const sayNode = disclaimer
    ? `<Say language="ta-IN">${escapeXml(disclaimer)}</Say>`
    : '';

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${sayNode}
  <Connect>
    <Stream url="${escapeXml(streamUrl)}">
      <Parameter name="callId" value="${escapeXml(callId || '')}"/>
      <Parameter name="wt" value="${escapeXml(expected)}"/>
    </Stream>
  </Connect>
</Response>`;

  logger.info(`[local-voice] TwiML returned for call ${callId} → stream ${wssBase}/local-stream`);
  res.type('text/xml').send(twiml);
});

// Dashboard-facing readiness probe — no auth required (read-only) but only
// returns generic state.
router.get('/local-health', async (_req, res) => {
  const h = await localApi.health({ force: true }).catch(e => ({ ok: false, error: e.message }));
  res.json(h);
});

// ─── Voice Lab ──────────────────────────────────────────────────────────────
// List voices (open read).
router.get('/local-voices', async (_req, res) => {
  try {
    const voices = await localApi.listVoices();
    res.json({ voices });
  } catch (e) {
    res.status(502).json({ error: e.message, voices: [] });
  }
});

// Clone voice (auth). Multipart: file + voiceId + displayName + language + gender.
if (upload) {
  router.post('/local-voices', requireAdmin, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'audio file required' });
      const voiceId = (req.body.voiceId || req.body.voice_id || '').trim();
      if (!voiceId) return res.status(400).json({ error: 'voiceId required' });
      const voice = await localApi.cloneVoice({
        voiceId,
        wavBuffer: req.file.buffer,
        displayName: req.body.displayName || '',
        language: req.body.language || 'ta',
        gender: req.body.gender || 'unknown',
      });
      logger.info(`[local-voices] cloned voice id=${voiceId}`);
      res.json({ voice });
    } catch (e) {
      logger.warn(`[local-voices] clone failed: ${e.message}`);
      res.status(502).json({ error: e.message });
    }
  });
}

// Delete voice (auth).
router.delete('/local-voices/:id', requireAdmin, async (req, res) => {
  try {
    await localApi.deleteVoice(req.params.id);
    res.json({ deleted: req.params.id });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Audition: synth a short clip in the chosen voice and stream WAV back.
router.post('/local-voices/preview', express.json(), async (req, res) => {
  try {
    const { text, voice, languageCode } = req.body || {};
    if (!voice) return res.status(400).json({ error: 'voice required' });
    const wav = await localApi.previewVoice({
      text: text || 'வணக்கம், நான் உங்கள் தமிழ் AI உதவியாளர்.',
      voice,
      languageCode: languageCode || 'ta-IN',
    });
    res.setHeader('Content-Type', 'audio/wav');
    res.send(wav);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

module.exports = router;
