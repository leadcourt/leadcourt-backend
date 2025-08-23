const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const zohoController = require('./zohoController');

// optional: return URL to start OAuth
router.get('/auth-url', authenticateJWT, zohoController.getZohoAuthUrl);

router.post('/callback', authenticateJWT, zohoController.zohoCallback);

// export endpoint
router.post('/export', authenticateJWT, zohoController.exportToZoho);


router.get('/check', authenticateJWT, zohoController.checkZohoConnection);

module.exports = router;
