const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

async function getBalance(organizationId) {
  const CreditBalance = sequelize.models.CreditBalance;
  if (!CreditBalance) return null;

  let balance = await CreditBalance.findOne({ where: { organizationId } });
  if (!balance) {
    balance = await CreditBalance.create({ organizationId, totalMinutes: 0, usedMinutes: 0, reservedMinutes: 0 });
  }
  return balance;
}

async function getAvailableMinutes(organizationId) {
  const balance = await getBalance(organizationId);
  if (!balance) return 0;
  return Math.max(0, balance.totalMinutes - balance.usedMinutes - balance.reservedMinutes);
}

async function hasEnoughCredits(organizationId, minutesNeeded = 2) {
  const available = await getAvailableMinutes(organizationId);
  return available >= minutesNeeded;
}

async function reserveMinutes(organizationId, minutes) {
  const CreditBalance = sequelize.models.CreditBalance;
  const balance = await getBalance(organizationId);
  if (!balance) return false;

  const available = balance.totalMinutes - balance.usedMinutes - balance.reservedMinutes;
  if (available < minutes) return false;

  await balance.update({ reservedMinutes: balance.reservedMinutes + minutes });
  return true;
}

async function releaseReservation(organizationId, minutes) {
  const CreditBalance = sequelize.models.CreditBalance;
  const balance = await getBalance(organizationId);
  if (!balance) return;

  await balance.update({
    reservedMinutes: Math.max(0, balance.reservedMinutes - minutes),
  });
}

async function deductMinutes(organizationId, minutes, callId = null, description = '') {
  const CreditBalance = sequelize.models.CreditBalance;
  const CreditTransaction = sequelize.models.CreditTransaction;
  if (!CreditBalance || !CreditTransaction) return false;

  const t = await sequelize.transaction();
  try {
    const balance = await CreditBalance.findOne({
      where: { organizationId },
      lock: t.LOCK.UPDATE,
      transaction: t,
    });
    if (!balance) { await t.rollback(); return false; }

    const newUsed = balance.usedMinutes + minutes;
    const newReserved = Math.max(0, balance.reservedMinutes - minutes);

    await balance.update({ usedMinutes: newUsed, reservedMinutes: newReserved }, { transaction: t });

    await CreditTransaction.create({
      organizationId,
      type: 'usage',
      minutes: -minutes,
      balanceAfter: balance.totalMinutes - newUsed,
      description: description || `Call usage: ${minutes.toFixed(2)} min`,
      callId,
    }, { transaction: t });

    await t.commit();
    logger.info(`[Credits] Deducted ${minutes.toFixed(2)}min from org ${organizationId}. Remaining: ${(balance.totalMinutes - newUsed).toFixed(2)}min`);
    return true;
  } catch (err) {
    await t.rollback();
    logger.error(`[Credits] Deduction failed for org ${organizationId}:`, err);
    return false;
  }
}

async function addMinutes(organizationId, minutes, { type = 'recharge', amount = 0, razorpayPaymentId = null, description = '' } = {}) {
  const CreditBalance = sequelize.models.CreditBalance;
  const CreditTransaction = sequelize.models.CreditTransaction;
  if (!CreditBalance || !CreditTransaction) return false;

  const t = await sequelize.transaction();
  try {
    let balance = await CreditBalance.findOne({
      where: { organizationId },
      lock: t.LOCK.UPDATE,
      transaction: t,
    });
    if (!balance) {
      balance = await CreditBalance.create({ organizationId, totalMinutes: 0, usedMinutes: 0, reservedMinutes: 0 }, { transaction: t });
    }

    const newTotal = balance.totalMinutes + minutes;

    await balance.update({
      totalMinutes: newTotal,
      lastRechargedAt: new Date(),
    }, { transaction: t });

    await CreditTransaction.create({
      organizationId,
      type,
      minutes,
      balanceAfter: newTotal - balance.usedMinutes,
      amount,
      razorpayPaymentId,
      description: description || `${type}: +${minutes} minutes`,
    }, { transaction: t });

    await t.commit();
    logger.info(`[Credits] Added ${minutes}min to org ${organizationId}. New total: ${newTotal}min`);
    return true;
  } catch (err) {
    await t.rollback();
    logger.error(`[Credits] Add minutes failed for org ${organizationId}:`, err);
    return false;
  }
}

async function getTransactions(organizationId, { limit = 50, offset = 0 } = {}) {
  const CreditTransaction = sequelize.models.CreditTransaction;
  if (!CreditTransaction) return { rows: [], count: 0 };

  return CreditTransaction.findAndCountAll({
    where: { organizationId },
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
}

module.exports = {
  getBalance,
  getAvailableMinutes,
  hasEnoughCredits,
  reserveMinutes,
  releaseReservation,
  deductMinutes,
  addMinutes,
  getTransactions,
};
