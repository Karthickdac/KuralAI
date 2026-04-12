/**
 * Transcript Routes - /api/transcripts
 */
const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const Transcript = require('../models/Transcript');
const Call = require('../models/Call');

router.use(authenticateToken);

// GET /api/transcripts/:callId - Full transcript for a call
router.get('/:callId',
  [param('callId').isUUID()],
  validate,
  async (req, res) => {
    const { callId } = req.params;

    const call = await Call.findByPk(callId, { attributes: ['id', 'toPhone', 'status', 'duration', 'createdAt'] });
    if (!call) return res.status(404).json({ error: 'Call not found' });

    const transcripts = await Transcript.findAll({
      where: { callId },
      order: [['turnNumber', 'ASC']],
    });

    res.json({ success: true, call, transcript: transcripts });
  }
);

module.exports = router;
