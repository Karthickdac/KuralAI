/**
 * Call Controller
 * Handles call initiation, status, retry logic — using Exotel
 */

const { v4: uuidv4 } = require('uuid');
const Call = require('../models/Call');
const { initiateCall } = require('../services/exotelService');
const logger = require('../utils/logger');

/**
 * POST /api/calls/initiate
 * Start a new outgoing call via Exotel
 */
async function initiateCallController(req, res) {
  const { toPhone, metadata = {}, maxRetries } = req.body;

  try {
    // Create call record in DB first
    const call = await Call.create({
      id: uuidv4(),
      toPhone,
      fromPhone: process.env.EXOTEL_PHONE_NUMBER,
      status: 'initiated',
      direction: 'outbound',
      maxRetries: maxRetries || parseInt(process.env.CALL_RETRY_ATTEMPTS) || 3,
      metadata,
    });

    logger.info(`Call initiated: ${call.id} -> ${toPhone}`);

    // Trigger Exotel call
    const exotelCall = await initiateCall(toPhone, call.id, metadata);

    // Update with Exotel SID
    await call.update({
      callSid: exotelCall.sid,
      status: 'queued',
    });

    res.status(201).json({
      success: true,
      callId: call.id,
      callSid: exotelCall.sid,
      status: 'queued',
      toPhone,
    });

  } catch (error) {
    logger.error('Failed to initiate call:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/calls/:callId/status
 */
async function getCallStatus(req, res) {
  const { callId } = req.params;

  const call = await Call.findByPk(callId, {
    attributes: ['id', 'callSid', 'toPhone', 'status', 'duration', 'escalated', 'createdAt', 'startedAt', 'endedAt'],
  });

  if (!call) return res.status(404).json({ error: 'Call not found' });

  res.json({ success: true, call });
}

/**
 * GET /api/calls
 * List calls with pagination and filtering
 */
async function listCalls(req, res) {
  const { page = 1, limit = 20, status, fromDate, toDate } = req.query;
  const { Op } = require('sequelize');

  const where = {};
  if (status) where.status = status;
  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt[Op.gte] = new Date(fromDate);
    if (toDate) where.createdAt[Op.lte] = new Date(toDate);
  }

  const { count, rows } = await Call.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: parseInt(limit),
    offset: (parseInt(page) - 1) * parseInt(limit),
  });

  res.json({
    success: true,
    calls: rows,
    pagination: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / parseInt(limit)),
    },
  });
}

/**
 * POST /api/calls/:callId/retry
 * Manually retry a failed call
 */
async function retryCall(req, res) {
  const { callId } = req.params;
  const call = await Call.findByPk(callId);

  if (!call) return res.status(404).json({ error: 'Call not found' });
  if (call.retryCount >= call.maxRetries) {
    return res.status(400).json({ error: 'Maximum retries reached' });
  }

  try {
    const exotelCall = await initiateCall(call.toPhone, call.id, call.metadata);

    await call.update({
      callSid: exotelCall.sid,
      status: 'queued',
      retryCount: call.retryCount + 1,
      nextRetryAt: null,
    });

    res.json({ success: true, callId: call.id, retryCount: call.retryCount });
  } catch (error) {
    logger.error('Retry failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = { initiateCallController, getCallStatus, listCalls, retryCall };
