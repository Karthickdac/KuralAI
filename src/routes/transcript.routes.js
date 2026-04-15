const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenant');
const { validate } = require('../middleware/validate');
const Transcript = require('../models/Transcript');
const Call = require('../models/Call');

router.use(authenticateToken);
router.use(tenantScope);

router.get('/:callId',
  [param('callId').isUUID()],
  validate,
  async (req, res) => {
    const { callId } = req.params;
    const orgFilter = req.tenantScope || {};

    const call = await Call.findOne({
      where: { id: callId, ...orgFilter },
      attributes: ['id', 'toPhone', 'status', 'duration', 'createdAt'],
    });
    if (!call) return res.status(404).json({ error: 'Call not found' });

    const transcripts = await Transcript.findAll({
      where: { callId },
      order: [['turnNumber', 'ASC']],
    });

    res.json({ success: true, call, transcript: transcripts });
  }
);

module.exports = router;
