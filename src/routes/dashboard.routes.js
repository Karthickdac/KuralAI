/**
 * Dashboard Routes - /api/dashboard
 * Analytics and stats for the dashboard UI
 */
const express = require('express');
const router = express.Router();
const { Op, fn, col, literal } = require('sequelize');
const { authenticateToken } = require('../middleware/auth');
const Call = require('../models/Call');
const Transcript = require('../models/Transcript');

router.use(authenticateToken);

// GET /api/dashboard/stats - Summary stats
router.get('/stats', async (req, res) => {
  const { days = 7 } = req.query;
  const since = new Date(Date.now() - parseInt(days) * 86400000);

  const [total, completed, failed, escalated, avgDuration] = await Promise.all([
    Call.count({ where: { createdAt: { [Op.gte]: since } } }),
    Call.count({ where: { status: 'completed', createdAt: { [Op.gte]: since } } }),
    Call.count({ where: { status: { [Op.in]: ['failed', 'no-answer', 'busy'] }, createdAt: { [Op.gte]: since } } }),
    Call.count({ where: { escalated: true, createdAt: { [Op.gte]: since } } }),
    Call.findOne({
      attributes: [[fn('AVG', col('duration')), 'avgDuration']],
      where: { status: 'completed', createdAt: { [Op.gte]: since } },
      raw: true,
    }),
  ]);

  const successRate = total > 0 ? ((completed / total) * 100).toFixed(1) : 0;

  res.json({
    success: true,
    stats: {
      totalCalls: total,
      completedCalls: completed,
      failedCalls: failed,
      escalatedCalls: escalated,
      successRate: parseFloat(successRate),
      avgDurationSeconds: Math.round(avgDuration?.avgDuration || 0),
    },
  });
});

// GET /api/dashboard/intents - Most common intents
router.get('/intents', async (req, res) => {
  const { days = 7 } = req.query;
  const since = new Date(Date.now() - parseInt(days) * 86400000);

  const intents = await Transcript.findAll({
    attributes: ['intent', [fn('COUNT', col('intent')), 'count']],
    where: {
      speaker: 'user',
      intent: { [Op.not]: null },
      createdAt: { [Op.gte]: since },
    },
    group: ['intent'],
    order: [[literal('count'), 'DESC']],
    limit: 10,
    raw: true,
  });

  res.json({ success: true, intents });
});

// GET /api/dashboard/calls/timeline - Calls per day
router.get('/calls/timeline', async (req, res) => {
  const { days = 14 } = req.query;
  const since = new Date(Date.now() - parseInt(days) * 86400000);

  const calls = await Call.findAll({
    attributes: [
      [fn('DATE', col('createdAt')), 'date'],
      [fn('COUNT', col('id')), 'total'],
      [fn('SUM', literal("CASE WHEN status = 'completed' THEN 1 ELSE 0 END")), 'completed'],
    ],
    where: { createdAt: { [Op.gte]: since } },
    group: [literal('DATE("createdAt")')],
    order: [[literal('date'), 'ASC']],
    raw: true,
  });

  res.json({ success: true, timeline: calls });
});

// GET /api/dashboard/recent-calls - Last N calls
router.get('/recent-calls', async (req, res) => {
  const { limit = 10 } = req.query;

  const calls = await Call.findAll({
    attributes: ['id', 'toPhone', 'status', 'duration', 'escalated', 'retryCount', 'createdAt'],
    order: [['createdAt', 'DESC']],
    limit: parseInt(limit),
  });

  res.json({ success: true, calls });
});

module.exports = router;
