const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenant');
const { validate } = require('../middleware/validate');
const User = require('../models/User');

router.use(authenticateToken);
router.use(requireAdmin);
router.use(tenantScope);

router.get('/', async (req, res) => {
  try {
    const orgFilter = req.tenantScope || {};
    const users = await User.findAll({ where: { ...orgFilter }, order: [['createdAt', 'DESC']] });
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/',
  [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('name').notEmpty().withMessage('Name required'),
    body('role').optional().isIn(['admin', 'viewer']),
  ],
  validate,
  async (req, res) => {
    try {
      const { email, password, name, role = 'viewer' } = req.body;
      const existing = await User.findOne({ where: { email } });
      if (existing) return res.status(400).json({ success: false, error: 'Email already in use' });
      const orgId = req.user?.organizationId || null;
      const user = await User.create({ email, password, name, role, organizationId: orgId });
      res.status(201).json({ success: true, user });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.put('/:id',
  [
    param('id').isUUID(),
    body('name').optional().notEmpty(),
    body('role').optional().isIn(['admin', 'viewer']),
    body('isActive').optional().isBoolean(),
    body('password').optional().isLength({ min: 8 }),
  ],
  validate,
  async (req, res) => {
    try {
      const orgFilter = req.tenantScope || {};
      const user = await User.findOne({ where: { id: req.params.id, ...orgFilter } });
      if (!user) return res.status(404).json({ error: 'User not found' });

      const updates = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.role !== undefined) updates.role = req.body.role;
      if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
      if (req.body.password) updates.password = req.body.password;

      await user.update(updates);
      res.json({ success: true, user });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.delete('/:id',
  [param('id').isUUID()],
  validate,
  async (req, res) => {
    try {
      const orgFilter = req.tenantScope || {};
      const user = await User.findOne({ where: { id: req.params.id, ...orgFilter } });
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (user.id === req.user.userId) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }
      await user.destroy();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

module.exports = router;
