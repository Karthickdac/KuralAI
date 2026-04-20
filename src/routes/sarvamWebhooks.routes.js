/**
 * Sarvam engine — TwiML answer webhook.
 *
 * Twilio dials → fetches this URL on answer → we return TwiML that opens
 * a bidirectional Media Stream to /sarvam-stream where the conversation
 * loop lives.
 */
const express = require('express');
const logger = require('../utils/logger');
const { getSettingsSync } = require('../services/settingsService');

const router = express.Router();

router.post('/sarvam-voice', (req, res) => {
  const { callId, wt } = req.query;
  const s = getSettingsSync();
  const expected = s.webhookToken || s.exotelWebhookToken || process.env.EXOTEL_WEBHOOK_TOKEN || 'kuralai-wh';
  if (wt !== expected) {
    logger.warn(`[sarvam-voice] invalid webhook token for call ${callId}`);
    return res.status(403).type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
  }

  const appUrl  = (s.appUrl || process.env.APP_URL || '').replace(/\/$/, '');
  const wssBase = appUrl.replace(/^http/i, 'ws');
  const streamUrl = `${wssBase}/sarvam-stream?callId=${encodeURIComponent(callId || '')}&wt=${encodeURIComponent(expected)}`;

  // Optional disclaimer up front; Sarvam agent handles the rest via the stream.
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
    </Stream>
  </Connect>
</Response>`;

  logger.info(`[sarvam-voice] TwiML returned for call ${callId} → stream ${wssBase}/sarvam-stream`);
  res.type('text/xml').send(twiml);
});

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = router;
