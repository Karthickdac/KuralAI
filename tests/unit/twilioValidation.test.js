/**
 * Unit Tests: Twilio Webhook Validation Middleware
 */

const { validateTwilioSignature, webhookRateLimit } = require('../../src/middleware/twilioValidation');

function mockReq(overrides = {}) {
  return {
    headers: {
      'x-twilio-signature': 'valid-sig',
      'x-forwarded-proto': 'https',
      host: 'yourdomain.com',
    },
    ip: '127.0.0.1',
    originalUrl: '/webhook/call/answer?callId=abc',
    body: Buffer.from('CallSid=CA123&CallStatus=answered'),
    ...overrides,
  };
}

function mockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    sendStatus: jest.fn().mockReturnThis(),
  };
  return res;
}

describe('validateTwilioSignature', () => {
  test('skips validation in test environment (SKIP_TWILIO_VALIDATION=true)', () => {
    // setup.js sets SKIP_TWILIO_VALIDATION=true, so next() should always be called
    const next = jest.fn();
    const req = mockReq();
    const res = mockRes();

    validateTwilioSignature(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 403 when signature header is missing (in non-test env)', () => {
    // Temporarily disable test bypass
    const original = process.env.SKIP_TWILIO_VALIDATION;
    process.env.SKIP_TWILIO_VALIDATION = 'false';
    process.env.NODE_ENV = 'production';

    const next = jest.fn();
    const req = mockReq({ headers: { host: 'yourdomain.com' } }); // no signature
    const res = mockRes();

    validateTwilioSignature(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);

    // Restore
    process.env.SKIP_TWILIO_VALIDATION = original;
    process.env.NODE_ENV = 'test';
  });
});

describe('webhookRateLimit', () => {
  test('allows requests below threshold', () => {
    const next = jest.fn();
    const req = { ip: '10.0.0.100' };
    const res = mockRes();

    webhookRateLimit(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('calls next() for normal traffic', () => {
    const next = jest.fn();
    for (let i = 0; i < 5; i++) {
      webhookRateLimit({ ip: '10.0.0.200' }, mockRes(), next);
    }
    expect(next).toHaveBeenCalledTimes(5);
  });
});
