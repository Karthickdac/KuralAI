/**
 * Customer Controller
 * CRUD for customers + their chit accounts.
 */

const Customer = require('../models/Customer');
const ChitAccount = require('../models/ChitAccount');
const { toIndianFormat } = require('../utils/templateEngine');
const logger = require('../utils/logger');

/**
 * Build the rich metadata object used in call.metadata and template substitution.
 */
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

/**
 * GET /api/customers
 * Returns all customers with their chit accounts.
 */
async function listCustomers(req, res) {
  try {
    const customers = await Customer.findAll({ order: [['name', 'ASC']] });
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
        id:       c.id,
        name:     c.name,
        phone:    c.phone,
        address:  c.address,
        notes:    c.notes,
        chits,
        metadata: meta,
      });
    }

    res.json(results);
  } catch (err) {
    logger.error('listCustomers error:', err);
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/customers/:id
 * Returns one customer with full chit detail + metadata map.
 */
async function getCustomer(req, res) {
  try {
    const c = await Customer.findByPk(req.params.id);
    if (!c) return res.status(404).json({ error: 'Customer not found' });

    const chits   = await ChitAccount.findAll({
      where: { customerId: c.id },
      order: [['isPrimary', 'DESC']],
    });
    const primary = chits.find(ch => ch.isPrimary) || chits[0];
    const others  = chits.filter(ch => !ch.isPrimary);
    const meta    = primary ? buildChitMetadata(c, primary, others[0] || null) : {};

    res.json({ id: c.id, name: c.name, phone: c.phone, address: c.address, notes: c.notes, chits, metadata: meta });
  } catch (err) {
    logger.error('getCustomer error:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { listCustomers, getCustomer, buildChitMetadata };
