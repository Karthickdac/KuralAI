const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { authenticateTokenOrApiKey } = require('../middleware/apiKeyAuth');
const {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  updatePreference,
  deletePreference,
} = require('../controllers/customerController');

router.get('/',                             authenticateTokenOrApiKey, listCustomers);
router.post('/',                            authenticateTokenOrApiKey, createCustomer);
router.get('/:id',                          authenticateTokenOrApiKey, getCustomer);
router.put('/:id',                          authenticateTokenOrApiKey, updateCustomer);
router.delete('/:id',                       authenticateTokenOrApiKey, requireAdmin, deleteCustomer);
router.patch('/:id/preferences',            authenticateTokenOrApiKey, updatePreference);
router.delete('/:id/preferences/:key',      authenticateTokenOrApiKey, deletePreference);

module.exports = router;
