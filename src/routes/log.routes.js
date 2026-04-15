const express = require('express');
const router = express.Router();
const { param } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenant');
const { validate } = require('../middleware/validate');
const CallLog = require('../models/CallLog');
const Call = require('../models/Call');

router.use(authenticateToken);
router.use(tenantScope);

router.get('/:callId',
  [param('callId').isUUID()],
  validate,
  async (req, res) => {
    const orgFilter = req.tenantScope || {};
    const call = await Call.findOne({
      where: { id: req.params.callId, ...orgFilter },
      attributes: ['id'],
    });
    if (!call) return res.status(404).json({ error: 'Call not found' });

    const logs = await CallLog.findAll({
      where: { callId: req.params.callId },
      order: [['createdAt', 'ASC']],
    });
    res.json({ success: true, logs });
  }
);

module.exports = router;
