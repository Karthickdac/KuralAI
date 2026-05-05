/**
 * Call Dispatcher
 *
 * Picks the right voice engine for a call:
 *   - 'kuralai'    → existing scripted engine (Twilio/Exotel + your conversationEngine)
 *   - 'elevenlabs' → ElevenLabs Conversational AI agent
 *   - 'sarvam'     → Sarvam.ai conversational engine (Indian voices)
 *   - 'local'      → Self-hosted inference server (KuralAI's own STT+LLM+TTS)
 *
 * Resolution order for the engine choice:
 *   1. Explicit `engine` argument (e.g. from controller)
 *   2. callMeta.engine
 *   3. campaign.engine (if callMeta.campaignId)
 *   4. Default: 'kuralai'
 */

const logger = require('../utils/logger');

async function resolveEngine(explicitEngine, callMeta = {}) {
  if (explicitEngine) return String(explicitEngine).toLowerCase();
  if (callMeta.engine) return String(callMeta.engine).toLowerCase();

  if (callMeta.campaignId) {
    try {
      const Campaign = require('../models/Campaign');
      const c = await Campaign.findByPk(callMeta.campaignId);
      if (c?.engine) return String(c.engine).toLowerCase();
    } catch {}
  }

  // Fallback: global default engine from app settings
  try {
    const { getSettings } = require('./settingsService');
    const s = await getSettings();
    if (s?.defaultEngine) return String(s.defaultEngine).toLowerCase();
  } catch {}

  return 'kuralai';
}

async function dispatchCall(toPhone, callId, callMeta = {}, explicitEngine = null) {
  const engine = await resolveEngine(explicitEngine, callMeta);

  if (engine === 'elevenlabs') {
    logger.info(`[dispatcher] engine=elevenlabs call=${callId}`);
    const { initiateCall } = require('./elevenlabsCallService');
    return initiateCall(toPhone, callId, callMeta);
  }

  if (engine === 'sarvam') {
    logger.info(`[dispatcher] engine=sarvam call=${callId}`);
    const { initiateCall } = require('./sarvamCallService');
    return initiateCall(toPhone, callId, callMeta);
  }

  if (engine === 'local') {
    logger.info(`[dispatcher] engine=local call=${callId}`);
    const { initiateCall } = require('./localCallService');
    return initiateCall(toPhone, callId, callMeta);
  }

  // Default: existing engine via telephony abstraction
  logger.info(`[dispatcher] engine=kuralai call=${callId}`);
  const { initiateCall } = require('./telephonyService');
  return initiateCall(toPhone, callId, callMeta);
}

module.exports = { dispatchCall, resolveEngine };
