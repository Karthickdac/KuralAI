/**
 * Integration Tests: Call API
 * Tests the full HTTP request → controller → DB flow.
 * Uses supertest against the real Express app with SQLite in-memory.
 */

const request = require('supertest');
const { app } = require('../../src/server');
const { sequelize } = require('../../src/config/database');
const User = require('../../src/models/User');
const Call = require('../../src/models/Call');

let authToken;
let testCallId;

// ── Setup & Teardown ───────────────────────────────────────────────────────────

beforeAll(async () => {
  // Sync SQLite in-memory DB
  await sequelize.sync({ force: true });

  // Create test admin user
  await User.create({
    email: 'test@kuralai.com',
    password: 'TestPass@123',
    name: 'Test Admin',
    role: 'admin',
  });

  // Login to get JWT
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'test@kuralai.com', password: 'TestPass@123' });

  authToken = loginRes.body.token;
  expect(authToken).toBeDefined();
});

afterAll(async () => {
  await sequelize.close();
});

// ── Health Check ───────────────────────────────────────────────────────────────

describe('GET /health', () => {
  test('returns 200 with service info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('KuralAI');
  });
});

// ── Auth ───────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  test('returns JWT token on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@kuralai.com', password: 'TestPass@123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('test@kuralai.com');
    expect(res.body.user.password).toBeUndefined(); // never expose hash
  });

  test('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@kuralai.com', password: 'WrongPass' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  test('returns 401 on unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@kuralai.com', password: 'TestPass@123' });

    expect(res.status).toBe(401);
  });

  test('returns 400 on missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@kuralai.com' }); // no password

    expect(res.status).toBe(400);
  });
});

// ── Call Initiation ────────────────────────────────────────────────────────────

describe('POST /api/calls/initiate', () => {
  test('initiates a call and returns callId', async () => {
    const res = await request(app)
      .post('/api/calls/initiate')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ toPhone: '+919876543210', metadata: { customerName: 'Test User' } });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.callId).toBeDefined();
    expect(res.body.callSid).toMatch(/^CA/);
    expect(res.body.status).toBe('queued');

    testCallId = res.body.callId;
  });

  test('returns 400 for invalid phone number', async () => {
    const res = await request(app)
      .post('/api/calls/initiate')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ toPhone: 'not-a-phone' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  test('returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/calls/initiate')
      .send({ toPhone: '+919876543210' });

    expect(res.status).toBe(401);
  });

  test('returns 403 with invalid token', async () => {
    const res = await request(app)
      .post('/api/calls/initiate')
      .set('Authorization', 'Bearer invalid.token.here')
      .send({ toPhone: '+919876543210' });

    expect(res.status).toBe(403);
  });

  test('persists call to database', async () => {
    const res = await request(app)
      .post('/api/calls/initiate')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ toPhone: '+911234567890' });

    const callInDb = await Call.findByPk(res.body.callId);
    expect(callInDb).not.toBeNull();
    expect(callInDb.toPhone).toBe('+911234567890');
    expect(callInDb.status).toBe('queued');
    expect(callInDb.direction).toBe('outbound');
  });
});

// ── Call Status ────────────────────────────────────────────────────────────────

describe('GET /api/calls/:callId/status', () => {
  test('returns call status for valid callId', async () => {
    const res = await request(app)
      .get(`/api/calls/${testCallId}/status`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.call.id).toBe(testCallId);
    expect(res.body.call.status).toBeDefined();
  });

  test('returns 404 for non-existent callId', async () => {
    const res = await request(app)
      .get('/api/calls/00000000-0000-0000-0000-000000000000/status')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(404);
  });

  test('returns 400 for malformed UUID', async () => {
    const res = await request(app)
      .get('/api/calls/not-a-uuid/status')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
  });
});

// ── Call List ──────────────────────────────────────────────────────────────────

describe('GET /api/calls', () => {
  test('returns paginated call list', async () => {
    const res = await request(app)
      .get('/api/calls?page=1&limit=10')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.calls)).toBe(true);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.page).toBe(1);
  });

  test('filters by status', async () => {
    const res = await request(app)
      .get('/api/calls?status=queued')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    res.body.calls.forEach(call => {
      expect(call.status).toBe('queued');
    });
  });

  test('returns 400 for invalid status filter', async () => {
    const res = await request(app)
      .get('/api/calls?status=not-a-status')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
  });
});

// ── Dashboard Stats ────────────────────────────────────────────────────────────

describe('GET /api/dashboard/stats', () => {
  test('returns dashboard statistics', async () => {
    const res = await request(app)
      .get('/api/dashboard/stats?days=7')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats).toHaveProperty('totalCalls');
    expect(res.body.stats).toHaveProperty('completedCalls');
    expect(res.body.stats).toHaveProperty('successRate');
    expect(res.body.stats).toHaveProperty('escalatedCalls');
  });
});

describe('GET /api/dashboard/intents', () => {
  test('returns intent frequency data', async () => {
    const res = await request(app)
      .get('/api/dashboard/intents?days=7')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.intents)).toBe(true);
  });
});

// ── Transcripts ────────────────────────────────────────────────────────────────

describe('GET /api/transcripts/:callId', () => {
  test('returns transcript for valid call', async () => {
    const res = await request(app)
      .get(`/api/transcripts/${testCallId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.transcript)).toBe(true);
  });

  test('returns 404 for unknown callId', async () => {
    const res = await request(app)
      .get('/api/transcripts/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(404);
  });
});
