/**
 * Escalation Service
 * Triggers external webhooks when a call needs human intervention
 */

const axios = require('axios');
const Call = require('../models/Call');
const Transcript = require('../models/Transcript');
const logger = require('../utils/logger');

async function triggerEscalationWebhook(callId, reason) {
  const webhookUrl = process.env.ESCALATION_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn('No ESCALATION_WEBHOOK_URL configured, skipping escalation webhook');
    return;
  }

  try {
    const call = await Call.findByPk(callId);
    const transcripts = await Transcript.findAll({
      where: { callId },
      order: [['turnNumber', 'ASC']],
      limit: 20,
    });

    const payload = {
      event: 'call_escalated',
      callId,
      callSid: call?.callSid,
      customerPhone: call?.toPhone,
      escalationReason: reason,
      conversationSummary: transcripts.map(t => ({
        speaker: t.speaker,
        text: t.text,
        intent: t.intent,
      })),
      timestamp: new Date().toISOString(),
    };

    await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
    });

    logger.info(`Escalation webhook sent for call ${callId}`);

  } catch (error) {
    logger.error('Escalation webhook failed:', error.message);
    // Non-fatal - call continues even if webhook fails
  }
}

module.exports = { triggerEscalationWebhook };
