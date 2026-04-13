const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { startSimulatedCall, simulateTurn, endSimulatedCall } = require('../services/simulateService');
const logger = require('../utils/logger');

/**
 * POST /api/simulate/start
 * Body: { workflowId? }
 * Starts a new simulated call and returns the AI greeting.
 */
router.post('/start', authenticateToken, async (req, res) => {
  try {
    const { workflowId } = req.body;
    const result = await startSimulatedCall(workflowId || null);
    res.json(result);
  } catch (err) {
    logger.error('[SIM] /start error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/simulate/turn
 * Body: { callId, turn, userText }
 * Processes one user turn and returns the AI response.
 */
router.post('/turn', authenticateToken, async (req, res) => {
  try {
    const { callId, turn, userText } = req.body;
    if (!callId || turn == null || !userText?.trim()) {
      return res.status(400).json({ error: 'callId, turn, and userText are required' });
    }
    const result = await simulateTurn(callId, Number(turn), userText.trim());
    res.json(result);
  } catch (err) {
    logger.error('[SIM] /turn error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/simulate/end
 * Body: { callId }
 * Ends the simulated call early.
 */
router.post('/end', authenticateToken, async (req, res) => {
  try {
    const { callId } = req.body;
    if (!callId) return res.status(400).json({ error: 'callId is required' });
    await endSimulatedCall(callId);
    res.json({ ok: true });
  } catch (err) {
    logger.error('[SIM] /end error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
