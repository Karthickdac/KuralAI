/**
 * Call Routes - /api/calls
 */

const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  initiateCallController,
  bulkCallController,
  getCallStatus,
  listCalls,
  retryCall,
} = require('../controllers/callController');

// All call routes require JWT auth
router.use(authenticateToken);

// POST /api/calls/initiate
router.post('/initiate',
  [
    body('toPhone').isMobilePhone().withMessage('Valid phone number required (E.164 format)'),
    body('metadata').optional().isObject(),
    body('maxRetries').optional().isInt({ min: 0, max: 5 }),
  ],
  validate,
  initiateCallController
);

// POST /api/calls/bulk
router.post('/bulk',
  [
    body('phones').optional().isArray(),
    body('customerIds').optional().isArray(),
    body('metadata').optional().isObject(),
    body('delayMs').optional().isInt({ min: 500, max: 10000 }),
  ],
  validate,
  bulkCallController
);

// GET /api/calls
router.get('/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['initiated', 'queued', 'ringing', 'answered', 'in-progress', 'completed', 'failed', 'busy', 'no-answer', 'canceled']),
  ],
  validate,
  listCalls
);

// GET /api/calls/export — CSV export (must come before /:callId/status)
router.get('/export', async (req, res) => {
  const { status, fromDate, toDate } = req.query;
  const { Op } = require('sequelize');
  const Call = require('../models/Call');

  const where = {};
  if (status) where.status = status;
  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt[Op.gte] = new Date(fromDate);
    if (toDate) where.createdAt[Op.lte] = new Date(toDate);
  }

  const calls = await Call.findAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: 5000,
  });

  const rows = calls.map(c => [
    c.id,
    c.toPhone,
    c.direction || 'outbound',
    c.status,
    c.duration || 0,
    c.retryCount || 0,
    c.escalated ? 'Yes' : 'No',
    c.escalationReason || '',
    c.callSid || '',
    new Date(c.createdAt).toISOString(),
    c.startedAt ? new Date(c.startedAt).toISOString() : '',
    c.endedAt ? new Date(c.endedAt).toISOString() : '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

  const header = '"ID","Phone","Direction","Status","Duration(s)","Retries","Escalated","Escalation Reason","Twilio SID","Created","Started","Ended"';
  const csv = [header, ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="kuralai-calls-${Date.now()}.csv"`);
  res.send(csv);
});

// GET /api/calls/:callId/status
router.get('/:callId/status',
  [param('callId').isUUID()],
  validate,
  getCallStatus
);

// POST /api/calls/:callId/retry
router.post('/:callId/retry',
  [param('callId').isUUID()],
  validate,
  retryCall
);

// POST /api/calls/:callId/recording/push — push recording to external system
router.post('/:callId/recording/push',
  [param('callId').isUUID()],
  validate,
  async (req, res) => {
    const axios = require('axios');
    const Call = require('../models/Call');
    const Transcript = require('../models/Transcript');
    const logger = require('../utils/logger');

    const call = await Call.findByPk(req.params.callId);
    if (!call) return res.status(404).json({ error: 'Call not found' });
    if (!call.recordingUrl) return res.status(400).json({ error: 'No recording available for this call' });

    const targetUrl = req.body.targetUrl || call.metadata?.callbackUrl;
    if (!targetUrl) return res.status(400).json({ error: 'targetUrl is required (or set callbackUrl in campaign)' });

    try {
      const transcripts = await Transcript.findAll({
        where: { callId: call.id },
        order: [['turnNumber', 'ASC']],
        attributes: ['turnNumber', 'speaker', 'text', 'intent', 'confidence'],
      });

      const payload = {
        callId: call.id,
        callSid: call.callSid,
        phone: call.toPhone,
        status: call.status,
        duration: call.duration,
        direction: call.direction,
        recordingUrl: call.recordingUrl,
        recordingSid: call.recordingSid,
        escalated: call.escalated,
        escalationReason: call.escalationReason,
        metadata: call.metadata,
        transcripts: transcripts.map(t => t.toJSON()),
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        pushedAt: new Date().toISOString(),
      };

      const response = await axios.post(targetUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });

      logger.info(`Recording pushed for call ${call.id} to ${targetUrl}: status=${response.status}`);
      res.json({ success: true, message: 'Recording and transcript pushed', targetStatus: response.status });
    } catch (err) {
      logger.error(`Recording push failed for call ${call.id}: ${err.message}`);
      res.status(502).json({ success: false, error: `Push failed: ${err.message}` });
    }
  }
);

router.get('/:callId/recording/stream', authMiddleware, async (req, res) => {
  const axios = require('axios');
  const fs = require('fs');
  const path = require('path');
  const Call = require('../models/Call');
  const logger = require('../utils/logger');

  const call = await Call.findByPk(req.params.callId);
  if (!call) return res.status(404).json({ error: 'Call not found' });
  if (!call.recordingUrl) return res.status(400).json({ error: 'No recording available' });

  let url = call.recordingUrl;
  if (url.includes('api.twilio.com') && !url.match(/\.\w{2,4}$/)) {
    url = url + '.mp3';
  }

  try {
    const settingsFile = path.join(__dirname, '../../config/app-settings.json');
    let authConfig = {};
    try {
      const s = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
      const sid = s.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
      const token = s.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;
      if (sid && token && url.includes('api.twilio.com')) {
        authConfig = { auth: { username: sid, password: token } };
        url = call.recordingUrl.replace(/\.\w{2,4}$/, '');
      }
    } catch {}

    const response = await axios.get(url, {
      ...authConfig,
      responseType: 'stream',
      timeout: 30000,
    });

    res.set('Content-Type', response.headers['content-type'] || 'audio/mpeg');
    if (response.headers['content-length']) res.set('Content-Length', response.headers['content-length']);
    res.set('Accept-Ranges', 'bytes');
    response.data.pipe(res);
  } catch (err) {
    logger.error(`Recording stream failed for call ${call.id}: ${err.message}`);
    res.redirect(url);
  }
});

module.exports = router;
