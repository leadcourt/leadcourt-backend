const express = require('express');
const router = express.Router();
const { processWebhook } = require('../controllers/webhookController');

router.post('/', processWebhook);

module.exports = router;