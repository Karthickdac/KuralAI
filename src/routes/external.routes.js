/**
 * External API Routes — /api/external/v1
 *
 * Authenticated via API key (X-API-Key header or ?apiKey= query).
 * Designed for CRM / chit fund software integration.
 *
 * Endpoints:
 *   GET    /api/external/v1/customers          — list all customers
 *   GET    /api/external/v1/customers/:id      — get by UUID
 *   GET    /api/external/v1/customers/phone/:phone — get by phone number
 *   POST   /api/external/v1/customers          — create customer
 *   PUT    /api/external/v1/customers/:id      — update customer fields
 *   POST   /api/external/v1/customers/upsert   — create or update by phone
 *   GET    /api/external/v1/customers/:id/calls — recent call history
 */

const express  = require('express');
const router   = express.Router();
const { requireApiKey } = require('../middleware/apiKeyAuth');
const Customer   = require('../models/Customer');
const ChitAccount = require('../models/ChitAccount');
const Call       = require('../models/Call');
const logger     = require('../utils/logger');

router.use(requireApiKey);

// ── Helpers ────────────────────────────────────────────────────────────────────

function normalizePhone(phone) {
  if (!phone) return phone;
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('91') && digits.length === 12
    ? '+' + digits
    : digits.length === 10
      ? '+91' + digits
      : '+' + digits;
}

