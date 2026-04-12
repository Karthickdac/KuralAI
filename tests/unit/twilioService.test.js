/**
 * Unit Tests: Twilio Service
 * Tests TwiML generation, call initiation, and signature validation.
 */

const {
  generateAnswerTwiML,
  generateConversationTwiML,
  generateEndCallTwiML,
  generateEscalationTwiML,
  initiateCall,
} = require('../../src/services/twilioService');

describe('generateAnswerTwiML', () => {
  test('returns a valid XML string', () => {
    const twiml = generateAnswerTwiML('test-call-001');
    expect(typeof twiml).toBe('string');
    expect(twiml).toContain('<Response>');
  });

  test('contains redirect to conversation endpoint', () => {
    const twiml = generateAnswerTwiML('test-call-001');
    expect(twiml).toContain('conversation');
    expect(twiml).toContain('test-call-001');
  });
});

describe('generateConversationTwiML', () => {
  const audioUrl = 'https://s3.amazonaws.com/bucket/test.mp3?sig=fake';

  test('returns valid XML', () => {
    const twiml = generateConversationTwiML(audioUrl, 'call-002', 1);
    expect(typeof twiml).toBe('string');
    expect(twiml).toContain('<Response>');
  });

  test('includes the audio URL to play', () => {
    const twiml = generateConversationTwiML(audioUrl, 'call-002', 1);
    expect(twiml).toContain(audioUrl);
  });

  test('includes speech gather with Tamil language', () => {
    const twiml = generateConversationTwiML(audioUrl, 'call-002', 1);
    expect(twiml).toContain('ta-IN');
  });

  test('includes correct turn number in action URL', () => {
    const twiml = generateConversationTwiML(audioUrl, 'call-002', 3);
    expect(twiml).toContain('turn=4'); // next turn = current + 1
  });

  test('includes silence redirect fallback', () => {
    const twiml = generateConversationTwiML(audioUrl, 'call-002', 2);
    expect(twiml).toContain('silence');
  });
});

describe('generateEndCallTwiML', () => {
  test('returns valid XML with hangup', () => {
    const twiml = generateEndCallTwiML('https://s3.amazonaws.com/bucket/goodbye.mp3?sig=fake');
    expect(typeof twiml).toBe('string');
    expect(twiml).toContain('Hangup');
  });

  test('includes audio URL when provided', () => {
    const url = 'https://s3.amazonaws.com/bucket/goodbye.mp3?sig=fake';
    const twiml = generateEndCallTwiML(url);
    expect(twiml).toContain(url);
  });

  test('falls back to Say when no audio URL', () => {
    const twiml = generateEndCallTwiML(null);
    expect(twiml).toContain('Say');
    expect(twiml).toContain('Hangup');
  });
});

describe('generateEscalationTwiML', () => {
  test('returns valid XML', () => {
    const twiml = generateEscalationTwiML('https://s3.amazonaws.com/bucket/escalate.mp3?sig=fake');
    expect(typeof twiml).toBe('string');
    expect(twiml).toContain('<Response>');
  });

  test('includes Dial when ESCALATION_PHONE is set', () => {
    process.env.ESCALATION_PHONE = '+15005550006';
    const twiml = generateEscalationTwiML(null);
    expect(twiml).toContain('Dial');
    expect(twiml).toContain('+15005550006');
  });
});

describe('initiateCall', () => {
  test('calls Twilio API and returns call object', async () => {
    const result = await initiateCall('+919876543210', 'test-call-id', { customerName: 'Test' });
    expect(result).toBeDefined();
    expect(result.sid).toBeDefined();
    expect(result.sid).toMatch(/^CA/);
  });

  test('constructs webhook URLs with callId', async () => {
    const twilio = require('twilio');
    await initiateCall('+919876543210', 'abc-call-id', {});
    const createCall = twilio.mock.instances[0].calls.create;
    expect(createCall).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('abc-call-id'),
        statusCallback: expect.stringContaining('abc-call-id'),
      })
    );
  });
});
