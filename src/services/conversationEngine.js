/**
 * Conversation Flow Engine
 * Orchestrates the full conversation loop:
 * Play greeting → Listen → STT → Intent → LLM → TTS → Play → Repeat
 */

const fs   = require('fs');
const path = require('path');
const Call = require('../models/Call');
const Transcript = require('../models/Transcript');
const CallLog = require('../models/CallLog');
const { transcribeFromUrl } = require('./speechService');
const { synthesizeSpeech } = require('./speechService');
const {
  detectIntent,
  generateResponse,
  getConversationContext,
  updateConversationContext,
  incrementSilenceCount,
  clearConversationContext,
  shouldEscalate,
  getPromptText,
} = require('./aiService');
const {
  generateConversationExoML,
  generateEndCallExoML,
  generateEscalationExoML,
} = require('./telephonyService');
const { TAMIL_PROMPTS, CONFIDENCE_THRESHOLDS } = require('../config/tamilPrompts');
const { applyTemplate } = require('../utils/templateEngine');
const { notifyDashboard } = require('../websocket/wsServer');
const { triggerEscalationWebhook } = require('./escalationService');
const scriptEngine = require('./scriptEngine');
const { extractAndSavePreferences } = require('./preferenceService');
const logger = require('../utils/logger');

const WORKFLOWS_FILE = path.join(__dirname, '../../config/workflows.json');

const _greetingCache = new Map();
const _GREETING_CACHE_TTL = 120_000;

function setGreetingCache(callId, twiml, greetingText, audioUrl) {
  _greetingCache.set(callId, { twiml, greetingText, audioUrl, ts: Date.now() });
  setTimeout(() => _greetingCache.delete(callId), _GREETING_CACHE_TTL);
}

function getGreetingCache(callId) {
  const entry = _greetingCache.get(callId);
  if (!entry) return null;
  if (Date.now() - entry.ts > _GREETING_CACHE_TTL) {
    _greetingCache.delete(callId);
    return null;
  }
  _greetingCache.delete(callId);
  return entry;
}

function loadWorkflow(workflowId) {
  try {
    if (!fs.existsSync(WORKFLOWS_FILE)) return null;
    const wfs = JSON.parse(fs.readFileSync(WORKFLOWS_FILE, 'utf8'));
    return wfs.find(w => w.id === workflowId) || null;
  } catch { return null; }
}

function getScriptFlow(call) {
  const meta = call?.metadata;
  if (meta?.scriptFlow) {
    if (meta.scriptFlow.enabled && meta.scriptFlow.steps?.length > 0) return meta.scriptFlow;
    return null;
  }
  const wfId = meta?.workflowId || meta?.callType;
  if (wfId) {
    const wf = loadWorkflow(wfId);
    if (wf?.scriptFlow?.enabled && wf.scriptFlow.steps?.length > 0) return wf.scriptFlow;
  }
  return null;
}

/** Load a call's metadata from DB (for use in prompt variable substitution). */
async function getCallMeta(callId) {
  try {
    const c = await Call.findByPk(callId);
    return c?.metadata || {};
  } catch { return {}; }
}

/**
 * Process the initial call answer - play greeting
 * Returns TwiML to initiate the conversation
 */
async function processCallAnswer(callId) {
  const t0 = Date.now();
  logEvent(callId, 'call_answered', 'info', 'User answered the call');
  notifyDashboard({ type: 'CALL_STARTED', callId });

  const cached = getGreetingCache(callId);
  if (cached) {
    logger.info(`Greeting cache HIT for ${callId} — returning pre-built TwiML in ${Date.now() - t0}ms`);
    Call.update({ status: 'in-progress' }, { where: { id: callId } });
    saveTranscript(callId, 0, 'ai', cached.greetingText, null, 'greeting', 1.0, cached.audioUrl);

    const call = await Call.findByPk(callId);
    const scriptFlow = getScriptFlow(call);
    if (scriptFlow) {
      scriptEngine.startFlow(callId, scriptFlow);
      logEvent(callId, 'script_flow_started', 'info', `Script flow started (pre-cached)`);
    }
    return cached.twiml;
  }

  logger.info(`Greeting cache MISS for ${callId} — building TwiML from scratch`);
  const call = await Call.findByPk(callId);
  const t1 = Date.now();

  Call.update({ status: 'in-progress' }, { where: { id: callId } });

  const scriptFlow = getScriptFlow(call);
  let greetingText;
  const meta = call?.metadata || {};

  if (scriptFlow) {
    greetingText = scriptEngine.startFlow(callId, scriptFlow);
    logEvent(callId, 'script_flow_started', 'info', `Script flow started at step: ${scriptFlow.startStep}`);
    greetingText = applyTemplate(greetingText, meta);
  } else {
    greetingText = await getPromptText('GREETING', meta);
  }

  const t2 = Date.now();
  const tts = await synthesizeSpeech(greetingText);
  const t3 = Date.now();
  logger.info(`processCallAnswer timing: db=${t1-t0}ms script=${t2-t1}ms tts=${t3-t2}ms total=${t3-t0}ms`);

  saveTranscript(callId, 0, 'ai', greetingText, null, 'greeting', 1.0, tts.playableUrl);
  return generateConversationExoML(tts.playableUrl, callId, 0, greetingText);
}

