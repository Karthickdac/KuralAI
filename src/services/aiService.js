/**
 * AI Service
 * LLM-powered Tamil conversation engine
 * Intent detection, response generation, confidence scoring
 */

const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const {
  TAMIL_PROMPTS,
  CONFIDENCE_THRESHOLDS,
  TAMIL_KEYWORDS
} = require('../config/tamilPrompts');

const SETTINGS_FILE = path.join(__dirname, '../../config/app-settings.json');

function getOpenAIKey() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      if (s.openaiApiKey && s.openaiApiKey.length > 20) return s.openaiApiKey;
    }
  } catch {}
  return process.env.OPENAI_API_KEY || 'placeholder';
}

let _openai = null;
let _openaiKey = null;
function getOpenAI() {
  const key = getOpenAIKey();
  if (!_openai || key !== _openaiKey) {
    _openai = new OpenAI({ apiKey: key });
    _openaiKey = key;
  }
  return _openai;
}
const openai = new Proxy({}, { get(_, prop) { return getOpenAI()[prop]; } });

// ─── Hardcoded Q&A Pairs (LLM-independent) ─────────────────────────────────────
// Any ONE keyword matching is enough to trigger the exact response.
const QA_PAIRS = [
  {
    intent: 'seat_due_status',
    keywords: [
      'இன்னொரு சீட்', 'இன்னொரு சீட்டு', 'மத்த சீட்', 'வேற சீட்',
      'எத்தனாவது due', 'எத்தனாவது டியூ', 'எத்தன due', 'எத்தன டியூ',
      'due போய்ட்டு', 'டியூ போய்ட்டு', 'due எத்தன', 'டியூ எத்தன',
    ],
    response: '6வது due சார்.',
    action: 'continue',
  },
  {
    intent: 'premature_withdrawal',
    keywords: [
      'இப்போ எடுத்தா', 'இப்பவே எடுத்தா', 'இப்போவே எடுத்தா',
      'எவ்ளோ அமௌன்ட்', 'எவ்வளவு அமௌன்ட்', 'எவ்ளோ குடுப்பிங்க', 'எவ்வளவு குடுப்பீங்க',
      'amount கிடைக்கும்', 'அமௌன்ட் கிடைக்கும்', 'premature', 'withdraw',
      'எடுத்தா எவ்ளோ', 'எடுத்தா எவ்வளவு',
    ],
    response: 'இப்போ எடுத்தா ₹3,55,000 சார்.',
    action: 'continue',
  },
  {
    intent: 'jamin_documents',
    keywords: [
      'jamin', 'ஜாமீன்', 'cheque leaf', 'cheque', 'செக்', 'document', 'டாக்யுமென்ட்',
      'என்ன குடுக்கணும்', 'என்ன குடுக்க', 'security', 'guarantee', 'guarantee என்ன',
      'என்னென்ன குடுக்கணும்',
    ],
    response: '2 family jamin, 2 other jamin, 4 cheque leaf குடுக்கணும் சார்.',
    action: 'continue',
  },
  {
    intent: 'payment_complaint',
    keywords: [
      'குடுக்க மாட்டிங்க', 'குடுக்க மாற்றிங்க', 'amount குடுக்க மாட்டிங்க',
      'பணம் இல்ல', 'காசு இல்ல', 'afford', 'கஷ்டம்',
      'மாசம் மாசம் கேக்குறீங்க', 'மாதம் மாதம் கேக்குறீங்க',
      'கேக்குறீங்க ஆனா', 'கேக்குறீங்க ஆனால்',
    ],
    response: 'மன்னிக்கணும் சார். உங்களுக்கு convenient-ஆன நேரம் பாத்து arrange பண்றோம் சார். கஷ்டப்படாதீங்க சார்.',
    action: 'continue',
  },
  {
    intent: 'reduce_calls',
    keywords: [
      'எத்தன பேரு கால்', 'எத்தன பேரு call', 'எத்தனை பேர் call',
      'யாரது ஒருத்தர்', 'ஒருத்தர் மட்டும் கால்', 'ஒருத்தர் மட்டும் call',
      'ஒருத்தர் பண்ணுங்க', 'ஒரே ஒருத்தர்', 'ஒரு பேரு மட்டும்',
    ],
    response: 'ஓகே சார். இனிமே ஒருத்தர் மட்டும் call பண்றோம் சார். Inconvenience-க்கு மன்னிக்கணும் சார். நன்றி சார்.',
    action: 'end_call',
  },
  {
    intent: 'no_office_calls',
    keywords: [
      'ஆஃபீஸ்ல இருந்து call', 'ஆஃபீஸ்ல இருந்து கால்', 'office-ல இருந்து',
      'ஆஃபீஸ்ல கால் பண்டீங்க', 'ஆஃபீஸ்ல call பண்டீங்க',
      'ஸ்டாஃப் கிட்ட கேட்டுக்குறோம்', 'staff கிட்ட கேட்டுக்கிறோம்',
      'ஆஃபீஸ்ல இருந்து வேண்டாம்',
    ],
    response: 'சரி சார். புரிஞ்சது. இனிமே ஆஃபீஸ்ல இருந்து call பண்ண மாட்டோம் சார். மன்னிக்கணும் சார். நன்றி சார்.',
    action: 'end_call',
  },
  {
    intent: 'lottery_participation',
    keywords: [
      'கலந்துக்கிறேன்', 'கலந்துக்கிறோம்', 'கலந்துக்க விரும்புறேன்',
      'interested', 'விருப்பம் இருக்கு', 'ஆமா கலந்துக்கிறேன்',
      'ஓகே கலந்துக்கிறேன்', 'சரி கலந்துக்கிறேன்', 'குலுக்கல் ஓகே',
    ],
    response: 'நல்லது சார்! அடுத்த மாசம் 7ம் தேதி குலுக்கல் சார். Due amount ₹18,750 தயாரா வைங்க சார். நன்றி சார்!',
    action: 'continue',
  },
  {
    intent: 'end_call',
    keywords: [
      'நன்றி சார்', 'சரி நன்றி', 'bye', 'போகிறேன்', 'வச்சுக்கோங்க',
      'வேண்டாம் நன்றி', 'ok thanks', 'முடிஞ்சது', 'வைங்க',
    ],
    response: 'நன்றி சார். வணக்கம் சார்! Good day சார்.',
    action: 'end_call',
  },
];

