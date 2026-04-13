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

module.exports = router;
