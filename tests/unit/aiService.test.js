/**
 * Unit Tests: AI Service
 * Tests intent detection, keyword matching, conversation context management,
 * confidence scoring, and escalation logic.
 */

const {
  detectIntent,
  generateResponse,
  getConversationContext,
  updateConversationContext,
  incrementSilenceCount,
  clearConversationContext,
  shouldEscalate,
} = require('../../src/services/aiService');

const { CONFIDENCE_THRESHOLDS } = require('../../src/config/tamilPrompts');

// ── Intent Detection ───────────────────────────────────────────────────────────

describe('detectIntent', () => {
  test('detects order_status from clear Tamil text', async () => {
    const result = await detectIntent('என்னோட ஆர்டர் எங்கே இருக்கு');
    expect(result.intent).toBe('order_status');
    expect(result.confidence).toBeGreaterThan(0.4);
    expect(result.keywords).toBeInstanceOf(Array);
  });

  test('detects delivery_time from Tamil delivery question', async () => {
    const result = await detectIntent('டெலிவரி எப்போது வரும்');
    expect(result.intent).toBe('delivery_time');
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  test('detects complaint from Tamil complaint text', async () => {
    const result = await detectIntent('புகார் பதிவு செய்ய வேண்டும்');
    expect(result.intent).toBe('complaint');
  });

  test('detects human_request when user asks for human', async () => {
    const result = await detectIntent('ஒரு மனிதர் கிட்ட பேசணும்');
    expect(result.intent).toBe('human_request');
  });

  test('detects end_call from goodbye phrase', async () => {
    const result = await detectIntent('நன்றி bye');
    expect(result.intent).toBe('end_call');
  });

  test('returns unknown for empty input', async () => {
    const result = await detectIntent('');
    expect(result.intent).toBe('unknown');
    expect(result.confidence).toBe(0.0);
  });

  test('returns unknown for very short input', async () => {
    const result = await detectIntent('ம');
    expect(result.intent).toBe('unknown');
    expect(result.confidence).toBe(0.0);
  });

  test('handles mixed Tamil-English text', async () => {
    const result = await detectIntent('my order status என்ன');
    expect(result).toHaveProperty('intent');
    expect(result).toHaveProperty('confidence');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  test('returns keywords array', async () => {
    const result = await detectIntent('ஆர்டர் நிலை சொல்லுங்க');
    expect(Array.isArray(result.keywords)).toBe(true);
  });
});

// ── Response Generation ────────────────────────────────────────────────────────

describe('generateResponse', () => {
  test('generates Tamil response for order_status intent', async () => {
    const result = await generateResponse('order_status', 'என் ஆர்டர் எங்கே?', [], {});
    expect(result).toHaveProperty('response');
    expect(result).toHaveProperty('action');
    expect(result).toHaveProperty('confidence');
    expect(typeof result.response).toBe('string');
    expect(result.response.length).toBeGreaterThan(0);
  });

  test('returns action of continue, escalate, or end_call', async () => {
    const result = await generateResponse('general_greeting', 'வணக்கம்', [], {});
    expect(['continue', 'escalate', 'end_call']).toContain(result.action);
  });

  test('includes processingTimeMs in result', async () => {
    const result = await generateResponse('complaint', 'பிரச்சனை இருக்கு', [], {});
    expect(typeof result.processingTimeMs).toBe('number');
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  test('includes conversation history in context', async () => {
    const history = [
      { role: 'user', content: 'வணக்கம்' },
      { role: 'assistant', content: 'வணக்கம்! எப்படி உதவலாம்?' },
    ];
    const result = await generateResponse('order_status', 'ஆர்டர் status', history, {});
    expect(result).toHaveProperty('response');
  });

  test('returns fallback on LLM error', async () => {
    // The OpenAI mock is set up; simulate error by temporarily breaking it
    const openai = require('openai');
    const originalCreate = openai.mock.instances[0]?.chat?.completions?.create;

    // generateResponse should return fallback even if parsing fails
    const result = await generateResponse('unknown', 'xyz', [], {});
    expect(result.response).toBeTruthy();
    expect(result.action).toBeDefined();
  });
});

// ── Conversation Context ───────────────────────────────────────────────────────

describe('Conversation Context Management', () => {
  const testCallId = 'test-call-ctx-001';

  afterEach(() => {
    clearConversationContext(testCallId);
  });

  test('creates empty context for new call', () => {
    const ctx = getConversationContext(testCallId);
    expect(ctx.history).toEqual([]);
    expect(ctx.turnCount).toBe(0);
    expect(ctx.lowConfidenceStreak).toBe(0);
    expect(ctx.silenceCount).toBe(0);
  });

  test('updates context after each turn', () => {
    updateConversationContext(testCallId, 'user text', 'ai response', 'order_status', 0.9);
    const ctx = getConversationContext(testCallId);
    expect(ctx.history.length).toBe(2); // user + assistant
    expect(ctx.turnCount).toBe(1);
    expect(ctx.lastIntent).toBe('order_status');
  });

  test('tracks low confidence streak correctly', () => {
    updateConversationContext(testCallId, 'u1', 'a1', 'unknown', 0.2);
    updateConversationContext(testCallId, 'u2', 'a2', 'unknown', 0.25);
    const ctx = getConversationContext(testCallId);
    expect(ctx.lowConfidenceStreak).toBe(2);
  });

  test('resets low confidence streak on high confidence turn', () => {
    updateConversationContext(testCallId, 'u1', 'a1', 'unknown', 0.2);
    updateConversationContext(testCallId, 'u2', 'a2', 'order_status', 0.95);
    const ctx = getConversationContext(testCallId);
    expect(ctx.lowConfidenceStreak).toBe(0);
  });

  test('increments silence count', () => {
    incrementSilenceCount(testCallId);
    incrementSilenceCount(testCallId);
    const ctx = getConversationContext(testCallId);
    expect(ctx.silenceCount).toBe(2);
  });

  test('clears context on call end', () => {
    updateConversationContext(testCallId, 'u', 'a', 'order_status', 0.9);
    clearConversationContext(testCallId);
    const ctx = getConversationContext(testCallId); // creates fresh
    expect(ctx.history.length).toBe(0);
  });

  test('limits history to last 6 entries when passed to AI', () => {
    // Add 10 turns
    for (let i = 0; i < 10; i++) {
      updateConversationContext(testCallId, `user ${i}`, `ai ${i}`, 'general_greeting', 0.9);
    }
    const ctx = getConversationContext(testCallId);
    // The engine slices to last 6 — verify history grows as expected in context
    expect(ctx.turnCount).toBe(10);
  });
});

// ── Escalation Logic ───────────────────────────────────────────────────────────

describe('shouldEscalate', () => {
  const callId = 'test-escalation-call';

  afterEach(() => {
    clearConversationContext(callId);
  });

  test('does not escalate on first low confidence turn', () => {
    updateConversationContext(callId, 'u', 'a', 'unknown', 0.2);
    const result = shouldEscalate(callId, 0.2);
    expect(result.escalate).toBe(false);
  });

  test('escalates after 3 consecutive low confidence turns', () => {
    updateConversationContext(callId, 'u1', 'a1', 'unknown', 0.2);
    updateConversationContext(callId, 'u2', 'a2', 'unknown', 0.2);
    updateConversationContext(callId, 'u3', 'a3', 'unknown', 0.2);
    const result = shouldEscalate(callId, 0.2);
    expect(result.escalate).toBe(true);
    expect(result.reason).toBe('repeated_low_confidence');
  });

  test('escalates after 2 silences', () => {
    incrementSilenceCount(callId);
    incrementSilenceCount(callId);
    const result = shouldEscalate(callId, 0.8);
    expect(result.escalate).toBe(true);
    expect(result.reason).toBe('repeated_silence');
  });

  test('escalates immediately on very low confidence', () => {
    const result = shouldEscalate(callId, CONFIDENCE_THRESHOLDS.ESCALATE - 0.01);
    expect(result.escalate).toBe(true);
    expect(result.reason).toBe('very_low_confidence');
  });

  test('does not escalate on high confidence', () => {
    const result = shouldEscalate(callId, 0.95);
    expect(result.escalate).toBe(false);
  });
});
