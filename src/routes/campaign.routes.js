const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenant');
const { validate } = require('../middleware/validate');
const { checkPlanLimit, requireCredits } = require('../middleware/planLimits');
const Campaign = require('../models/Campaign');
const {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
} = require('../controllers/campaignController');

router.use(authenticateToken);
router.use(tenantScope);

router.get('/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled']),
  ],
  validate,
  listCampaigns
);

router.get('/reports/summary', async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const orgFilter = req.tenantScope || {};
    const { days = 30 } = req.query;
    const since = new Date(Date.now() - Number(days) * 86400000);

    const campaigns = await Campaign.findAll({
      where: { ...orgFilter, createdAt: { [Op.gte]: since } },
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'name', 'type', 'status', 'totalCalls', 'completedCalls', 'answeredCalls', 'failedCalls', 'startedAt', 'completedAt', 'createdAt', 'customerIds', 'callIds'],
    });

    const totals = { campaigns: campaigns.length, totalCalls: 0, completedCalls: 0, answeredCalls: 0, failedCalls: 0, byStatus: {}, byType: {} };
    campaigns.forEach(c => {
      totals.totalCalls += c.totalCalls || 0;
      totals.completedCalls += c.completedCalls || 0;
      totals.answeredCalls += c.answeredCalls || 0;
      totals.failedCalls += c.failedCalls || 0;
      totals.byStatus[c.status] = (totals.byStatus[c.status] || 0) + 1;
      totals.byType[c.type] = (totals.byType[c.type] || 0) + 1;
    });

    const rows = campaigns.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      status: c.status,
      totalCalls: c.totalCalls,
      completedCalls: c.completedCalls,
      answeredCalls: c.answeredCalls,
      failedCalls: c.failedCalls,
      customerCount: (c.customerIds || []).length,
      successRate: c.totalCalls > 0 ? Math.round((c.completedCalls / c.totalCalls) * 100) : 0,
      startedAt: c.startedAt,
      completedAt: c.completedAt,
      createdAt: c.createdAt,
    }));

    res.json({ totals, campaigns: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id',
  [param('id').isUUID()],
  validate,
  getCampaign
);

router.post('/',
  [
    body('name').isString().notEmpty(),
    body('type').optional().isIn(['due_reminder', 'lottery_participation', 'payment_followup', 'custom']),
    body('customerIds').isArray({ min: 1 }),
    body('concurrency').optional().isInt({ min: 1, max: 10 }),
    body('scheduledAt').optional().isISO8601(),
    body('metadata').optional().isObject(),
    body('workflowId').optional().isString(),
    body('recordCalls').optional().isBoolean(),
    body('callbackUrl').optional().isURL(),
  ],
  validate,
  checkPlanLimit('campaigns'),
  createCampaign
);

router.put('/:id',
  [param('id').isUUID()],
  validate,
  updateCampaign
);

router.delete('/:id',
  [param('id').isUUID()],
  validate,
  deleteCampaign
);

router.post('/:id/start',
  [param('id').isUUID()],
  validate,
  requireCredits(2),
  startCampaign
);

router.post('/:id/pause',
  [param('id').isUUID()],
  validate,
  pauseCampaign
);

router.post('/:id/resume',
  [param('id').isUUID()],
  validate,
  resumeCampaign
);

module.exports = router;
