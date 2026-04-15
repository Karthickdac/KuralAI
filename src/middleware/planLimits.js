const { sequelize } = require('../config/database');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Campaign = require('../models/Campaign');

async function getOrgPlanLimits(organizationId) {
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

function checkPlanLimit(resource) {
  return async (req, res, next) => {
    if (!req.user?.organizationId) return next();
    if (req.user.role === 'superadmin') return next();

    const plan = await getOrgPlanLimits(req.user.organizationId);
    if (!plan) {
      return res.status(403).json({ error: 'No active subscription. Please subscribe to a plan.' });
    }

    let currentCount = 0;
    let limit = 0;

    switch (resource) {
      case 'customers':
        currentCount = await Customer.count({ where: { organizationId: req.user.organizationId } });
        limit = plan.maxCustomers;
        break;
      case 'campaigns':
        currentCount = await Campaign.count({ where: { organizationId: req.user.organizationId } });
        limit = plan.maxCampaigns;
        break;
      case 'users':
        currentCount = await User.count({ where: { organizationId: req.user.organizationId } });
        limit = plan.maxUsersPerOrg;
        break;
      case 'workflows':
        limit = plan.maxWorkflows;
        break;
      default:
        return next();
    }

    if (currentCount >= limit) {
      return res.status(403).json({
        error: `Plan limit reached. Your ${plan.name} plan allows ${limit} ${resource}. Please upgrade.`,
        limit,
        current: currentCount,
        planName: plan.name,
      });
    }

    next();
  };
}

module.exports = { checkPlanLimit, getOrgPlanLimits };