/**
 * Check if user text matches any known Q&A pair.
 * Matches if ANY single keyword is found in the text.
 * This runs before LLM — no API call needed.
 */
function findExactAnswer(userText) {
  const lower = userText.toLowerCase().trim();
  for (const qa of QA_PAIRS) {
    const matched = qa.keywords.filter(kw => lower.includes(kw.toLowerCase()));
    if (matched.length > 0) {
      logger.info(`Q&A match: intent="${qa.intent}" keyword="${matched[0]}"`);
      return {
        response: qa.response,
        intent: qa.intent,
        action: qa.action || 'continue',
        confidence: 0.95,
        data: {},
      };
    }
  }
  return null;
}

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

  // Step 0: Exact Q&A match → high confidence, no LLM needed
  const exact = findExactAnswer(userText);
  if (exact) {
    return { intent: exact.intent, confidence: 0.95, keywords: [] };
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

  // ── Step 0: Check exact Q&A lookup (no LLM needed) ──────────────────────
  const exact = findExactAnswer(userText);
  if (exact) {
    return { ...exact, processingTimeMs: Date.now() - startTime };
  }

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
    case 'seat_due_status':
      contextAddition = TAMIL_PROMPTS.SEAT_DUE_CONTEXT;
      break;
    case 'premature_withdrawal':
      contextAddition = TAMIL_PROMPTS.PREMATURE_WITHDRAWAL_CONTEXT;
      break;
    case 'jamin_documents':
      contextAddition = TAMIL_PROMPTS.JAMIN_CONTEXT;
      break;
    case 'payment_complaint':
      contextAddition = TAMIL_PROMPTS.PAYMENT_COMPLAINT_CONTEXT;
      break;
    case 'reduce_calls':
      contextAddition = TAMIL_PROMPTS.REDUCE_CALLS_CONTEXT;
      break;
    case 'no_office_calls':
      contextAddition = TAMIL_PROMPTS.NO_OFFICE_CALLS_CONTEXT;
      break;
    case 'lottery_participation':
      contextAddition = TAMIL_PROMPTS.LOTTERY_PARTICIPATION_CONTEXT;
      break;
    case 'human_request':
      return `${TAMIL_PROMPTS.SYSTEM_PROMPT}\n\nவாடிக்கையாளர் senior / manager-கிட்ட பேசணும்னு கேக்குறாங்க.
action: "escalate" என்று திரும்பவும்.
response: "${TAMIL_PROMPTS.HUMAN_REQUESTED}"`;
    case 'end_call':
      return `${TAMIL_PROMPTS.SYSTEM_PROMPT}\n\nவாடிக்கையாளர் call முடிக்கணும்னு சொல்றாங்க.
action: "end_call" என்று திரும்பவும்.
response: "${TAMIL_PROMPTS.GOODBYE}"`;
    default:
      contextAddition = TAMIL_PROMPTS.GENERAL_HELP_CONTEXT;
  }

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
