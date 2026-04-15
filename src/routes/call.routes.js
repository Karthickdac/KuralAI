const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenant');
const { validate } = require('../middleware/validate');
const { requireCredits } = require('../middleware/planLimits');
const {
  initiateCallController,
  bulkCallController,
  getCallStatus,
  listCalls,
  retryCall,
} = require('../controllers/callController');

router.use(authenticateToken);
router.use(tenantScope);

router.post('/initiate',
  [
    body('toPhone').isMobilePhone().withMessage('Valid phone number required (E.164 format)'),
    body('metadata').optional().isObject(),
    body('maxRetries').optional().isInt({ min: 0, max: 5 }),
  ],
  validate,
  requireCredits(2),
  initiateCallController
);

router.post('/bulk',
  [
    body('phones').optional().isArray(),
    body('customerIds').optional().isArray(),
    body('metadata').optional().isObject(),
    body('delayMs').optional().isInt({ min: 500, max: 10000 }),
  ],
  validate,
  requireCredits(2),
  bulkCallController
);

router.get('/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['initiated', 'queued', 'ringing', 'answered', 'in-progress', 'completed', 'failed', 'busy', 'no-answer', 'canceled']),
  ],
  validate,
  listCalls
);

router.get('/export', async (req, res) => {
  const { status, fromDate, toDate } = req.query;
  const { Op } = require('sequelize');
  const Call = require('../models/Call');
  const orgFilter = req.tenantScope || {};

  const where = { ...orgFilter };
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

router.get('/:callId/status',
  [param('callId').isUUID()],
  validate,
  getCallStatus
);

router.post('/:callId/retry',
  [param('callId').isUUID()],
  validate,
  requireCredits(2),
  retryCall
);

router.post('/:callId/recording/push',
  [param('callId').isUUID()],
  validate,
  async (req, res) => {
    const axios = require('axios');
    const Call = require('../models/Call');
    const Transcript = require('../models/Transcript');
    const logger = require('../utils/logger');
    const orgFilter = req.tenantScope || {};

    const call = await Call.findOne({ where: { id: req.params.callId, ...orgFilter } });
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

module.exports = router;
