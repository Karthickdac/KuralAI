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
} = require('./aiService');
const {
  generateConversationExoML,
  generateEndCallExoML,
  generateEscalationExoML,
} = require('./exotelService');
const { TAMIL_PROMPTS, CONFIDENCE_THRESHOLDS } = require('../config/tamilPrompts');
const { notifyDashboard } = require('../websocket/wsServer');
const { triggerEscalationWebhook } = require('./escalationService');
const scriptEngine = require('./scriptEngine');
const logger = require('../utils/logger');

const WORKFLOWS_FILE = path.join(__dirname, '../../config/workflows.json');

function loadWorkflow(workflowId) {
  try {
    if (!fs.existsSync(WORKFLOWS_FILE)) return null;
    const wfs = JSON.parse(fs.readFileSync(WORKFLOWS_FILE, 'utf8'));
    return wfs.find(w => w.id === workflowId) || null;
  } catch { return null; }
}

function getScriptFlow(call) {
  if (call?.metadata?.scriptFlow?.enabled) return call.metadata.scriptFlow;
  if (call?.metadata?.workflowId) {
    const wf = loadWorkflow(call.metadata.workflowId);
    if (wf?.scriptFlow?.enabled) return wf.scriptFlow;
  }
  return null;
}

/**
 * Process the initial call answer - play greeting
 * Returns TwiML to initiate the conversation
 */
async function processCallAnswer(callId) {
  await logEvent(callId, 'call_answered', 'info', 'User answered the call');

  await Call.update(
    { status: 'in-progress', startedAt: new Date() },
    { where: { id: callId } }
  );
  await notifyDashboard({ type: 'CALL_STARTED', callId });

  const call = await Call.findByPk(callId);
  const scriptFlow = getScriptFlow(call);

  let greetingText;

  if (scriptFlow) {
    // Script flow mode — start with the first step's agent message
    greetingText = scriptEngine.startFlow(callId, scriptFlow);
    await logEvent(callId, 'script_flow_started', 'info', `Script flow started at step: ${scriptFlow.startStep}`);
  } else {
    // Free-form AI mode — use default greeting
    greetingText = TAMIL_PROMPTS.GREETING;
  }

  const tts = await synthesizeSpeech(greetingText);
  await saveTranscript(callId, 0, 'ai', greetingText, null, 'greeting', 1.0);

  return generateConversationExoML(tts.playableUrl, callId, 0);
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
      // Transcribe via Whisper (better Tamil accuracy than STT from provider)
      // Exotel recordings are accessible with EXOTEL_API_KEY:EXOTEL_API_TOKEN Basic Auth
      const sttResult = await transcribeFromUrl(
        speechResultUrl,
        process.env.EXOTEL_API_KEY,
        process.env.EXOTEL_API_TOKEN
      );
      userText = sttResult.text;

      await logEvent(callId, 'stt_completed', 'info', `Transcribed: "${userText}"`, {
        confidence: sttResult.confidence,
        processingTimeMs: sttResult.processingTimeMs,
      });
    }

    if (!userText || userText.trim().length < 2) {
      return handleSilence(callId, turn);
    }

    // Save user speech to transcript
    await saveTranscript(callId, turn, 'user', userText, userText, 'user_speech', 1.0);

    // ── Check if this call is running a Q&A script flow ───────────────────
    const call = await Call.findByPk(callId);
    const scriptFlow = getScriptFlow(call);

    if (scriptFlow && scriptEngine.hasActiveFlow(callId)) {
      return await handleScriptFlowTurn(callId, turn, userText, scriptFlow, startTime);
    }

    // ── Free-form AI mode ─────────────────────────────────────────────────

    // ── Step 2: Detect intent ─────────────────────────────────────────────
    const { intent, confidence, keywords } = await detectIntent(userText);

    await logEvent(callId, 'intent_detected', 'info', `Intent: ${intent}`, {
      confidence,
      keywords,
      userText,
    });

    // ── Step 3: Check escalation conditions ───────────────────────────────
    const escalationCheck = shouldEscalate(callId, confidence);

    if (intent === 'end_call') {
      return handleEndCall(callId, turn);
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

    // Update conversation context
    updateConversationContext(callId, userText, aiResult.response, intent, confidence);

    await logEvent(callId, 'ai_response_generated', 'info', aiResult.response, {
      action: aiResult.action,
      processingTimeMs: aiResult.processingTimeMs,
    });

    // Check if AI decided to escalate/end
    if (aiResult.action === 'escalate') {
      return handleEscalation(callId, turn, 'ai_decision');
    }

    if (aiResult.action === 'end_call') {
      return handleEndCall(callId, turn);
    }

    // ── Step 5: Synthesize AI response to speech ──────────────────────────
    const tts = await synthesizeSpeech(aiResult.response);

    await logEvent(callId, 'tts_generated', 'info', 'TTS audio created', {
      audioUrl: tts.s3Url,
      duration: tts.duration,
    });

    // Save AI turn to transcript
    await saveTranscript(
      callId,
      turn + 1,
      'ai',
      aiResult.response,
      null,
      intent,
      aiResult.confidence,
      tts.s3Url,
      Date.now() - startTime
    );

    // ── Step 6: Return ExoML to play audio & continue ────────────────────
    await notifyDashboard({ type: 'TURN_COMPLETED', callId, turn, intent });

    return generateConversationExoML(tts.playableUrl, callId, turn + 1);

  } catch (error) {
    logger.error(`Conversation processing error for call ${callId}:`, error);
    await logEvent(callId, 'processing_error', 'error', error.message);

    // Play error fallback and continue
    const fallbackTts = await synthesizeSpeech(TAMIL_PROMPTS.FALLBACK_LOW_CONFIDENCE);
    return generateConversationExoML(fallbackTts.playableUrl, callId, turn + 1);
  }
}

