/**
 * ElevenLabs Webhooks - /api/elevenlabs/webhooks/*
 *
 * Receives post-call events from ElevenLabs Conversational AI:
 *   - transcript (full conversation log)
 *   - call duration
 *   - audio recording URL (fetched on demand via /api/calls/:id/recording/stream)
 *   - analysis summary, data_collection_results, etc.
 *
 * Configure in ElevenLabs:
 *   Workspace Settings → Webhooks → Add → URL = https://artificialintellizence.com/api/elevenlabs/webhooks/post-call
 *   (Optional) Set a webhook secret and paste the same value into Settings → ElevenLabs Webhook Secret.
 */

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const Call    = require('../models/Call');
const Campaign = require('../models/Campaign');
const Transcript = require('../models/Transcript');
const logger  = require('../utils/logger');
const { getSettingsSync } = require('../services/settingsService');

// Verify ElevenLabs HMAC signature (header: ElevenLabs-Signature: t=<ts>,v0=<hmac>)
function verifySignature(rawBody, header, secret) {
  if (!secret || !header) return true; // skip if no secret configured
  try {
    const parts = String(header).split(',').reduce((acc, kv) => {
      const [k, v] = kv.split('=');
      acc[k.trim()] = v?.trim();
      return acc;
    }, {});
    const t = parts.t;
    const v0 = parts.v0;
    if (!t || !v0) return false;
    const payload = `${t}.${rawBody}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(v0, 'hex'), Buffer.from(expected, 'hex'));
  } catch (e) {
    logger.warn(`[ElevenLabs webhook] signature verify error: ${e.message}`);
    return false;
  }
}

// POST /api/elevenlabs/webhooks/post-call
// Body: { type, event_timestamp, data: { conversation_id, transcript, metadata, analysis, ... } }
router.post('/post-call', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const s = getSettingsSync();
    const secret = s.elevenlabsWebhookSecret || process.env.ELEVENLABS_WEBHOOK_SECRET;
    const sigHeader = req.get('ElevenLabs-Signature');

    if (secret) {
      const ok = verifySignature(JSON.stringify(req.body), sigHeader, secret);
      if (!ok) {
        logger.warn('[ElevenLabs webhook] invalid signature');
        return res.status(401).json({ ok: false, error: 'invalid signature' });
      }
    }

    const evt = req.body || {};
    const data = evt.data || evt;
    const eventType = String(evt.type || '').toLowerCase();
    const conversationId = data.conversation_id || data.conversationId;
    if (!conversationId) {
      logger.warn('[ElevenLabs webhook] no conversation_id in payload');
      return res.status(400).json({ ok: false, error: 'no conversation_id' });
    }

    logger.info(`[ElevenLabs webhook] received type=${eventType || 'unknown'} conversation=${conversationId}`);

    // Audio-only event: don't overwrite transcript/duration/status. Just ensure recordingUrl is set.
    if (eventType.includes('audio')) {
      const { Op: Op2, literal: lit2 } = require('sequelize');
      const safeId = String(conversationId).replace(/'/g, "''");
      const c = await Call.findOne({
        where: { [Op2.or]: [
          { callSid: conversationId },
          lit2(`"metadata"->'elevenlabs'->>'conversationId' = '${safeId}'`),
        ]},
        order: [['createdAt', 'DESC']],
      });
      if (c && !c.recordingUrl) {
        await c.update({ recordingUrl: `elevenlabs://${conversationId}` });
      }
      logger.info(`[ElevenLabs webhook] audio event noted for conversation=${conversationId} (transcript preserved)`);
      return res.json({ ok: true, audioOnly: true });
    }

    // Find the call by conversation_id stored in metadata (JSONB path query)
    const { Op, literal } = require('sequelize');
    const safeConvId = String(conversationId).replace(/'/g, "''");
    const call = await Call.findOne({
      where: {
        [Op.or]: [
          { callSid: conversationId },
          literal(`"metadata"->'elevenlabs'->>'conversationId' = '${safeConvId}'`),
        ],
      },
      order: [['createdAt', 'DESC']],
    });

    if (!call) {
      logger.warn(`[ElevenLabs webhook] no matching call for conversation=${conversationId}`);
      return res.status(202).json({ ok: true, matched: false });
    }

    const transcript = Array.isArray(data.transcript) ? data.transcript : [];
    const meta = data.metadata || {};
    const analysis = data.analysis || {};
    const durationSecs = meta.call_duration_secs || meta.duration_seconds || 0;
    const startUnix = meta.start_time_unix_secs;
    const callStatus = (data.status || '').toLowerCase();

    const transcriptText = transcript
      .map(t => `[${t.role}] ${t.message || t.text || ''}`)
      .join('\n');

    const update = {
      status: callStatus === 'failed' ? 'failed' : 'completed',
      duration: durationSecs,
      endedAt: new Date(),
      metadata: {
        ...(call.metadata || {}),
        elevenlabs: {
          ...((call.metadata || {}).elevenlabs || {}),
          conversationId,
          transcript,
          transcriptText,
          summary: analysis.transcript_summary || '',
          callSuccessful: analysis.call_successful,
          dataCollection: analysis.data_collection_results || {},
          startUnix,
          endedAt: Date.now(),
        },
      },
      // Pseudo-URL — recordingStream will fetch the audio from ElevenLabs API on demand
      recordingUrl: `elevenlabs://${conversationId}`,
    };
    if (startUnix && !call.startedAt) update.startedAt = new Date(startUnix * 1000);

    await call.update(update);
    logger.info(`[ElevenLabs webhook] call ${call.id} updated: duration=${durationSecs}s transcript=${transcript.length} turns`);

    // Mirror transcript turns into the Transcript table so the dashboard can show them
    if (transcript.length > 0) {
      try {
        await Transcript.destroy({ where: { callId: call.id } });
        const rows = transcript.map((t, i) => {
          const role = String(t.role || '').toLowerCase();
          const speaker = (role === 'user') ? 'user' : 'ai';
          const text = String(t.message || t.text || '').trim();
          return {
            callId: call.id,
            turnNumber: i + 1,
            speaker,
            text: text || '(empty)',
          };
        }).filter(r => r.text);
        if (rows.length) await Transcript.bulkCreate(rows);
        logger.info(`[ElevenLabs webhook] inserted ${rows.length} transcript rows for call ${call.id}`);
      } catch (e) {
        logger.warn(`[ElevenLabs webhook] transcript table insert failed: ${e.message}`);
      }
    }

    // Update campaign counters if this call belongs to one
    if (call.metadata?.campaignId) {
      try {
        const camp = await Campaign.findByPk(call.metadata.campaignId);
        if (camp) {
          if (update.status === 'completed') camp.completedCalls = (camp.completedCalls || 0) + 1;
          if (update.status === 'failed')    camp.failedCalls    = (camp.failedCalls    || 0) + 1;
          await camp.save();
        }
      } catch (e) {
        logger.warn(`[ElevenLabs webhook] campaign counter update failed: ${e.message}`);
      }
    }

    res.json({ ok: true, callId: call.id });
  } catch (err) {
    logger.error(`[ElevenLabs webhook] error: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
