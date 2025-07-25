const express = require('express');
const router = express.Router();
const sabpaisaController = require('../controllers/sabpaisaController');
const { authenticateJWT } = require('../middleware/auth');

router.post('/payments', authenticateJWT, sabpaisaController.initiateSabPaisaPayment);

router.post('/payments/return', sabpaisaController.handleSabPaisaReturn);

module.exports = router;