/**
 * Handle a conversation turn using the predefined Q&A script flow.
 */
async function handleScriptFlowTurn(callId, turn, userText, scriptFlow, startTime) {
  await logEvent(callId, 'script_flow_processing', 'info', `Matching: "${userText}"`);

  const result = await scriptEngine.processStep(callId, userText, scriptFlow);

  await logEvent(callId, 'script_flow_matched', 'info', result.response, {
    done: result.done,
    escalate: result.escalate,
  });

  if (result.escalate) {
    if (result.response) {
      const tts = await synthesizeSpeech(result.response);
      await saveTranscript(callId, turn + 1, 'ai', result.response, null, 'script_escalation', 1.0, tts.s3Url, Date.now() - startTime);
      // Play response then escalate
      return generateConversationExoML(tts.playableUrl, callId, turn + 1);
    }
    return handleEscalation(callId, turn, 'script_no_match');
  }

  if (result.done) {
    const goodbyeText = result.response || TAMIL_PROMPTS.GOODBYE;
    const tts = await synthesizeSpeech(goodbyeText);
    await saveTranscript(callId, turn + 1, 'ai', goodbyeText, null, 'script_complete', 1.0, tts.s3Url, Date.now() - startTime);
    scriptEngine.clearFlow(callId);
    return generateEndCallExoML(tts.playableUrl);
  }

  const tts = await synthesizeSpeech(result.response);
  await saveTranscript(callId, turn + 1, 'ai', result.response, null, 'script_response', 1.0, tts.s3Url, Date.now() - startTime);

  await notifyDashboard({ type: 'TURN_COMPLETED', callId, turn, intent: 'script_flow' });
  return generateConversationExoML(tts.playableUrl, callId, turn + 1);
}

/**
 * Handle silence / no input from user
 */
async function handleSilence(callId, turn) {
  const silenceCount = incrementSilenceCount(callId);

  await logEvent(callId, 'silence_detected', 'warn', `Silence count: ${silenceCount}`);

  if (silenceCount >= 2) {
    // Too many silences - end the call
    return handleEndCall(callId, turn);
  }

  // Ask user to repeat
  const tts = await synthesizeSpeech(TAMIL_PROMPTS.FALLBACK_SILENCE);
  await saveTranscript(callId, turn, 'ai', TAMIL_PROMPTS.FALLBACK_SILENCE, null, 'silence_handler', 1.0);

  return generateConversationExoML(tts.playableUrl, callId, turn);
}

/**
 * Handle call end gracefully
 */
async function handleEndCall(callId, turn) {
  await logEvent(callId, 'call_ending', 'info', 'Ending call normally');

  const tts = await synthesizeSpeech(TAMIL_PROMPTS.GOODBYE);
  await saveTranscript(callId, turn + 1, 'ai', TAMIL_PROMPTS.GOODBYE, null, 'end_call', 1.0);

  clearConversationContext(callId);
  scriptEngine.clearFlow(callId);

  return generateEndCallExoML(tts.playableUrl);
}

/**
 * Handle escalation to human agent
 */
async function handleEscalation(callId, turn, reason) {
  await logEvent(callId, 'escalating', 'warn', `Escalating: ${reason}`);

  const tts = await synthesizeSpeech(TAMIL_PROMPTS.ESCALATION_MESSAGE);
  await saveTranscript(callId, turn + 1, 'ai', TAMIL_PROMPTS.ESCALATION_MESSAGE, null, 'escalation', 1.0);

  // Update call record
  await Call.update(
    { escalated: true, escalationReason: reason },
    { where: { id: callId } }
  );

  // Trigger external escalation webhook
  await triggerEscalationWebhook(callId, reason);
  await notifyDashboard({ type: 'CALL_ESCALATED', callId, reason });

  clearConversationContext(callId);

  return generateEscalationExoML(tts.playableUrl);
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
};
