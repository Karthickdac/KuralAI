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
