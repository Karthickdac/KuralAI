/**
 * Call Controller
 * Handles call initiation, status, retry logic — using Exotel
 */

const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Call = require('../models/Call');
const Customer = require('../models/Customer');
const ChitAccount = require('../models/ChitAccount');
const { buildChitMetadata } = require('./customerController');
const { initiateCall } = require('../services/telephonyService');
const logger = require('../utils/logger');

/**
 * Look up a customer by phone and build their full chit metadata.
 * Returns {} if the customer or chit data is not found.
 */
async function resolveCustomerMeta(toPhone) {
  try {
    const customer = await Customer.findOne({ where: { phone: toPhone } });
    if (!customer) return {};
    const chits   = await ChitAccount.findAll({
      where: { customerId: customer.id },
      order: [['isPrimary', 'DESC']],
    });
    if (!chits.length) return { customerId: customer.id, customerName: customer.name, phone: customer.phone };
    const primary = chits.find(ch => ch.isPrimary) || chits[0];
    const others  = chits.filter(ch => !ch.isPrimary);
    return buildChitMetadata(customer, primary, others[0] || null);
  } catch (e) {
    logger.warn('resolveCustomerMeta failed:', e.message);
    return {};
  }
}

const SETTINGS_FILE = path.join(__dirname, '../../config/app-settings.json');
function getSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); } catch { return {}; }
}

/**
 * POST /api/calls/initiate
 * Start a new outgoing call via Exotel
 */
async function initiateCallController(req, res) {
  const { toPhone, metadata = {}, maxRetries } = req.body;

  try {
    // Auto-enrich metadata with customer chit data from DB (DB values win over manual overrides)
    const customerMeta = await resolveCustomerMeta(toPhone);
    const enrichedMeta = { ...customerMeta, ...metadata };

    // Create call record in DB first
    const s = getSettings();
    const provider   = (s.telephonyProvider || 'twilio').toLowerCase();
    const fromPhone  = provider === 'twilio'
      ? (s.twilioPhoneNumber  || process.env.TWILIO_PHONE_NUMBER  || '')
      : (s.exotelPhoneNumber  || process.env.EXOTEL_PHONE_NUMBER  || '');

    const call = await Call.create({
      id: uuidv4(),
      toPhone,
      fromPhone,
      status: 'initiated',
      direction: 'outbound',
      maxRetries: maxRetries || parseInt(process.env.CALL_RETRY_ATTEMPTS) || 3,
      metadata: enrichedMeta,
    });

    logger.info(`Call initiated: ${call.id} -> ${toPhone} | customer=${enrichedMeta.customerName || 'unknown'} | chit=${enrichedMeta.chitGroup || 'none'}`);

    // Trigger telephony call
    const exotelCall = await initiateCall(toPhone, call.id, enrichedMeta);

    // Update with Exotel SID
    await call.update({
      callSid: exotelCall.sid,
      status: 'queued',
    });

    // ── Fire-and-forget TTS pre-warm during ring phase ─────────────────────────
    // Customer's phone rings for ~10-15 seconds — use that time to pre-synthesize
    // the greeting + all QA responses for this customer so every turn is cached.
    const _meta = { ...enrichedMeta };
    setImmediate(async () => {
      try {
        const { synthesizeSpeech } = require('../services/speechService');
        const { getPromptText }    = require('../services/aiService');
        const { applyTemplate }    = require('../utils/templateEngine');
        const QaTemplate           = require('../models/QaTemplate');

        // 1) Greeting (personalised per customer)
        const greetingText = await getPromptText('GREETING', _meta);
        await synthesizeSpeech(greetingText).catch(() => {});

        // 2) All active QA response texts with this customer's template vars filled
        const qaRows = await QaTemplate.findAll({ where: { isActive: true }, raw: true });
        const allTexts = [];
        qaRows.forEach(r => {
          (r.responses || []).forEach(t => {
            allTexts.push(applyTemplate(t, _meta));
          });
        });
        // Synthesise in parallel (max 5 at a time to avoid rate-limit)
        for (let i = 0; i < allTexts.length; i += 5) {
          await Promise.all(allTexts.slice(i, i + 5).map(t => synthesizeSpeech(t).catch(() => {})));
        }
        logger.info(`Pre-warmed ${allTexts.length + 1} TTS entries for call ${call.id}`);
      } catch (e) {
        logger.warn('Per-call TTS pre-warm failed:', e.message);
      }
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
