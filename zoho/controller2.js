// controllers/crm/zoho.js
const axios = require('axios');
const User = require('../../models/user.model');
require('dotenv').config();

const ZOHO_ACCOUNTS_BASE = process.env.ZOHO_ACCOUNTS_BASE || 'https://accounts.zoho.com';
const CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const REDIRECT_URI = process.env.ZOHO_REDIRECT_URI;

// Step A: Provide Zoho auth URL for frontend
exports.getZohoAuthUrl = (req, res) => {
  const scope = 'ZohoCRM.modules.ALL'; // Adjust as needed
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope,
    redirect_uri: REDIRECT_URI,
    access_type: 'offline',
    prompt: 'consent',
  });
  const url = `${ZOHO_ACCOUNTS_BASE}/oauth/v2/auth?${params.toString()}`;
  res.json({ url });
};

// Step B: Exchange authorization code for tokens
exports.exchangeZohoAuthCode = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Missing code' });

    const tokenResponse = await axios.post(
      `${ZOHO_ACCOUNTS_BASE}/oauth/v2/token`,
      null,
      {
        params: {
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    const expiryDate = new Date(Date.now() + expires_in * 1000);


    
        await HubspotToken.findByIdAndUpdate(
          userId,
          { access_token, refresh_token, expires_at },
          { upsert: true }
        );
    
    await User.findByIdAndUpdate(
      req.user.uid,
      {
        zoho: {
          accessToken: access_token,
          refreshToken: refresh_token,
          expires_at: expiryDate,
        },
      },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Zoho exchange error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Zoho authentication failed' });
  }
};
