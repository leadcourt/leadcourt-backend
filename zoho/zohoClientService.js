const axios = require('axios');
const qs = require('qs');

const ACCOUNTS_BASE = process.env.ZOHO_ACCOUNTS_BASE || 'https://accounts.zoho.com';
const API_BASE = process.env.ZOHO_API_BASE || 'https://www.zohoapis.com';
const CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const REDIRECT_URI = process.env.ZOHO_REDIRECT_URI;

async function exchangeCodeForTokens(code) {
  const url = `${ACCOUNTS_BASE}/oauth/v2/token`;
  const params = {
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code'
  };

  const res = await axios.post(url, qs.stringify(params), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return res.data; // contains access_token, refresh_token, expires_in etc.
}

async function refreshAccessToken(refreshToken) {
  const url = `${ACCOUNTS_BASE}/oauth/v2/token`;
  const params = {
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token'
  };

  const res = await axios.post(url, qs.stringify(params), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return res.data; // new access_token and expires_in
}

async function createZohoRecord(accessToken, moduleName, records) {
  // records: array of objects for Zoho format
  const url = `${API_BASE}/crm/v2/${moduleName}`;
  const res = await axios.post(url, { data: records }, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
  });
  return res.data;
}

module.exports = { exchangeCodeForTokens, refreshAccessToken, createZohoRecord };
