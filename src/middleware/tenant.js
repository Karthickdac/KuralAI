const logger = require('../utils/logger');

function tenantScope(req, res, next) {
  if (!req.user) return next();

  if (req.user.role === 'superadmin' || req.user.role === 'api') {
    req.tenantScope = null;
    return next();
  }

  if (!req.user.organizationId) {
    return res.status(403).json({ error: 'No organization assigned to your account.' });
  }

  req.tenantScope = { organizationId: req.user.organizationId };
  next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Super admin access required.' });
  }
  next();
}

function requireOrgAccess(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.role === 'superadmin') return next();
  if (!req.user.organizationId) {
    return res.status(403).json({ error: 'No organization assigned.' });
  }
  next();
}

module.exports = { tenantScope, requireSuperAdmin, requireOrgAccess };
