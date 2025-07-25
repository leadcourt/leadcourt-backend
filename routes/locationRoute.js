const express = require('express');
const geoip = require('geoip-lite');
const router = express.Router();

router.get('/get-country', (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.connection.remoteAddress;
  const geo = geoip.lookup(ip);

  if (!geo || !geo.country) return res.status(404).json({ error: 'Country not found' });

  res.json({ country: geo.country });
});

module.exports = router;
