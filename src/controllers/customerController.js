const Customer = require('../models/Customer');
const ChitAccount = require('../models/ChitAccount');
const { toIndianFormat } = require('../utils/templateEngine');
const { setPreference, clearPreference } = require('../services/preferenceService');
const logger = require('../utils/logger');

function buildChitMetadata(customer, primaryChit, otherChit) {
  const pendingDues = primaryChit.totalDues - primaryChit.completedDues;
  const currentDue  = primaryChit.completedDues + 1;
  const docs        = primaryChit.documents || {};

  return {
    customerId:       customer.id,
    customerName:     customer.name,
    phone:            customer.phone,
    chitGroup:        primaryChit.chitGroup,
    chitValue:        toIndianFormat(primaryChit.chitValue),
    chitValueNum:     primaryChit.chitValue,
    dueAmount:        toIndianFormat(primaryChit.dueAmount),
    dueAmountNum:     primaryChit.dueAmount,
    totalDues:        primaryChit.totalDues,
    completedDues:    primaryChit.completedDues,
    pendingDues:      pendingDues,
    currentDue:       currentDue,
    nextDueDate:      primaryChit.nextDueDate || 'அடுத்த மாசம் 7ம் தேதி',
    withdrawalAmount: primaryChit.withdrawalAmount
      ? toIndianFormat(primaryChit.withdrawalAmount)
      : '3,55,000',
    withdrawalAmountNum: primaryChit.withdrawalAmount || 355000,
    familyJamin:      docs.familyJamin ?? 2,
    otherJamin:       docs.otherJamin  ?? 2,
    chequeLeaf:       docs.chequeLeaf  ?? 4,
    otherChitDues:    otherChit ? (otherChit.completedDues + 1) : 6,
    otherChitGroup:   otherChit?.chitGroup || null,
  };
}

async function listCustomers(req, res) {
  try {
    const orgFilter = req.tenantScope || {};
    const customers = await Customer.findAll({ where: { ...orgFilter }, order: [['name', 'ASC']] });
    const results = [];

    for (const c of customers) {
      const chits = await ChitAccount.findAll({
        where: { customerId: c.id },
        order: [['isPrimary', 'DESC']],
      });
      const primary = chits.find(ch => ch.isPrimary) || chits[0];
      const others  = chits.filter(ch => !ch.isPrimary);
      const meta    = primary ? buildChitMetadata(c, primary, others[0] || null) : {};

      results.push({
        id:          c.id,
        name:        c.name,
        phone:       c.phone,
        address:     c.address,
        notes:       c.notes,
        preferences: c.preferences || {},
        chits,
        metadata:    meta,
      });
    }

    res.json(results);
  } catch (err) {
    logger.error('listCustomers error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function getCustomer(req, res) {
  try {
    const orgFilter = req.tenantScope || {};
    const c = await Customer.findOne({ where: { id: req.params.id, ...orgFilter } });
    if (!c) return res.status(404).json({ error: 'Customer not found' });

    const chits   = await ChitAccount.findAll({
      where: { customerId: c.id },
      order: [['isPrimary', 'DESC']],
    });
    const primary = chits.find(ch => ch.isPrimary) || chits[0];
    const others  = chits.filter(ch => !ch.isPrimary);
    const meta    = primary ? buildChitMetadata(c, primary, others[0] || null) : {};

    res.json({ id: c.id, name: c.name, phone: c.phone, address: c.address, notes: c.notes, preferences: c.preferences || {}, chits, metadata: meta });
  } catch (err) {
    logger.error('getCustomer error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function createCustomer(req, res) {
  try {
    const { name, phone, address, notes, chit } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'name and phone are required' });

    const orgId = req.user?.organizationId || null;
    const uniqueWhere = { phone };
    if (orgId) uniqueWhere.organizationId = orgId;

    const existing = await Customer.findOne({ where: uniqueWhere });
    if (existing) return res.status(409).json({ error: 'A customer with this phone number already exists' });

    const c = await Customer.create({ name, phone, address: address || '', notes: notes || '', preferences: {}, organizationId: orgId });

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

    res.status(201).json({ success: true, id: c.id, name: c.name, phone: c.phone });
  } catch (err) {
    logger.error('createCustomer error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function updateCustomer(req, res) {
  try {
    const orgFilter = req.tenantScope || {};
    const c = await Customer.findOne({ where: { id: req.params.id, ...orgFilter } });
    if (!c) return res.status(404).json({ error: 'Customer not found' });

    const { name, phone, address, notes } = req.body;
    if (name)    c.name    = name;
    if (phone)   c.phone   = phone;
    if (address !== undefined) c.address = address;
    if (notes   !== undefined) c.notes   = notes;
    await c.save();

    res.json({ success: true, id: c.id, name: c.name, phone: c.phone });
  } catch (err) {
    logger.error('updateCustomer error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function deleteCustomer(req, res) {
  try {
    const orgFilter = req.tenantScope || {};
    const c = await Customer.findOne({ where: { id: req.params.id, ...orgFilter } });
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    await ChitAccount.destroy({ where: { customerId: c.id } });
    await c.destroy();
    res.json({ success: true });
  } catch (err) {
    logger.error('deleteCustomer error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function updatePreference(req, res) {
  try {
    const orgFilter = req.tenantScope || {};
    const c = await Customer.findOne({ where: { id: req.params.id, ...orgFilter } });
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key is required' });
    const updated = await setPreference(req.params.id, key, value);
    res.json({ success: true, preferences: updated });
  } catch (err) {
    logger.error('updatePreference error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function deletePreference(req, res) {
  try {
    const orgFilter = req.tenantScope || {};
    const c = await Customer.findOne({ where: { id: req.params.id, ...orgFilter } });
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    const updated = await clearPreference(req.params.id, req.params.key);
    res.json({ success: true, preferences: updated });
  } catch (err) {
    logger.error('deletePreference error:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer, buildChitMetadata, updatePreference, deletePreference };
