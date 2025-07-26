const express = require('express');
const router = express.Router();
const { exchangeAuthCode, exportListToHubspot, checkHubspotConnection, removeHubspotConnection } = require('../../controllers/crm/hubspot');
const { collabAuthenticateJWT } = require('../../middleware/collabAuth');

router.post('/exchange-code', collabAuthenticateJWT, exchangeAuthCode);
router.post('/export', collabAuthenticateJWT, exportListToHubspot);
router.get('/check', collabAuthenticateJWT, checkHubspotConnection);
router.delete('/remove', collabAuthenticateJWT, removeHubspotConnection);

module.exports = router;
