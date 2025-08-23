const express = require('express');
const Credits = require('../models/Credits');
const { authenticateJWT } = require('../middleware/auth');
const { handlePlanExpiry } = require('../services/purchasePlan');
const router = express.Router();

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com','yahoo.com','outlook.com','hotmail.com','live.com','aol.com',
  'icloud.com','me.com','msn.com','proton.me','protonmail.com','pm.me',
  'gmx.com','yandex.com','zoho.com','mail.com','fastmail.com',
  'rediffmail.com','inbox.com','hushmail.com'
]);

function getDefaultCredits(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return 200;
  const domain = email.split('@').pop().toLowerCase();
  return FREE_EMAIL_DOMAINS.has(domain) ? 200 : 500;
}

router.get('/total', authenticateJWT, async (req, res) => {
  const { uid: userId, email } = req.user;

  try {
    const defaultCredits = getDefaultCredits(email);
    let creditsDoc = await Credits.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: {
          credits: defaultCredits,
          activePlan: 'FREE',
          expiresAt: null,
          starterRemainingDays: 0,
          proRemainingDays: 0,
          lastUpdated: new Date()
        }
      },
      { upsert: true, new: true }
    );
    if (creditsDoc.activePlan !== 'FREE' && creditsDoc.expiresAt) {
      await handlePlanExpiry(userId);
      creditsDoc = await Credits.findOne({ userId });
    }

    res.json({
      credits: creditsDoc.credits,
      subscriptionType: creditsDoc.activePlan || null,
      expiresAt: creditsDoc.expiresAt,
      starterRemainingDays: creditsDoc.starterRemainingDays || 0,
      proRemainingDays: creditsDoc.proRemainingDays || 0
    });
  } catch (err) {
    console.error('Error fetching credits:', err);
    res.status(500).json({ error: 'Failed to fetch credits' });
  }
});

module.exports = router;