async function formatCustomer(c) {
  const chits = await ChitAccount.findAll({
    where: { customerId: c.id },
    order: [['isPrimary', 'DESC']],
  });
  return {
    id:          c.id,
    name:        c.name,
    phone:       c.phone,
    address:     c.address,
    notes:       c.notes,
    preferences: c.preferences || {},
    chits:       chits.map(ch => ({
      id:              ch.id,
      chitGroup:       ch.chitGroup,
      chitValue:       ch.chitValue,
      dueAmount:       ch.dueAmount,
      totalDues:       ch.totalDues,
      completedDues:   ch.completedDues,
      nextDueDate:     ch.nextDueDate,
      withdrawalAmount:ch.withdrawalAmount,
      isPrimary:       ch.isPrimary,
    })),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

// ── GET /customers ─────────────────────────────────────────────────────────────

router.get('/customers', async (req, res) => {
  try {
    const customers = await Customer.findAll({ order: [['name', 'ASC']] });
    const results = await Promise.all(customers.map(formatCustomer));
    res.json({ success: true, count: results.length, customers: results });
  } catch (err) {
    logger.error('external GET /customers:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /customers/phone/:phone ────────────────────────────────────────────────

router.get('/customers/phone/:phone', async (req, res) => {
  try {
    const phone = normalizePhone(decodeURIComponent(req.params.phone));
    const c = await Customer.findOne({ where: { phone } });
    if (!c) return res.status(404).json({ success: false, error: 'Customer not found' });
    res.json({ success: true, customer: await formatCustomer(c) });
  } catch (err) {
    logger.error('external GET /customers/phone:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /customers/:id ─────────────────────────────────────────────────────────

router.get('/customers/:id', async (req, res) => {
  try {
    const c = await Customer.findByPk(req.params.id);
    if (!c) return res.status(404).json({ success: false, error: 'Customer not found' });
    res.json({ success: true, customer: await formatCustomer(c) });
  } catch (err) {
    logger.error('external GET /customers/:id:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /customers ────────────────────────────────────────────────────────────

router.post('/customers', async (req, res) => {
  try {
    const { name, phone, address, notes, chit } = req.body;
    if (!name || !phone) return res.status(400).json({ success: false, error: 'name and phone are required' });

    const normalized = normalizePhone(phone);
    const existing = await Customer.findOne({ where: { phone: normalized } });
    if (existing) return res.status(409).json({ success: false, error: 'Customer with this phone already exists', id: existing.id });

    const c = await Customer.create({
      name,
      phone: normalized,
      address: address || '',
      notes: notes || '',
      preferences: {},
    });

    if (chit) {
      await ChitAccount.create({
        customerId:       c.id,
        chitGroup:        chit.chitGroup || 'Group A',
        chitValue:        chit.chitValue || 100000,
        dueAmount:        chit.dueAmount || 2000,
        totalDues:        chit.totalDues || 20,
        completedDues:    chit.completedDues || 0,
        nextDueDate:      chit.nextDueDate || null,
        withdrawalAmount: chit.withdrawalAmount || null,
        isPrimary:        true,
      });
    }

    res.status(201).json({ success: true, customer: await formatCustomer(c) });
  } catch (err) {
    logger.error('external POST /customers:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /customers/:id ─────────────────────────────────────────────────────────

router.put('/customers/:id', async (req, res) => {
  try {
    const c = await Customer.findByPk(req.params.id);
    if (!c) return res.status(404).json({ success: false, error: 'Customer not found' });

    const { name, phone, address, notes } = req.body;
    if (name)                c.name    = name;
    if (phone)               c.phone   = normalizePhone(phone);
    if (address !== undefined) c.address = address;
    if (notes   !== undefined) c.notes   = notes;
    await c.save();

    // Update chit if provided
    const { chit } = req.body;
    if (chit) {
      const primary = await ChitAccount.findOne({ where: { customerId: c.id, isPrimary: true } });
      if (primary) {
        Object.assign(primary, {
          chitGroup:        chit.chitGroup        ?? primary.chitGroup,
          chitValue:        chit.chitValue        ?? primary.chitValue,
          dueAmount:        chit.dueAmount        ?? primary.dueAmount,
          totalDues:        chit.totalDues        ?? primary.totalDues,
          completedDues:    chit.completedDues    ?? primary.completedDues,
          nextDueDate:      chit.nextDueDate      ?? primary.nextDueDate,
          withdrawalAmount: chit.withdrawalAmount ?? primary.withdrawalAmount,
        });
        await primary.save();
      }
    }

    res.json({ success: true, customer: await formatCustomer(c) });
  } catch (err) {
    logger.error('external PUT /customers/:id:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /customers/upsert ─────────────────────────────────────────────────────
// Create or update by phone — useful for nightly CRM sync

router.post('/customers/upsert', async (req, res) => {
  try {
    const { name, phone, address, notes, chit } = req.body;
    if (!phone) return res.status(400).json({ success: false, error: 'phone is required' });

    const normalized = normalizePhone(phone);
    let c = await Customer.findOne({ where: { phone: normalized } });
    let created = false;

    if (!c) {
      if (!name) return res.status(400).json({ success: false, error: 'name is required when creating a new customer' });
      c = await Customer.create({ name, phone: normalized, address: address || '', notes: notes || '', preferences: {} });
      created = true;
    } else {
      if (name)                c.name    = name;
      if (address !== undefined) c.address = address;
      if (notes   !== undefined) c.notes   = notes;
      await c.save();
    }

    if (chit) {
      let primary = await ChitAccount.findOne({ where: { customerId: c.id, isPrimary: true } });
      if (!primary) {
        await ChitAccount.create({
          customerId: c.id, isPrimary: true,
          chitGroup:        chit.chitGroup || 'Group A',
          chitValue:        chit.chitValue || 100000,
          dueAmount:        chit.dueAmount || 2000,
          totalDues:        chit.totalDues || 20,
          completedDues:    chit.completedDues || 0,
          nextDueDate:      chit.nextDueDate || null,
          withdrawalAmount: chit.withdrawalAmount || null,
        });
      } else {
        Object.assign(primary, {
          chitGroup:        chit.chitGroup        ?? primary.chitGroup,
          chitValue:        chit.chitValue        ?? primary.chitValue,
          dueAmount:        chit.dueAmount        ?? primary.dueAmount,
          totalDues:        chit.totalDues        ?? primary.totalDues,
          completedDues:    chit.completedDues    ?? primary.completedDues,
          nextDueDate:      chit.nextDueDate      ?? primary.nextDueDate,
          withdrawalAmount: chit.withdrawalAmount ?? primary.withdrawalAmount,
        });
        await primary.save();
      }
    }

    res.status(created ? 201 : 200).json({
      success: true,
      action: created ? 'created' : 'updated',
      customer: await formatCustomer(c),
    });
  } catch (err) {
    logger.error('external POST /customers/upsert:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /customers/:id/calls ───────────────────────────────────────────────────

router.get('/customers/:id/calls', async (req, res) => {
  try {
    const c = await Customer.findByPk(req.params.id);
    if (!c) return res.status(404).json({ success: false, error: 'Customer not found' });

    const calls = await Call.findAll({
      where: { customerPhone: c.phone },
      order: [['createdAt', 'DESC']],
      limit: parseInt(req.query.limit) || 20,
      attributes: ['id', 'status', 'duration', 'callType', 'workflowName', 'outcome', 'createdAt'],
    });

    res.json({ success: true, customerId: c.id, calls });
  } catch (err) {
    logger.error('external GET /customers/:id/calls:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
