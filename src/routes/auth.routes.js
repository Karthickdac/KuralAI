/**
 * Auth Routes - /api/auth
 */
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const User = require('../models/User');
const logger = require('../utils/logger');

// POST /api/auth/login
router.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
  ],
  validate,
  async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email, isActive: true } });
    if (!user || !(await user.validatePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, organizationId: user.organizationId || null },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    logger.info(`User logged in: ${email} (role: ${user.role}, org: ${user.organizationId || 'none'})`);
    res.json({ success: true, token, user: user.toJSON() });
  }
);

// POST /api/auth/register (superadmin only)
const { authenticateToken } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/tenant');

router.post('/register',
  authenticateToken,
  requireSuperAdmin,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('name').trim().isLength({ min: 2 }),
  ],
  validate,
  async (req, res) => {
    const { email, password, name, role = 'viewer', organizationId } = req.body;

    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const safeRole = role === 'superadmin' ? 'admin' : role;
    const user = await User.create({ email, password, name, role: safeRole, organizationId: organizationId || null });
    res.status(201).json({ success: true, user: user.toJSON() });
  }
);

module.exports = router;
