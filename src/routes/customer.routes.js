const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { listCustomers, getCustomer } = require('../controllers/customerController');

router.get('/',    authenticateToken, listCustomers);
router.get('/:id', authenticateToken, getCustomer);

module.exports = router;
