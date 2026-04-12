/**
 * Conversation Flow Engine
 * Orchestrates the full conversation loop:
 * Play greeting → Listen → STT → Intent → LLM → TTS → Play → Repeat
 */

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
  generateConversationTwiML,
  generateEndCallTwiML,
  generateEscalationTwiML,
} = require('./twilioService');
const { TAMIL_PROMPTS, CONFIDENCE_THRESHOLDS } = require('../config/tamilPrompts');
const { notifyDashboard } = require('../websocket/wsServer');
const { triggerEscalationWebhook } = require('./escalationService');
const logger = require('../utils/logger');

/**
 * Process the initial call answer - play greeting
 * Returns TwiML to initiate the conversation
 */
async function processCallAnswer(callId) {
  await logEvent(callId, 'call_answered', 'info', 'User answered the call');

  // Generate greeting audio via TTS
  const tts = await synthesizeSpeech(TAMIL_PROMPTS.GREETING);

  // Save AI turn to transcript
  await saveTranscript(callId, 0, 'ai', TAMIL_PROMPTS.GREETING, null, 'greeting', 1.0);

  // Update call status
  await Call.update(
    { status: 'in-progress', startedAt: new Date() },
    { where: { id: callId } }
  );

  await notifyDashboard({ type: 'CALL_STARTED', callId });

  return generateConversationTwiML(tts.playableUrl, callId, 0);
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
      // Transcribe via Whisper (better Tamil accuracy than Twilio STT)
      const sttResult = await transcribeFromUrl(
        speechResultUrl,
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
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

    // ── Step 2: Detect intent ─────────────────────────────────────────────
    const { intent, confidence, keywords } = await detectIntent(userText);

    await logEvent(callId, 'intent_detected', 'info', `Intent: ${intent}`, {
      confidence,
      keywords,
      userText,
    });

    // Save user turn to transcript
    await saveTranscript(callId, turn, 'user', userText, userText, intent, confidence);

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
    const call = await Call.findByPk(callId);

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

    // ── Step 6: Return TwiML to play audio & continue ─────────────────────
    await notifyDashboard({ type: 'TURN_COMPLETED', callId, turn, intent });

    return generateConversationTwiML(tts.playableUrl, callId, turn + 1);

  } catch (error) {
    logger.error(`Conversation processing error for call ${callId}:`, error);
    await logEvent(callId, 'processing_error', 'error', error.message);

    // Play error fallback and continue
    const fallbackTts = await synthesizeSpeech(TAMIL_PROMPTS.FALLBACK_LOW_CONFIDENCE);
    return generateConversationTwiML(fallbackTts.playableUrl, callId, turn + 1);
  }
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

  return generateConversationTwiML(tts.playableUrl, callId, turn);
}

/**
 * Handle call end gracefully
 */
async function handleEndCall(callId, turn) {
  await logEvent(callId, 'call_ending', 'info', 'Ending call normally');

  const tts = await synthesizeSpeech(TAMIL_PROMPTS.GOODBYE);
  await saveTranscript(callId, turn + 1, 'ai', TAMIL_PROMPTS.GOODBYE, null, 'end_call', 1.0);

  clearConversationContext(callId);

  return generateEndCallTwiML(tts.playableUrl);
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

  return generateEscalationTwiML(tts.playableUrl);
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
