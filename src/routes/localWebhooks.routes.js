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
//
// SECURITY: previously this fell back to the literal string 'kuralai-wh' when
// no token was configured, which made write endpoints guessable on fresh
// installs. We now refuse all writes until the operator explicitly sets a
// webhook token — failing closed is the only safe default.
function requireAdmin(req, res, next) {
  const s = getSettingsSync();
  const expected = s.webhookToken || s.exotelWebhookToken || process.env.EXOTEL_WEBHOOK_TOKEN || '';
  if (!expected) {
    return res.status(503).json({ error: 'webhook token not configured — set Settings → Telephony → Webhook Token' });
  }
  const got = req.query.wt || req.headers['x-webhook-token'];
  if (got !== expected) return res.status(403).json({ error: 'unauthorized' });
  next();
}

router.post('/local-voice', (req, res) => {
  const { callId, wt } = req.query;
  const s = getSettingsSync();
  const expected = require('../utils/webhookToken').getWebhookToken();
  if (!expected) {
    logger.warn(`[local-voice] webhook token not configured — refusing call ${callId}`);
    return res.status(503).type('text/xml').send('<Response><Reject/></Response>');
  }
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
  let concurrentCalls = 0;
  try {
    const stream = require('../services/localStream');
    if (typeof stream.activeCallCount === 'function') concurrentCalls = stream.activeCallCount();
  } catch {}
  res.json({ ...h, concurrentCalls });
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

// Create voice (auth). Form fields: voiceId, displayName, language, gender,
// description, tags (csv), useCase, age, accent.
// Multipart parser is wired so dashboards posting FormData (Settings Voice Lab
// card) populate req.body the same as JSON / urlencoded clients do.
const parseVoiceBody = upload
  ? [upload.none(), express.urlencoded({ extended: true }), express.json()]
  : [express.urlencoded({ extended: true }), express.json()];

router.post('/local-voices', requireAdmin, ...parseVoiceBody, async (req, res) => {
  try {
    const b = req.body || {};
    const voiceId = (b.voiceId || b.voice_id || '').trim();
    if (!voiceId) return res.status(400).json({ error: 'voiceId required' });
    if (!b.description || !b.description.trim()) return res.status(400).json({ error: 'description required' });
    const voice = await localApi.saveVoice({
      voiceId,
      displayName: b.displayName || '',
      language:    b.language    || 'ta',
      gender:      b.gender      || 'unknown',
      description: b.description,
      tags:        Array.isArray(b.tags) ? b.tags : (b.tags ? String(b.tags).split(',').map(t => t.trim()).filter(Boolean) : []),
      useCase:     b.useCase || '',
      age:         b.age || '',
      accent:      b.accent || '',
    });
    logger.info(`[local-voices] saved id=${voiceId}`);
    res.json({ voice });
  } catch (e) {
    logger.warn(`[local-voices] save failed: ${e.message}`);
    res.status(502).json({ error: e.message });
  }
});

// Patch voice (auth). JSON body — any subset of editable fields.
router.patch('/local-voices/:id', requireAdmin, express.json(), async (req, res) => {
  try {
    const voice = await localApi.updateVoice(req.params.id, req.body || {});
    res.json({ voice });
  } catch (e) {
    const status = /not found/i.test(e.message) ? 404 : 502;
    res.status(status).json({ error: e.message });
  }
});

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
// Auth required — synth burns GPU cycles and would otherwise be a DoS / cost
// amplification vector. Text capped at 600 chars to bound runtime per call.
router.post('/local-voices/preview', requireAdmin, express.json({ limit: '8kb' }), async (req, res) => {
  try {
    const { text, voice, languageCode } = req.body || {};
    if (!voice) return res.status(400).json({ error: 'voice required' });
    const safeText = String(text || 'வணக்கம், நான் உங்கள் தமிழ் AI உதவியாளர்.').slice(0, 600);
    const wav = await localApi.previewVoice({
      text: safeText,
      voice,
      languageCode: languageCode || 'ta-IN',
    });
    res.setHeader('Content-Type', 'audio/wav');
    res.send(wav);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Voice Design — generate 3 audio variants from a description.
// Caps: description ≤ 1500 chars, preview text ≤ 600 chars (each variant is
// a full TTS render so total cost = 3× preview).
router.post('/local-voices/design', requireAdmin, express.json({ limit: '16kb' }), async (req, res) => {
  try {
    const { description, text, language } = req.body || {};
    if (!description || !description.trim()) return res.status(400).json({ error: 'description required' });
    const variants = await localApi.designVoice({
      description: String(description).slice(0, 1500),
      text:        text ? String(text).slice(0, 600) : undefined,
      language:    language || 'ta',
    });
    res.json({ variants });
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
