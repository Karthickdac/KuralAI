/**
 * AI Service
 * LLM-powered Tamil conversation engine
 * Intent detection, response generation, confidence scoring
 */

const OpenAI = require('openai');
const logger = require('../utils/logger');
const {
  TAMIL_PROMPTS,
  CONFIDENCE_THRESHOLDS,
  TAMIL_KEYWORDS
} = require('../config/tamilPrompts');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Intent Detection ──────────────────────────────────────────────────────────

/**
 * Detect intent from Tamil user input
 * Uses keyword matching + LLM for maximum accuracy
 * @param {string} userText - Tamil text from STT
 * @returns {Object} { intent, confidence, keywords }
 */
async function detectIntent(userText) {
  if (!userText || userText.trim().length < 2) {
    return { intent: 'unknown', confidence: 0.0, keywords: [] };
  }

  // Step 1: Fast keyword-based pre-detection
  const keywordResult = keywordDetect(userText);

  // Step 2: If keyword confidence is high enough, skip LLM call
  if (keywordResult.confidence >= CONFIDENCE_THRESHOLDS.HIGH) {
    logger.debug(`Intent from keywords: ${keywordResult.intent} (${keywordResult.confidence})`);
    return keywordResult;
  }

  // Step 3: Use LLM for nuanced intent detection
  try {
    const prompt = TAMIL_PROMPTS.INTENT_DETECTION_PROMPT.replace('{USER_TEXT}', userText);

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 150,
      temperature: 0.1,
    });

    const result = JSON.parse(response.choices[0].message.content);

    // Combine keyword and LLM confidence
    let finalConfidence = result.confidence || 0.5;
    if (keywordResult.intent === result.intent) {
      // Both agree → boost confidence
      finalConfidence = Math.min(1.0, finalConfidence + 0.15);
    }

    logger.info(`Intent detected: ${result.intent} (confidence: ${finalConfidence.toFixed(2)})`);

    return {
      intent: result.intent || 'unknown',
      confidence: finalConfidence,
      keywords: result.keywords || keywordResult.keywords,
    };

  } catch (error) {
    logger.error('LLM intent detection error:', error.message);
    // Fall back to keyword detection
    return keywordResult;
  }
}

/**
 * Fast keyword-based intent detection (no API call)
 */
function keywordDetect(text) {
  const lower = text.toLowerCase();
  let bestIntent = 'unknown';
  let bestScore = 0;
  let matchedKeywords = [];

  for (const [intent, keywords] of Object.entries(TAMIL_KEYWORDS)) {
    const matches = keywords.filter(kw => lower.includes(kw.toLowerCase()));
    const score = matches.length / keywords.length;

    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
      matchedKeywords = matches;
    }
  }

  return {
    intent: bestIntent,
    confidence: Math.min(0.85, bestScore * 2), // Scale to 0-0.85 (LLM can reach 1.0)
    keywords: matchedKeywords,
  };
}

// ─── Response Generation ───────────────────────────────────────────────────────

/**
 * Generate AI response for a detected intent
 * Maintains conversation context across turns
 * @param {string} intent - Detected intent
 * @param {string} userText - User's Tamil input
 * @param {Array} conversationHistory - Previous turns [{role, content}]
 * @param {Object} callMetadata - Call context (order ID, customer info, etc.)
 * @returns {Object} { response, action, confidence, data }
 */
