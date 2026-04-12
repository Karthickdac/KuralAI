/**
 * Unit Tests: Tamil Prompts & Configuration
 * Verifies prompt templates, keyword lists, and confidence thresholds.
 */

const { TAMIL_PROMPTS, CONFIDENCE_THRESHOLDS, TAMIL_KEYWORDS } = require('../../src/config/tamilPrompts');

describe('TAMIL_PROMPTS', () => {
  test('has a non-empty SYSTEM_PROMPT', () => {
    expect(typeof TAMIL_PROMPTS.SYSTEM_PROMPT).toBe('string');
    expect(TAMIL_PROMPTS.SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  test('SYSTEM_PROMPT contains JSON format instruction', () => {
    expect(TAMIL_PROMPTS.SYSTEM_PROMPT).toContain('JSON');
  });

  test('GREETING is defined and non-empty Tamil text', () => {
    expect(typeof TAMIL_PROMPTS.GREETING).toBe('string');
    expect(TAMIL_PROMPTS.GREETING.length).toBeGreaterThan(5);
  });

  test('all required prompt keys exist', () => {
    const requiredKeys = [
      'SYSTEM_PROMPT', 'GREETING', 'GREETING_REPEAT',
      'FALLBACK_LOW_CONFIDENCE', 'FALLBACK_SILENCE', 'FALLBACK_REPEATED',
      'ESCALATION_MESSAGE', 'HUMAN_REQUESTED', 'GOODBYE',
      'RECORDING_CONSENT', 'INTENT_DETECTION_PROMPT',
    ];
    requiredKeys.forEach(key => {
      expect(TAMIL_PROMPTS).toHaveProperty(key);
      expect(TAMIL_PROMPTS[key].length).toBeGreaterThan(0);
    });
  });

  test('INTENT_DETECTION_PROMPT contains {USER_TEXT} placeholder', () => {
    expect(TAMIL_PROMPTS.INTENT_DETECTION_PROMPT).toContain('{USER_TEXT}');
  });

  test('INTENT_DETECTION_PROMPT lists all 8 intents', () => {
    const prompt = TAMIL_PROMPTS.INTENT_DETECTION_PROMPT;
    ['order_status', 'delivery_time', 'complaint', 'product_info',
     'general_greeting', 'human_request', 'end_call', 'unknown'].forEach(intent => {
      expect(prompt).toContain(intent);
    });
  });
});

describe('CONFIDENCE_THRESHOLDS', () => {
  test('has correct threshold keys', () => {
    expect(CONFIDENCE_THRESHOLDS).toHaveProperty('HIGH');
    expect(CONFIDENCE_THRESHOLDS).toHaveProperty('MEDIUM');
    expect(CONFIDENCE_THRESHOLDS).toHaveProperty('LOW');
    expect(CONFIDENCE_THRESHOLDS).toHaveProperty('ESCALATE');
  });

  test('thresholds are ordered HIGH > MEDIUM > LOW > ESCALATE', () => {
    expect(CONFIDENCE_THRESHOLDS.HIGH).toBeGreaterThan(CONFIDENCE_THRESHOLDS.MEDIUM);
    expect(CONFIDENCE_THRESHOLDS.MEDIUM).toBeGreaterThan(CONFIDENCE_THRESHOLDS.LOW);
    expect(CONFIDENCE_THRESHOLDS.LOW).toBeGreaterThan(CONFIDENCE_THRESHOLDS.ESCALATE);
  });

  test('all thresholds are between 0 and 1', () => {
    Object.values(CONFIDENCE_THRESHOLDS).forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });
});

describe('TAMIL_KEYWORDS', () => {
  test('covers all 7 intent categories', () => {
    const expectedIntents = ['order_status', 'delivery_time', 'complaint', 'product_info', 'human_request', 'end_call'];
    expectedIntents.forEach(intent => {
      expect(TAMIL_KEYWORDS).toHaveProperty(intent);
      expect(Array.isArray(TAMIL_KEYWORDS[intent])).toBe(true);
      expect(TAMIL_KEYWORDS[intent].length).toBeGreaterThan(0);
    });
  });

  test('each keyword array has at least 3 entries', () => {
    Object.entries(TAMIL_KEYWORDS).forEach(([intent, keywords]) => {
      expect(keywords.length).toBeGreaterThanOrEqual(3),
        `Intent "${intent}" has only ${keywords.length} keyword(s)`;
    });
  });

  test('order_status keywords include ஆர்டர்', () => {
    expect(TAMIL_KEYWORDS.order_status).toContain('ஆர்டர்');
  });

  test('human_request keywords include human and agent', () => {
    expect(TAMIL_KEYWORDS.human_request).toContain('human');
    expect(TAMIL_KEYWORDS.human_request).toContain('agent');
  });
});
