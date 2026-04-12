/**
 * Log Routes - /api/logs
 */
const express = require('express');
const router = express.Router();
const { param } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const CallLog = require('../models/CallLog');

router.use(authenticateToken);

// GET /api/logs/:callId
router.get('/:callId',
  [param('callId').isUUID()],
  validate,
  async (req, res) => {
    const logs = await CallLog.findAll({
      where: { callId: req.params.callId },
      order: [['createdAt', 'ASC']],
    });
    res.json({ success: true, logs });
  }
);

module.exports = router;
