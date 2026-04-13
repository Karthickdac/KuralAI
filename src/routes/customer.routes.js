const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { listCustomers, getCustomer, updatePreference, deletePreference } = require('../controllers/customerController');

router.get('/',                              authenticateToken, listCustomers);
router.get('/:id',                           authenticateToken, getCustomer);
router.patch('/:id/preferences',             authenticateToken, updatePreference);
router.delete('/:id/preferences/:key',       authenticateToken, deletePreference);

module.exports = router;