/**
 * Process user speech input - the main conversation turn
 * @param {string} callId - Internal call ID
 * @param {number} turn - Current turn number
 * @param {string} speechResultUrl - URL to user's audio recording (from Twilio)
 * @param {string} speechResultText - Direct Twilio STT result (if available)
 */
async function processSpeechInput(callId, turn, speechResultUrl, speechResultText) {
  const startTime = Date.now();

  try {
    // ── Step 1: Get user text ─────────────────────────────────────────────
    let userText = speechResultText;

    if (!userText && speechResultUrl) {
      // Transcribe via Whisper — Exotel recordings need Basic Auth
      // Read credentials from app-settings.json first, fall back to env vars
      let _exoKey = process.env.EXOTEL_API_KEY;
      let _exoToken = process.env.EXOTEL_API_TOKEN;
      try {
        const _sf = path.join(__dirname, '../../config/app-settings.json');
        if (fs.existsSync(_sf)) {
          const _s = JSON.parse(fs.readFileSync(_sf, 'utf-8'));
          if (_s.exotelApiKey)   _exoKey   = _s.exotelApiKey;
          if (_s.exotelApiToken) _exoToken = _s.exotelApiToken;
        }
      } catch {}
      logger.info(`Downloading recording for STT: ${speechResultUrl}`);
      const sttResult = await transcribeFromUrl(
        speechResultUrl,
        _exoKey,
        _exoToken
      );
      userText = sttResult.text;

      logEvent(callId, 'stt_completed', 'info', `Transcribed: "${userText}"`, {
        confidence: sttResult.confidence,
        processingTimeMs: sttResult.processingTimeMs,
      });
    }

    if (!userText || userText.trim().length < 1) {
      return handleSilence(callId, turn);
    }

    // Save user speech to transcript (fire-and-forget)
    saveTranscript(callId, turn, 'user', userText, userText, 'user_speech', 1.0);

    // ── Check if this call is running a Q&A script flow ───────────────────
    const call = await Call.findByPk(callId);
    const scriptFlow = getScriptFlow(call);

    if (scriptFlow && scriptEngine.hasActiveFlow(callId)) {
      return await handleScriptFlowTurn(callId, turn, userText, scriptFlow, startTime);
    }

    // ── Free-form AI mode ─────────────────────────────────────────────────

    // ── Step 2: Detect intent ─────────────────────────────────────────────
    const callMeta = call?.metadata || {};
    const { intent, confidence, keywords } = await detectIntent(userText, callMeta);

    logEvent(callId, 'intent_detected', 'info', `Intent: ${intent}`, {
      confidence, keywords, userText,
    });

    // ── Step 3: Check escalation conditions ───────────────────────────────
    const escalationCheck = shouldEscalate(callId, confidence);

    if (intent === 'end_call' || intent === 'identity_deny' || intent === 'callback_request') {
      return handleEndCall(callId, turn, intent);
    }

    if (intent === 'human_request' || escalationCheck.escalate) {
      return handleEscalation(callId, turn, escalationCheck.reason || 'user_requested');
    }

    // ── Step 4: Generate AI response ──────────────────────────────────────
    const ctx = getConversationContext(callId);

    const aiResult = await generateResponse(
      intent,
      userText,
      ctx.history,
      call?.metadata || {}
    );

    updateConversationContext(callId, userText, aiResult.response, intent, confidence);

    // ── Step 5: Synthesize AI response to speech ──────────────────────────
    const tts = await synthesizeSpeech(aiResult.response);

    // Fire-and-forget: log, save transcript, notify — none block the response
    logEvent(callId, 'ai_response_generated', 'info', aiResult.response, {
      action: aiResult.action, processingTimeMs: aiResult.processingTimeMs,
    });
    logEvent(callId, 'tts_generated', 'info', 'TTS audio created', {
      audioUrl: tts.playableUrl, duration: tts.duration,
    });
    saveTranscript(
      callId, turn + 1, 'ai', aiResult.response, null,
      intent, aiResult.confidence, tts.playableUrl, Date.now() - startTime
    );
    notifyDashboard({ type: 'TURN_COMPLETED', callId, turn, intent });

    // Check if AI decided to escalate/end
    if (aiResult.action === 'escalate') {
      return handleEscalation(callId, turn, 'ai_decision');
    }

    if (aiResult.action === 'end_call') {
      return handleEndCall(callId, turn);
    }

    // ── Step 6: Return TwiML to play audio & continue ────────────────────
    return generateConversationExoML(tts.playableUrl, callId, turn + 1, aiResult.response);

  } catch (error) {
    logger.error(`Conversation processing error for call ${callId}:`, error?.message || error);
    await logEvent(callId, 'processing_error', 'error', error.message);

    // Play error fallback and continue
    const fallbackText = await getPromptText('FALLBACK_LOW_CONFIDENCE', await getCallMeta(callId));
    const fallbackTts = await synthesizeSpeech(fallbackText);
    return generateConversationExoML(fallbackTts.playableUrl, callId, turn + 1, fallbackText);
  }
}