async function generateResponse(intent, userText, conversationHistory = [], callMetadata = {}) {
  const startTime = Date.now();

  // Build context-aware system prompt
  const systemPrompt = buildSystemPrompt(intent, callMetadata);

  // Prepare messages with conversation history (last 6 turns = 3 exchanges)
  const recentHistory = conversationHistory.slice(-6);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...recentHistory,
    { role: 'user', content: userText },
  ];

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages,
      response_format: { type: 'json_object' },
      max_tokens: 300,
      temperature: 0.7,
    });

    const result = JSON.parse(response.choices[0].message.content);
    const processingTime = Date.now() - startTime;

    logger.info(`AI response generated in ${processingTime}ms, action: ${result.action}`);

    return {
      response: result.response || TAMIL_PROMPTS.FALLBACK_LOW_CONFIDENCE,
      action: result.action || 'continue', // continue | escalate | end_call
      confidence: result.confidence || 0.7,
      intent: result.intent || intent,
      data: result.data || {},
      processingTimeMs: processingTime,
    };

  } catch (error) {
    logger.error('LLM response generation error:', error.message);

    // Return safe fallback
    return {
      response: TAMIL_PROMPTS.FALLBACK_LOW_CONFIDENCE,
      action: 'continue',
      confidence: 0.3,
      intent,
      data: {},
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Build intent-specific system prompt with context
 */
function buildSystemPrompt(intent, metadata = {}) {
  let contextAddition = '';

  switch (intent) {
    case 'order_status':
      contextAddition = TAMIL_PROMPTS.ORDER_STATUS_CONTEXT;
      if (metadata.orderId) contextAddition += `\nஆர்டர் எண்: ${metadata.orderId}`;
      break;
    case 'delivery_time':
      contextAddition = TAMIL_PROMPTS.DELIVERY_TIME_CONTEXT;
      break;
    case 'complaint':
      contextAddition = TAMIL_PROMPTS.COMPLAINT_CONTEXT;
      break;
    case 'product_info':
      contextAddition = TAMIL_PROMPTS.PRODUCT_INFO_CONTEXT;
      break;
    case 'human_request':
      return `${TAMIL_PROMPTS.SYSTEM_PROMPT}\n\nவாடிக்கையாளர் மனித ஊழியர் வேண்டும் என்று கேட்கிறார். 
action: "escalate" என்று திரும்பவும். 
response: "${TAMIL_PROMPTS.HUMAN_REQUESTED}"`;
    default:
      contextAddition = TAMIL_PROMPTS.GENERAL_HELP_CONTEXT;
  }

  // Add customer context if available
  if (metadata.customerName) {
    contextAddition += `\nவாடிக்கையாளர் பெயர்: ${metadata.customerName}`;
  }

  return `${TAMIL_PROMPTS.SYSTEM_PROMPT}\n\n${contextAddition}`;
}

// ─── Conversation Manager ──────────────────────────────────────────────────────

/**
 * In-memory conversation context store
 * For production, consider Redis for multi-instance support
 */
const conversationContexts = new Map();

/**
 * Get or create conversation context for a call
 */
function getConversationContext(callId) {
  if (!conversationContexts.has(callId)) {
    conversationContexts.set(callId, {
      history: [],
      turnCount: 0,
      lowConfidenceStreak: 0,
      silenceCount: 0,
      lastIntent: null,
    });
  }
  return conversationContexts.get(callId);
}

/**
 * Update conversation context after each turn
 */
function updateConversationContext(callId, userText, aiResponse, intent, confidence) {
  const ctx = getConversationContext(callId);

  // Add to history
  ctx.history.push({ role: 'user', content: userText });
  ctx.history.push({ role: 'assistant', content: aiResponse });
  ctx.turnCount++;
  ctx.lastIntent = intent;

  // Track low confidence streaks for escalation
  if (confidence < CONFIDENCE_THRESHOLDS.MEDIUM) {
    ctx.lowConfidenceStreak++;
  } else {
    ctx.lowConfidenceStreak = 0;
  }

  conversationContexts.set(callId, ctx);
  return ctx;
}

/**
 * Increment silence count
 */
function incrementSilenceCount(callId) {
  const ctx = getConversationContext(callId);
  ctx.silenceCount++;
  conversationContexts.set(callId, ctx);
  return ctx.silenceCount;
}

/**
 * Clear conversation context when call ends
 */
function clearConversationContext(callId) {
  conversationContexts.delete(callId);
}

/**
 * Determine if call should be escalated based on context
 * Escalate if: 3+ consecutive low confidence OR 2+ silences
 */
function shouldEscalate(callId, currentConfidence) {
  const ctx = getConversationContext(callId);

  if (ctx.lowConfidenceStreak >= 3) return { escalate: true, reason: 'repeated_low_confidence' };
  if (ctx.silenceCount >= 2) return { escalate: true, reason: 'repeated_silence' };
  if (currentConfidence < CONFIDENCE_THRESHOLDS.ESCALATE) return { escalate: true, reason: 'very_low_confidence' };

  return { escalate: false };
}

module.exports = {
  detectIntent,
  generateResponse,
  getConversationContext,
  updateConversationContext,
  incrementSilenceCount,
  clearConversationContext,
  shouldEscalate,
};
