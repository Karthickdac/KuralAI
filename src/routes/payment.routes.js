const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requireOrgAccess } = require('../middleware/tenant');
const creditService = require('../services/creditService');
const logger = require('../utils/logger');
const crypto = require('crypto');

let _settingsCache = null;
let _settingsCacheTime = 0;

async function getPaymentSettings() {
  if (_settingsCache && Date.now() - _settingsCacheTime < 30000) return _settingsCache;
  try {
    const AppSetting = require('../models/AppSetting');
    const row = await AppSetting.findByPk('main');
    const data = row?.data || {};
    _settingsCache = {
      keyId: data.razorpayKeyId || process.env.RAZORPAY_KEY_ID || '',
      keySecret: data.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET || '',
    };
  } catch {
    _settingsCache = {
      keyId: process.env.RAZORPAY_KEY_ID || '',
      keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    };
  }
  _settingsCacheTime = Date.now();
  return _settingsCache;
}

async function getRazorpay() {
  const creds = await getPaymentSettings();
  const Razorpay = require('razorpay');
  return new Razorpay({ key_id: creds.keyId, key_secret: creds.keySecret });
}

router.get('/plans', async (req, res) => {
  try {
    const Plan = sequelize.models.Plan;
    const plans = await Plan.findAll({ where: { isActive: true }, order: [['sortOrder', 'ASC']] });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/create-order', authenticateToken, requireOrgAccess, async (req, res) => {
  try {
    const { type, planId, rechargeMinutes, rechargeAmount } = req.body;
    const orgId = req.user.organizationId;

    const paymentCreds = await getPaymentSettings();
    if (!paymentCreds.keyId || !paymentCreds.keySecret) {
      return res.status(503).json({ error: 'Razorpay is not configured. Contact super admin to set up Payment Gateway in Settings.' });
    }

    let amount, description, notes;

    if (type === 'plan') {
      const Plan = sequelize.models.Plan;
      const plan = await Plan.findByPk(planId);
      if (!plan) return res.status(404).json({ error: 'Plan not found' });
      amount = plan.price * 100;
      description = `KuralAI ${plan.name} Plan — ${plan.billingCycle}`;
      notes = { type: 'plan', planId, orgId };
    } else if (type === 'recharge') {
      const SERVER_RATE_PER_MIN = 15;
      const minutes = parseInt(rechargeMinutes) || 0;
      if (minutes < 10) return res.status(400).json({ error: 'Minimum recharge is 10 minutes' });
      if (minutes > 10000) return res.status(400).json({ error: 'Maximum recharge is 10,000 minutes' });
      amount = minutes * SERVER_RATE_PER_MIN * 100;
      description = `KuralAI Credit Recharge — ${minutes} minutes`;
      notes = { type: 'recharge', minutes, orgId };
    } else {
      return res.status(400).json({ error: 'Invalid order type' });
    }

    const razorpay = await getRazorpay();
    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `kuralai_${Date.now()}`,
      notes,
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: paymentCreds.keyId,
    });
  } catch (err) {
    logger.error('Create order error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/verify', authenticateToken, requireOrgAccess, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const orgId = req.user.organizationId;

    const paymentCreds = await getPaymentSettings();
    if (!paymentCreds.keyId || !paymentCreds.keySecret) {
      return res.status(503).json({ error: 'Razorpay is not configured. Contact super admin.' });
    }
    const expectedSignature = crypto
      .createHmac('sha256', paymentCreds.keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    const CreditTransaction = sequelize.models.CreditTransaction;
    const existing = await CreditTransaction.findOne({ where: { razorpayPaymentId: razorpay_payment_id } });
    if (existing) {
      return res.status(409).json({ error: 'Payment already processed' });
    }

    const razorpay = await getRazorpay();
    const order = await razorpay.orders.fetch(razorpay_order_id);
    const notes = order.notes || {};

    if (notes.orgId !== orgId) {
      return res.status(403).json({ error: 'Order does not belong to your organization' });
    }

    if (notes.type === 'plan') {
      const Plan = sequelize.models.Plan;
      const Subscription = sequelize.models.Subscription;
      const plan = await Plan.findByPk(notes.planId);
      if (!plan) return res.status(404).json({ error: 'Plan not found' });

      await Subscription.update(
        { status: 'cancelled' },
        { where: { organizationId: orgId, status: 'active' } }
      );

      const now = new Date();
      const periodEnd = new Date(now);
      if (plan.billingCycle === 'monthly') periodEnd.setMonth(periodEnd.getMonth() + 1);
      else if (plan.billingCycle === 'quarterly') periodEnd.setMonth(periodEnd.getMonth() + 3);
      else periodEnd.setFullYear(periodEnd.getFullYear() + 1);

      await Subscription.create({
        organizationId: orgId,
        planId: plan.id,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        razorpaySubscriptionId: razorpay_payment_id,
      });

      await creditService.addMinutes(orgId, plan.creditMinutes, {
        type: 'plan_credit',
        amount: plan.price,
        razorpayPaymentId: razorpay_payment_id,
        description: `Plan: ${plan.name} — ${plan.creditMinutes} minutes`,
      });
    } else if (notes.type === 'recharge') {
      const SERVER_RATE_PER_MIN = 15;
      const minutes = parseInt(notes.minutes) || 0;
      const amountPaid = order.amount / 100;
      const expectedAmount = minutes * SERVER_RATE_PER_MIN;
      if (amountPaid < expectedAmount) {
        logger.warn(`Recharge amount mismatch: paid ₹${amountPaid}, expected ₹${expectedAmount} for ${minutes} min (org ${orgId})`);
        return res.status(400).json({ error: 'Payment amount does not match expected recharge amount' });
      }

      await creditService.addMinutes(orgId, minutes, {
        type: 'recharge',
        amount: amountPaid,
        razorpayPaymentId: razorpay_payment_id,
        description: `Recharge: +${minutes} minutes (₹${amountPaid})`,
      });
    } else {
      return res.status(400).json({ error: 'Unknown order type' });
    }

    const balance = await creditService.getBalance(orgId);
    res.json({ success: true, balance });
  } catch (err) {
    logger.error('Payment verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/balance', authenticateToken, requireOrgAccess, async (req, res) => {
  try {
    const balance = await creditService.getBalance(req.user.organizationId);
    res.json(balance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/transactions', authenticateToken, requireOrgAccess, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const result = await creditService.getTransactions(req.user.organizationId, {
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/subscription', authenticateToken, requireOrgAccess, async (req, res) => {
  try {
    const Subscription = sequelize.models.Subscription;
    const sub = await Subscription.findOne({
      where: { organizationId: req.user.organizationId, status: 'active' },
      include: [{ model: sequelize.models.Plan, as: 'plan' }],
    });
    res.json(sub || { status: 'none' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
