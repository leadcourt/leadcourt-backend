const express = require('express');
const router = express.Router();
const { exchangeAuthCode, exportListToHubspot, checkHubspotConnection, removeHubspotConnection } = require('../controllers/crm/hubspot');
const { authenticateJWT } = require('../middleware/auth');

router.post('/exchange-code', authenticateJWT, exchangeAuthCode);
router.post('/export', authenticateJWT, exportListToHubspot);
router.get('/check', authenticateJWT, checkHubspotConnection);
router.delete('/remove', authenticateJWT, removeHubspotConnection);

module.exports = router;
