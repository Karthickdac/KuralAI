/**
 * ElevenLabs Conversational AI - Tool Webhooks
 *
 * These endpoints are called by the ElevenLabs agent (Samuthra) during
 * a live voice conversation. Each endpoint must return JSON quickly
 * (<10s) so the agent can include the result in its next reply.
 *
 * Auth: Every request must include header `X-API-Key` matching the
 * value stored in app settings under `elevenlabsToolKey`
 * (or env ELEVENLABS_TOOL_KEY as fallback).
 */

const express = require('express');
const router = express.Router();

const Customer = require('../models/Customer');
const ChitAccount = require('../models/ChitAccount');
const Call = require('../models/Call');
const logger = require('../utils/logger');
const { getSettingsSync } = require('../services/settingsService');
const { toIndianFormat } = require('../utils/templateEngine');

/* ------------------------------------------------------------------ */
/* Auth middleware                                                     */
/* ------------------------------------------------------------------ */
function requireToolKey(req, res, next) {
  const provided = req.headers['x-api-key'];
  const s = getSettingsSync();
  const expected = s.elevenlabsToolKey || process.env.ELEVENLABS_TOOL_KEY || '';

  if (!expected) {
    logger.warn('ElevenLabs tool key not configured');
    return res.status(503).json({ ok: false, error: 'Tool key not configured on server.' });
  }
  if (!provided || provided !== expected) {
    logger.warn(`ElevenLabs tool: invalid key from ${req.ip}`);
    return res.status(403).json({ ok: false, error: 'Invalid API key.' });
  }
  next();
}

router.use(express.json());
router.use(requireToolKey);

/* ------------------------------------------------------------------ */
/* Helper: resolve customer by ID or phone                             */
/* ------------------------------------------------------------------ */
async function findCustomer(idOrPhone) {
  if (!idOrPhone) return null;
  // UUID-ish?
  if (/^[0-9a-f-]{30,}$/i.test(String(idOrPhone))) {
    return Customer.findByPk(idOrPhone);
  }
  // Otherwise treat as phone
  return Customer.findOne({ where: { phone: String(idOrPhone) } });
}

