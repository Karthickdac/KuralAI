const { sequelize } = require('../config/database');

function requireModule(moduleName) {
  return async (req, res, next) => {
    if (!req.user?.organizationId) return next();
    if (req.user.role === 'superadmin') return next();

    const ModuleAccess = sequelize.models.ModuleAccess;
    if (!ModuleAccess) return next();

    const access = await ModuleAccess.findOne({
      where: { organizationId: req.user.organizationId, moduleName },
    });

    if (!access || !access.isEnabled) {
      return res.status(403).json({
        error: `The ${moduleName} module is not enabled for your organization. Contact your administrator.`,
      });
    }

    next();
  };
}

module.exports = { requireModule };
