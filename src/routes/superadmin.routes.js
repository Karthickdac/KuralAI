const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/tenant');
const creditService = require('../services/creditService');
const User = require('../models/User');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

router.use(authenticateToken, requireSuperAdmin);

router.get('/organizations', async (req, res) => {
  try {
    const Organization = sequelize.models.Organization;
    const orgs = await Organization.findAll({ order: [['createdAt', 'DESC']] });

    const enriched = [];
    for (const org of orgs) {
      const userCount = await User.count({ where: { organizationId: org.id } });
      const balance = await creditService.getBalance(org.id);
      const Subscription = sequelize.models.Subscription;
      const sub = await Subscription.findOne({
        where: { organizationId: org.id, status: 'active' },
        include: [{ model: sequelize.models.Plan, as: 'plan' }],
      });
      enriched.push({
        ...org.toJSON(),
        userCount,
        creditBalance: balance ? {
          totalMinutes: balance.totalMinutes,
          usedMinutes: balance.usedMinutes,
          availableMinutes: Math.max(0, balance.totalMinutes - balance.usedMinutes - balance.reservedMinutes),
        } : null,
        currentPlan: sub?.plan?.name || 'No Plan',
        subscriptionStatus: sub?.status || 'none',
      });
    }
    res.json(enriched);
  } catch (err) {
    logger.error('SuperAdmin orgs error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/organizations', async (req, res) => {
  try {
    const Organization = sequelize.models.Organization;
    const { name, email, phone, slug } = req.body;

    const orgSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const existing = await Organization.findOne({ where: { slug: orgSlug } });
    if (existing) return res.status(409).json({ error: 'Organization slug already exists' });

    const org = await Organization.create({ name, email, phone, slug: orgSlug });

    await sequelize.models.CreditBalance.create({
      organizationId: org.id,
      totalMinutes: 0,
      usedMinutes: 0,
      reservedMinutes: 0,
    });

    const ModuleAccess = sequelize.models.ModuleAccess;
    const defaultModules = ['campaigns', 'reports', 'simulator'];
    for (const mod of defaultModules) {
      await ModuleAccess.create({ organizationId: org.id, moduleName: mod, isEnabled: true });
    }

    res.status(201).json(org);
  } catch (err) {
    logger.error('Create org error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/organizations/:id', async (req, res) => {
  try {
    const Organization = sequelize.models.Organization;
    const org = await Organization.findByPk(req.params.id);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const { name, email, phone, isActive, settings } = req.body;
    await org.update({ name, email, phone, isActive, settings });
    res.json(org);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/organizations/:id', async (req, res) => {
  try {
    const Organization = sequelize.models.Organization;
    const org = await Organization.findByPk(req.params.id);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const users = await User.findAll({ where: { organizationId: org.id }, attributes: { exclude: ['password'] } });
    const balance = await creditService.getBalance(org.id);
    const ModuleAccess = sequelize.models.ModuleAccess;
    const modules = await ModuleAccess.findAll({ where: { organizationId: org.id } });

    const Subscription = sequelize.models.Subscription;
    const sub = await Subscription.findOne({
      where: { organizationId: org.id, status: 'active' },
      include: [{ model: sequelize.models.Plan, as: 'plan' }],
    });

    res.json({
      ...org.toJSON(),
      users,
      creditBalance: balance,
      modules,
      subscription: sub,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/organizations/:id/assign-plan', async (req, res) => {
  try {
    const { planId } = req.body;
    const Plan = sequelize.models.Plan;
    const Subscription = sequelize.models.Subscription;
    const plan = await Plan.findByPk(planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    await Subscription.update(
      { status: 'cancelled' },
      { where: { organizationId: req.params.id, status: 'active' } }
    );

    const now = new Date();
    const periodEnd = new Date(now);
    if (plan.billingCycle === 'monthly') periodEnd.setMonth(periodEnd.getMonth() + 1);
    else if (plan.billingCycle === 'quarterly') periodEnd.setMonth(periodEnd.getMonth() + 3);
    else periodEnd.setFullYear(periodEnd.getFullYear() + 1);

    const sub = await Subscription.create({
      organizationId: req.params.id,
      planId,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    });

    await creditService.addMinutes(req.params.id, plan.creditMinutes, {
      type: 'plan_credit',
      description: `Plan activation: ${plan.name} — ${plan.creditMinutes} minutes`,
    });

    res.json({ subscription: sub, plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/organizations/:id/add-credits', async (req, res) => {
  try {
    const { minutes, description } = req.body;
    await creditService.addMinutes(req.params.id, minutes, {
      type: 'adjustment',
      description: description || `Manual credit adjustment: +${minutes} minutes`,
    });
    const balance = await creditService.getBalance(req.params.id);
    res.json({ success: true, balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/organizations/:id/create-user', async (req, res) => {
  try {
    const { email, password, name, role = 'admin' } = req.body;
    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already exists' });

    const user = await User.create({
      email, password, name,
      role: role === 'superadmin' ? 'admin' : role,
      organizationId: req.params.id,
    });
    res.status(201).json(user.toJSON());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/organizations/:orgId/modules', async (req, res) => {
  try {
    const { modules } = req.body;
    const ModuleAccess = sequelize.models.ModuleAccess;

    for (const [moduleName, isEnabled] of Object.entries(modules)) {
      await ModuleAccess.upsert({
        organizationId: req.params.orgId,
        moduleName,
        isEnabled,
      });
    }

    const updated = await ModuleAccess.findAll({ where: { organizationId: req.params.orgId } });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/plans', async (req, res) => {
  try {
    const Plan = sequelize.models.Plan;
    const plans = await Plan.findAll({ order: [['sortOrder', 'ASC']] });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/plans', async (req, res) => {
  try {
    const Plan = sequelize.models.Plan;
    const plan = await Plan.create(req.body);
    res.status(201).json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/plans/:id', async (req, res) => {
  try {
    const Plan = sequelize.models.Plan;
    const plan = await Plan.findByPk(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    await plan.update(req.body);
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/usage', async (req, res) => {
  try {
    const { orgId, from, to } = req.query;
    const Call = require('../models/Call');
    const where = {};
    if (orgId) where.organizationId = orgId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt[Op.gte] = new Date(from);
      if (to) where.createdAt[Op.lte] = new Date(to);
    }

    const calls = await Call.findAll({
      where,
      attributes: [
        'organizationId',
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalCalls'],
        [sequelize.fn('SUM', sequelize.col('duration')), 'totalDuration'],
        [sequelize.fn('COUNT', sequelize.literal("CASE WHEN status='completed' THEN 1 END")), 'completedCalls'],
        [sequelize.fn('COUNT', sequelize.literal("CASE WHEN status='failed' THEN 1 END")), 'failedCalls'],
      ],
      group: ['organizationId'],
      raw: true,
    });

    const Organization = sequelize.models.Organization;
    const enriched = [];
    for (const row of calls) {
      const org = row.organizationId ? await Organization.findByPk(row.organizationId, { attributes: ['id', 'name', 'slug'] }) : null;
      enriched.push({
        organization: org ? org.toJSON() : { id: null, name: 'Unassigned' },
        totalCalls: parseInt(row.totalCalls) || 0,
        totalDuration: parseInt(row.totalDuration) || 0,
        totalMinutes: ((parseInt(row.totalDuration) || 0) / 60).toFixed(2),
        completedCalls: parseInt(row.completedCalls) || 0,
        failedCalls: parseInt(row.failedCalls) || 0,
      });
    }

    res.json(enriched);
  } catch (err) {
    logger.error('Usage stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/usage/export', async (req, res) => {
  try {
    const { orgId, from, to } = req.query;
    const Call = require('../models/Call');
    const where = {};
    if (orgId) where.organizationId = orgId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt[Op.gte] = new Date(from);
      if (to) where.createdAt[Op.lte] = new Date(to);
    }

    const calls = await Call.findAll({
      where,
      order: [['createdAt', 'DESC']],
      raw: true,
    });

    const Organization = sequelize.models.Organization;
    const orgCache = {};

    let csv = 'Call ID,Organization,Phone,Status,Duration (sec),Minutes Used,Date\n';
    for (const call of calls) {
      if (call.organizationId && !orgCache[call.organizationId]) {
        const org = await Organization.findByPk(call.organizationId, { attributes: ['name'] });
        orgCache[call.organizationId] = org?.name || 'Unknown';
      }
      const orgName = orgCache[call.organizationId] || 'Unassigned';
      csv += `${call.id},"${orgName}",${call.toPhone},${call.status},${call.duration || 0},${((call.duration || 0) / 60).toFixed(2)},${call.createdAt}\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="usage_export_${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const Organization = sequelize.models.Organization;
    const Call = require('../models/Call');
    const CreditTransaction = sequelize.models.CreditTransaction;

    const totalOrgs = await Organization.count();
    const activeOrgs = await Organization.count({ where: { isActive: true } });
    const totalUsers = await User.count({ where: { role: { [Op.ne]: 'superadmin' } } });
    const totalCalls = await Call.count();

    const [revenueResult] = await sequelize.query(`
      SELECT COALESCE(SUM(amount), 0) as total_revenue
      FROM credit_transactions
      WHERE type IN ('recharge', 'plan_credit') AND amount > 0
    `);
    const totalRevenue = parseInt(revenueResult[0]?.total_revenue) || 0;

    const [minutesResult] = await sequelize.query(`
      SELECT COALESCE(SUM(ABS(minutes)), 0) as total_minutes
      FROM credit_transactions WHERE type = 'usage'
    `);
    const totalMinutesUsed = parseFloat(minutesResult[0]?.total_minutes) || 0;

    res.json({
      totalOrgs,
      activeOrgs,
      totalUsers,
      totalCalls,
      totalRevenue,
      totalMinutesUsed: totalMinutesUsed.toFixed(2),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