/**
 * Handle a conversation turn using the predefined Q&A script flow.
 */
async function handleScriptFlowTurn(callId, turn, userText, scriptFlow, startTime) {
  logEvent(callId, 'script_flow_processing', 'info', `Matching: "${userText}"`);

  const meta = await getCallMeta(callId);
  const result = await scriptEngine.processStep(callId, userText, scriptFlow);
  const response = applyTemplate(result.response || '', meta);

  logEvent(callId, 'script_flow_matched', 'info', response, {
    done: result.done,
    escalate: result.escalate,
    outOfScope: result.outOfScope,
  });

  if (result.outOfScope) {
    const callMeta = meta;
    const { intent } = await detectIntent(userText, callMeta);
    const ctx = getConversationContext(callId);
    const aiResult = await generateResponse(intent, userText, ctx.history, callMeta);
    updateConversationContext(callId, userText, aiResult.response, intent, aiResult.confidence);

    const combinedResponse = aiResult.response;

    if (aiResult.action === 'escalate' || intent === 'human_request') {
      return handleEscalation(callId, turn, 'oos_user_requested');
    }
    if (aiResult.action === 'end_call' || intent === 'end_call' || intent === 'identity_deny' || intent === 'callback_request') {
      return handleEndCall(callId, turn, intent);
    }

    const tts = await synthesizeSpeech(combinedResponse);
    await saveTranscript(callId, turn + 1, 'ai', combinedResponse, null, `oos_${intent}`, aiResult.confidence, tts.playableUrl, Date.now() - startTime);
    await notifyDashboard({ type: 'TURN_COMPLETED', callId, turn, intent: `oos_${intent}` });
    return generateConversationExoML(tts.playableUrl, callId, turn + 1, combinedResponse);
  }

  if (result.escalate) {
    if (response) {
      const tts = await synthesizeSpeech(response);
      await saveTranscript(callId, turn + 1, 'ai', response, null, 'script_escalation', 1.0, tts.playableUrl, Date.now() - startTime);
    }
    return handleEscalation(callId, turn, 'script_no_match');
  }

  if (result.done) {
    const goodbyeText = response || await getPromptText('GOODBYE', meta);
    const tts = await synthesizeSpeech(goodbyeText);
    await saveTranscript(callId, turn + 1, 'ai', goodbyeText, null, 'script_complete', 1.0, tts.playableUrl, Date.now() - startTime);
    scriptEngine.clearFlow(callId);
    return generateEndCallExoML(tts.playableUrl, goodbyeText);
  }

  const tts = await synthesizeSpeech(response);
  await saveTranscript(callId, turn + 1, 'ai', response, null, 'script_response', 1.0, tts.playableUrl, Date.now() - startTime);

  await notifyDashboard({ type: 'TURN_COMPLETED', callId, turn, intent: 'script_flow' });
  return generateConversationExoML(tts.playableUrl, callId, turn + 1, response);
}

/**
 * Handle silence / no input from user
 */
