const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenant');
const { validate } = require('../middleware/validate');
const { checkPlanLimit, requireCredits } = require('../middleware/planLimits');
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
