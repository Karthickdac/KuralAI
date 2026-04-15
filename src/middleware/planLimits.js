const { sequelize } = require('../config/database');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Campaign = require('../models/Campaign');
const logger = require('../utils/logger');

async function getOrgPlan(organizationId) {
  if (!organizationId) return null;
  const Subscription = sequelize.models.Subscription;
  const Plan = sequelize.models.Plan;
  if (!Subscription || !Plan) return null;

  const sub = await Subscription.findOne({
    where: { organizationId, status: 'active' },
    include: [{ model: Plan, as: 'plan' }],
  });
  return sub?.plan || null;
}

function requireActivePlan() {
  return async (req, res, next) => {
    if (!req.user?.organizationId) return next();
    if (req.user.role === 'superadmin') return next();

    const plan = await getOrgPlan(req.user.organizationId);
    if (!plan) {
      return res.status(403).json({
        error: 'No active subscription. Please subscribe to a plan first.',
        code: 'NO_PLAN',
      });
    }
    req.orgPlan = plan;
    next();
  };
}

function checkPlanLimit(resource) {
  return async (req, res, next) => {
    if (!req.user?.organizationId) return next();
    if (req.user.role === 'superadmin') return next();

    const plan = req.orgPlan || await getOrgPlan(req.user.organizationId);
    if (!plan) {
      return res.status(403).json({ error: 'No active subscription. Please subscribe to a plan.' });
    }

    let currentCount = 0;
    let limit = 0;
    let label = resource;
    const orgId = req.user.organizationId;

    try {
      switch (resource) {
        case 'customers':
          currentCount = await Customer.count({ where: { organizationId: orgId } });
          limit = plan.maxCustomers;
          break;
        case 'campaigns':
          currentCount = await Campaign.count({ where: { organizationId: orgId } });
          limit = plan.maxCampaigns;
          break;
        case 'users': {
          currentCount = await User.count({ where: { organizationId: orgId } });
          limit = plan.maxUsersPerOrg;
          label = 'team members';
          break;
        }
        case 'workflows': {
          const fs = require('fs');
          const path = require('path');
          const wfFile = path.join(__dirname, '../../config/workflows.json');
          try {
            if (fs.existsSync(wfFile)) {
              const wfs = JSON.parse(fs.readFileSync(wfFile, 'utf8'));
              const orgId = req.user.organizationId;
              currentCount = orgId
                ? wfs.filter(w => w.organizationId === orgId).length
                : wfs.length;
            }
          } catch { currentCount = 0; }
          limit = plan.maxWorkflows;
          break;
        }
        default:
          return next();
      }
    } catch (err) {
      logger.error(`Plan limit check error for ${resource}:`, err.message);
      return res.status(500).json({ error: 'Unable to verify plan limits. Please try again.' });
    }

    if (limit === -1) return next();

    if (currentCount >= limit) {
      return res.status(403).json({
        error: `Plan limit reached. Your ${plan.name} plan allows up to ${limit} ${label}. Please upgrade your plan.`,
        code: 'PLAN_LIMIT',
        limit,
        current: currentCount,
        planName: plan.name,
      });
    }

    next();
  };
}

function requirePlanFeature(featureName) {
  return async (req, res, next) => {
    try {
      if (!req.user?.organizationId) return next();
      if (req.user.role === 'superadmin') return next();

      const plan = req.orgPlan || await getOrgPlan(req.user.organizationId);
      if (!plan) {
        return res.status(403).json({ error: 'No active subscription. Please subscribe to a plan.' });
      }

      if (!plan.features || !plan.features[featureName]) {
        const labels = {
          crmIntegration: 'CRM Integration',
          apiConfig: 'API Access',
          voiceCloning: 'Voice Cloning',
          slangCustomization: 'Natural Slang Customization',
          midCallTools: 'Mid-Call Tools',
          knowledgebases: 'Knowledgebases',
          callRecording: 'Call Recording',
          templates: 'Templates',
          customPrompts: 'Custom Prompts',
          bulkImport: 'Bulk Import',
          whiteLabel: 'White Label',
        };
        const label = labels[featureName] || featureName;
        return res.status(403).json({
          error: `${label} is not available on your ${plan.name} plan. Please upgrade to access this feature.`,
          code: 'FEATURE_LOCKED',
          feature: featureName,
          planName: plan.name,
        });
      }

      next();
    } catch (err) {
      logger.error(`Plan feature check error for ${featureName}:`, err.message);
      return res.status(500).json({ error: 'Unable to verify plan features. Please try again.' });
    }
  };
}

function requireCredits(minutesNeeded = 2) {
  return async (req, res, next) => {
    try {
      if (!req.user?.organizationId) return next();
      if (req.user.role === 'superadmin') return next();

      const creditService = require('../services/creditService');
      const hasCredits = await creditService.hasEnoughCredits(req.user.organizationId, minutesNeeded);
      if (!hasCredits) {
        return res.status(403).json({
          error: `Insufficient call credits. You need at least ${minutesNeeded} minutes. Please recharge your credits.`,
          code: 'NO_CREDITS',
        });
      }
      next();
    } catch (err) {
      logger.error('Credit check error:', err.message);
      return res.status(500).json({ error: 'Unable to verify credits. Please try again.' });
    }
  };
}

module.exports = { getOrgPlan, requireActivePlan, checkPlanLimit, requirePlanFeature, requireCredits };
