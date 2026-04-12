/**
 * Integration Tests: Twilio Webhook Endpoints
 * Tests webhook handlers: call answer, speech input, silence, status, inbound.
 * Twilio signature validation is disabled in test mode.
 */

const request = require('supertest');
const { app } = require('../../src/server');
const { sequelize } = require('../../src/config/database');
const Call = require('../../src/models/Call');
const { v4: uuidv4 } = require('uuid');

// Seed a test call before each webhook test
let testCall;

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

beforeEach(async () => {
  testCall = await Call.create({
    id: uuidv4(),
    callSid: `CA${uuidv4().replace(/-/g, '').slice(0, 32)}`,
    toPhone: '+919876543210',
    fromPhone: '+15005550006',
    status: 'ringing',
    direction: 'outbound',
    maxRetries: 3,
  });
});

afterAll(async () => {
  await sequelize.close();
});

// ── Call Answer ────────────────────────────────────────────────────────────────

describe('POST /webhook/call/answer', () => {
  test('returns TwiML XML on valid call', async () => {
    const res = await request(app)
      .post(`/webhook/call/answer?callId=${testCall.id}`)
      .send(`CallSid=${testCall.callSid}&CallStatus=answered`)
      .set('Content-Type', 'application/x-www-form-urlencoded');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/xml/);
    expect(res.text).toContain('<Response>');
  });

  test('updates call status to answered in DB', async () => {
    await request(app)
      .post(`/webhook/call/answer?callId=${testCall.id}`)
      .send(`CallSid=${testCall.callSid}&CallStatus=answered`)
      .set('Content-Type', 'application/x-www-form-urlencoded');

    const updated = await Call.findByPk(testCall.id);
    expect(updated.status).toBe('answered');
    expect(updated.startedAt).not.toBeNull();
  });

  test('returns hangup TwiML for unknown callId', async () => {
    const res = await request(app)
      .post('/webhook/call/answer?callId=00000000-0000-0000-0000-000000000000')
      .send('CallSid=CAfake&CallStatus=answered')
      .set('Content-Type', 'application/x-www-form-urlencoded');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Hangup');
  });
});

// ── Speech Input ───────────────────────────────────────────────────────────────

describe('POST /webhook/call/speech', () => {
  test('processes speech and returns TwiML', async () => {
    // Put call in answered state first
    await testCall.update({ status: 'answered' });

    const res = await request(app)
      .post(`/webhook/call/speech?callId=${testCall.id}&turn=1`)
      .send('SpeechResult=என்னோட+ஆர்டர்+எங்கே+இருக்கு&Confidence=0.91')
      .set('Content-Type', 'application/x-www-form-urlencoded');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/xml/);
    expect(res.text).toContain('<Response>');
  });

  test('handles empty SpeechResult gracefully (silence)', async () => {
    const res = await request(app)
      .post(`/webhook/call/speech?callId=${testCall.id}&turn=2`)
      .send('SpeechResult=&Confidence=0')
      .set('Content-Type', 'application/x-www-form-urlencoded');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<Response>');
  });
});

// ── Silence Timeout ────────────────────────────────────────────────────────────

describe('POST /webhook/call/silence', () => {
  test('returns TwiML after silence timeout', async () => {
    const res = await request(app)
      .post(`/webhook/call/silence?callId=${testCall.id}&turn=1`)
      .send('CallSid=' + testCall.callSid)
      .set('Content-Type', 'application/x-www-form-urlencoded');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<Response>');
  });
});

// ── Call Status ────────────────────────────────────────────────────────────────

describe('POST /webhook/call/status', () => {
  test('updates call to completed status', async () => {
    const res = await request(app)
      .post(`/webhook/call/status?callId=${testCall.id}`)
      .send(`CallSid=${testCall.callSid}&CallStatus=completed&CallDuration=134`)
      .set('Content-Type', 'application/x-www-form-urlencoded');

    expect(res.status).toBe(200);
    const updated = await Call.findByPk(testCall.id);
    expect(updated.status).toBe('completed');
    expect(updated.duration).toBe(134);
    expect(updated.endedAt).not.toBeNull();
  });

  test('schedules retry for no-answer', async () => {
    const res = await request(app)
      .post(`/webhook/call/status?callId=${testCall.id}`)
      .send(`CallSid=${testCall.callSid}&CallStatus=no-answer&CallDuration=0`)
      .set('Content-Type', 'application/x-www-form-urlencoded');

    expect(res.status).toBe(200);
    const updated = await Call.findByPk(testCall.id);
    expect(updated.status).toBe('no-answer');
    expect(updated.nextRetryAt).not.toBeNull();
  });

  test('returns 200 for unknown callId gracefully', async () => {
    const res = await request(app)
      .post('/webhook/call/status?callId=00000000-0000-0000-0000-000000000000')
      .send('CallSid=CAfake&CallStatus=completed&CallDuration=0')
      .set('Content-Type', 'application/x-www-form-urlencoded');

    expect(res.status).toBe(200);
  });
});

// ── AMD ────────────────────────────────────────────────────────────────────────

describe('POST /webhook/call/amd', () => {
  test('hangs up on answering machine detection', async () => {
    const res = await request(app)
      .post(`/webhook/call/amd?callId=${testCall.id}`)
      .send('AnsweredBy=machine_end_beep')
      .set('Content-Type', 'application/x-www-form-urlencoded');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Hangup');

    const updated = await Call.findByPk(testCall.id);
    expect(updated.status).toBe('no-answer');
  });

  test('returns 200 (no action) for human detection', async () => {
    const res = await request(app)
      .post(`/webhook/call/amd?callId=${testCall.id}`)
      .send('AnsweredBy=human')
      .set('Content-Type', 'application/x-www-form-urlencoded');

    expect(res.status).toBe(200);
    // No hangup — the answer webhook handles the conversation
  });
});

// ── Inbound Call ───────────────────────────────────────────────────────────────

describe('POST /webhook/call/incoming', () => {
  test('creates call record and returns greeting TwiML', async () => {
    const res = await request(app)
      .post('/webhook/call/incoming')
      .send('CallSid=CAinbound123&From=%2B919876543210&To=%2B15005550006&CallStatus=ringing')
      .set('Content-Type', 'application/x-www-form-urlencoded');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/xml/);
    expect(res.text).toContain('<Response>');

    // Verify a call was created in DB with direction=inbound
    const inboundCall = await Call.findOne({
      where: { callSid: 'CAinbound123', direction: 'inbound' },
    });
    expect(inboundCall).not.toBeNull();
    expect(inboundCall.toPhone).toBe('+919876543210');
    expect(inboundCall.direction).toBe('inbound');
    expect(inboundCall.maxRetries).toBe(0);
  });
});
