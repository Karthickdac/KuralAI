const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  updatePreference,
  deletePreference,
} = require('../controllers/customerController');

router.get('/',                             authenticateToken, listCustomers);
router.post('/',                            authenticateToken, createCustomer);
router.get('/:id',                          authenticateToken, getCustomer);
router.put('/:id',                          authenticateToken, updateCustomer);
router.delete('/:id',                       authenticateToken, requireAdmin, deleteCustomer);
router.patch('/:id/preferences',            authenticateToken, updatePreference);
router.delete('/:id/preferences/:key',      authenticateToken, deletePreference);

module.exports = router;