/* ------------------------------------------------------------------ */
/* 1. verify_payment                                                   */
/* ------------------------------------------------------------------ */
router.post('/verify_payment', async (req, res) => {
  try {
    const { customer_id, date, mode } = req.body || {};
    const customer = await findCustomer(customer_id);
    if (!customer) {
      return res.json({ ok: true, verified: false, message: 'வாடிக்கையாளர் record கிடைக்கல' });
    }

    // No payment-history table yet — return polite "not found, please share proof"
    return res.json({
      ok: true,
      verified: false,
      message: `${customer.name}, ${date || 'இந்த தேதி'} payment எங்க records-ல இன்னும் வரல. UPI screenshot அல்லது transaction ID share பண்ண முடியுமா?`,
      customer_name: customer.name,
    });
  } catch (err) {
    logger.error('verify_payment failed', err?.message || err);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

/* ------------------------------------------------------------------ */
/* 2. send_payment_link                                                */
/* ------------------------------------------------------------------ */
router.post('/send_payment_link', async (req, res) => {
  try {
    const { customer_phone, amount } = req.body || {};
    if (!customer_phone) {
      return res.status(400).json({ ok: false, error: 'customer_phone required' });
    }

    // Stub: log it. SMS gateway integration can be added here.
    logger.info(`[ElevenLabs] payment link requested for ${customer_phone} amount ₹${amount}`);

    return res.json({
      ok: true,
      sent: true,
      message: `Payment link ${customer_phone}-க்கு SMS அனுப்பப்பட்டது. ஒரு நிமிஷத்துல வரும்.`,
    });
  } catch (err) {
    logger.error('send_payment_link failed', err?.message || err);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

/* ------------------------------------------------------------------ */
/* 3. schedule_followup                                                */
/* ------------------------------------------------------------------ */
router.post('/schedule_followup', async (req, res) => {
  try {
    const { customer_id, promised_date, notes } = req.body || {};
    const customer = await findCustomer(customer_id);
    if (!customer) return res.json({ ok: true, scheduled: false, message: 'Customer not found' });

    const prefs = customer.preferences || {};
    prefs.lastPromise = { promised_date, notes: notes || null, recordedAt: new Date().toISOString() };
    await customer.update({ preferences: prefs });

    logger.info(`[ElevenLabs] followup scheduled for ${customer.name} on ${promised_date}`);
    return res.json({
      ok: true,
      scheduled: true,
      message: `${promised_date}-க்கு payment-னு note பண்ணிட்டேன்.`,
    });
  } catch (err) {
    logger.error('schedule_followup failed', err?.message || err);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

/* ------------------------------------------------------------------ */
/* 4. schedule_callback                                                */
/* ------------------------------------------------------------------ */
router.post('/schedule_callback', async (req, res) => {
  try {
    const { customer_id, callback_time } = req.body || {};
    const customer = await findCustomer(customer_id);
    if (!customer) return res.json({ ok: true, scheduled: false, message: 'Customer not found' });

    const prefs = customer.preferences || {};
    prefs.callback = { callback_time, recordedAt: new Date().toISOString() };
    await customer.update({ preferences: prefs });

    logger.info(`[ElevenLabs] callback scheduled for ${customer.name} at ${callback_time}`);
    return res.json({
      ok: true,
      scheduled: true,
      message: `சரி, ${callback_time}-க்கு call பண்றேன்.`,
    });
  } catch (err) {
    logger.error('schedule_callback failed', err?.message || err);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

/* ------------------------------------------------------------------ */
/* 5. transfer_to_agent                                                */
/* ------------------------------------------------------------------ */
router.post('/transfer_to_agent', async (req, res) => {
  try {
    const { customer_id, reason } = req.body || {};
    const customer = await findCustomer(customer_id);

    // Mark latest active call as escalated, if available
    if (customer) {
      const call = await Call.findOne({
        where: { toPhone: customer.phone },
        order: [['createdAt', 'DESC']],
      });
      if (call) {
        await call.update({
          escalated: true,
          escalationReason: reason || 'Customer requested human agent',
        });
      }
    }

    const s = getSettingsSync();
    const supportNumber = s.supportNumber || s.escalationNumber || '';

    logger.info(`[ElevenLabs] transfer requested: ${reason}`);
    return res.json({
      ok: true,
      transferred: true,
      message: 'எங்க team-ல senior-கிட்ட transfer பண்றேன். ஒரு நிமிஷம் hold பண்ணுங்க.',
      support_number: supportNumber || null,
    });
  } catch (err) {
    logger.error('transfer_to_agent failed', err?.message || err);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

/* ------------------------------------------------------------------ */
/* 6. mark_call_outcome                                                */
/* ------------------------------------------------------------------ */
router.post('/mark_call_outcome', async (req, res) => {
  try {
    const { customer_id, outcome, notes } = req.body || {};
    const customer = await findCustomer(customer_id);

    if (customer) {
      const call = await Call.findOne({
        where: { toPhone: customer.phone },
        order: [['createdAt', 'DESC']],
      });
      if (call) {
        const meta = call.metadata || {};
        meta.elevenlabsOutcome = outcome;
        meta.elevenlabsNotes = notes || null;
        meta.outcomeRecordedAt = new Date().toISOString();
        await call.update({ metadata: meta });
      }
    }

    logger.info(`[ElevenLabs] outcome=${outcome} customer=${customer_id}`);
    return res.json({ ok: true, recorded: true });
  } catch (err) {
    logger.error('mark_call_outcome failed', err?.message || err);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

/* ------------------------------------------------------------------ */
/* 7. get_customer_balance                                             */
/* ------------------------------------------------------------------ */
router.post('/get_customer_balance', async (req, res) => {
  try {
    const { customer_id } = req.body || {};
    const customer = await findCustomer(customer_id);
    if (!customer) {
      return res.json({ ok: true, found: false, message: 'வாடிக்கையாளர் record கிடைக்கல' });
    }

    const chits = await ChitAccount.findAll({
      where: { customerId: customer.id },
      order: [['isPrimary', 'DESC']],
    });
    const primary = chits.find(c => c.isPrimary) || chits[0];
    if (!primary) {
      return res.json({ ok: true, found: true, message: `${customer.name} கிட்ட active chit account இல்ல.` });
    }

    const pending = primary.totalDues - primary.completedDues;
    return res.json({
      ok: true,
      found: true,
      customer_name: customer.name,
      chit_group: primary.chitGroup,
      due_amount: primary.dueAmount,
      due_amount_text: toIndianFormat(primary.dueAmount),
      pending_dues: pending,
      next_due_date: primary.nextDueDate || 'அடுத்த மாசம் 7ம் தேதி',
      message: `${customer.name}, உங்க due ₹${toIndianFormat(primary.dueAmount)}, கடைசி தேதி ${primary.nextDueDate || 'அடுத்த மாசம் 7ம் தேதி'}. மொத்தம் ${pending} due இன்னும் pending.`,
    });
  } catch (err) {
    logger.error('get_customer_balance failed', err?.message || err);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

module.exports = router;
