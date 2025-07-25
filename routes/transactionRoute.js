const express = require('express');
const router = express.Router();
const { getFormattedTransactions } = require('../controllers\/transactionController');
const { authenticateJWT } = require('../middleware/auth');

router.get('/', authenticateJWT, getFormattedTransactions);

module.exports = router;