async function handleSilence(callId, turn) {
  const silenceCount = incrementSilenceCount(callId);

  logEvent(callId, 'silence_detected', 'warn', `Silence count: ${silenceCount}`);

  if (silenceCount >= 3) {
    const meta = await getCallMeta(callId);
    const endText = applyTemplate(
      'சார், network issue-ஆ இருக்கலாம். அப்புறம் call பண்றோம் சார். நன்றி சார்.',
      meta
    );
    const tts = await synthesizeSpeech(endText);
    await saveTranscript(callId, turn, 'ai', endText, null, 'silence_end', 1.0, tts.playableUrl);
    clearConversationContext(callId);
    scriptEngine.clearFlow(callId);
    await Call.update({ status: 'completed', endedAt: new Date() }, { where: { id: callId } });
    return generateEndCallExoML(tts.playableUrl, endText);
  }

  const meta = await getCallMeta(callId);
  let silenceText;
  if (silenceCount === 1) {
    silenceText = await getPromptText('FALLBACK_SILENCE', meta);
  } else {
    silenceText = applyTemplate(
      'சார்? Line-ல இருக்கீங்களா? உங்க {{chitValue}} சீட் due பற்றி பேசுறேன் சார்.',
      meta
    );
  }

  const tts = await synthesizeSpeech(silenceText);
  await saveTranscript(callId, turn, 'ai', silenceText, null, 'silence_handler', 1.0, tts.playableUrl);

  return generateConversationExoML(tts.playableUrl, callId, turn, silenceText);
}

/**
 * Handle call end gracefully
 */
async function handleEndCall(callId, turn, endIntent) {
  logEvent(callId, 'call_ending', 'info', `Ending call: ${endIntent || 'normal'}`);

  const meta = await getCallMeta(callId);
  let goodbyeText;
  if (endIntent === 'identity_deny') {
    goodbyeText = 'மன்னிக்கணும் சார். Inconvenience-க்கு sorry சார். நன்றி சார். வணக்கம்.';
  } else if (endIntent === 'callback_request') {
    goodbyeText = applyTemplate(
      'சரி {{customerName}} சார்! அப்புறம் call பண்றோம் சார். Inconvenience-க்கு மன்னிக்கணும் சார். நன்றி சார்.',
      meta
    );
  } else {
    goodbyeText = await getPromptText('GOODBYE', meta);
  }

  const tts = await synthesizeSpeech(goodbyeText);
  await saveTranscript(callId, turn + 1, 'ai', goodbyeText, null, endIntent || 'end_call', 1.0, tts.playableUrl);

  clearConversationContext(callId);
  scriptEngine.clearFlow(callId);

  await Call.update({ status: 'completed', endedAt: new Date() }, { where: { id: callId } });
  extractAndSavePreferences(callId).catch(() => {});

  return generateEndCallExoML(tts.playableUrl);
}

/**
 * Handle escalation to human agent
 */
async function handleEscalation(callId, turn, reason) {
  logEvent(callId, 'escalating', 'warn', `Escalating: ${reason}`);

  const escalationText = await getPromptText('ESCALATION_MESSAGE', await getCallMeta(callId));
  const tts = await synthesizeSpeech(escalationText);
  await saveTranscript(callId, turn + 1, 'ai', escalationText, null, 'escalation', 1.0, tts.playableUrl);

  // Update call record
  await Call.update(
    { escalated: true, escalationReason: reason },
    { where: { id: callId } }
  );

  // Trigger external escalation webhook
  await triggerEscalationWebhook(callId, reason);
  await notifyDashboard({ type: 'CALL_ESCALATED', callId, reason });

  clearConversationContext(callId);
  extractAndSavePreferences(callId).catch(() => {});

  return generateEscalationExoML(tts.playableUrl, escalationText);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function saveTranscript(callId, turn, speaker, text, originalText, intent, confidence, audioUrl = null, processingTimeMs = null) {
  try {
    await Transcript.create({
      callId,
      turnNumber: turn,
      speaker,
      text,
      originalText: originalText || text,
      intent,
      confidence,
      audioUrl,
      processingTimeMs,
    });
  } catch (error) {
    logger.error('Failed to save transcript:', error.message);
  }
}

async function logEvent(callId, event, level, message, data = {}) {
  try {
    await CallLog.create({ callId, event, level, message, data });
  } catch (error) {
    logger.error('Failed to log event:', error.message);
  }
}

module.exports = {
  processCallAnswer,
  processSpeechInput,
  handleEndCall,
  handleEscalation,
  setGreetingCache,
};
