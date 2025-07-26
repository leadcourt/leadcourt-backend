const express = require('express');
const Credits = require('../../models/Credits');
const router = express.Router();
const { collabAuthenticateJWT } = require('../../middleware/collabAuth');

router.get('/total', collabAuthenticateJWT, async (req, res) => {
  const { uid: userId } = req.user;

  try {
    const creditsDoc = await Credits.findOneAndUpdate(
      { userId },
      { $setOnInsert: { credits: 500, activePlan: 'FREE' } },
      { upsert: true, new: true }
    );
                                                
    res.json({
      credits: creditsDoc.credits,
      subscriptionType: creditsDoc.activePlan || null
    });
  } catch (err) {
    console.error('Error fetching credits:', err);
    res.status(500).json({ error: 'Failed to fetch credits' });
  }
});

module.exports = router;

