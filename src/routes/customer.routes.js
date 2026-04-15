const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { authenticateTokenOrApiKey } = require('../middleware/apiKeyAuth');
const { tenantScope } = require('../middleware/tenant');
const { checkPlanLimit } = require('../middleware/planLimits');
const {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  updatePreference,
  deletePreference,
} = require('../controllers/customerController');

router.use(authenticateTokenOrApiKey);
router.use(tenantScope);

router.get('/',                             listCustomers);
router.post('/',          checkPlanLimit('customers'), createCustomer);
router.get('/:id',                          getCustomer);
router.put('/:id',                          updateCustomer);
router.delete('/:id',                       requireAdmin, deleteCustomer);
router.patch('/:id/preferences',            updatePreference);
router.delete('/:id/preferences/:key',      deletePreference);

module.exports = router;
