const ZohoModel = require("./zohoModel");
const zohoClient = require("./zohoClientService");

/**
 * Step 1: Redirect URL from frontend should open Zoho's OAuth page.
 * We only provide a backend helper that returns the authorize URL (optional).
 */
exports.getZohoAuthUrl = (req, res) => {
  const ACCOUNTS_BASE =
    process.env.ZOHO_ACCOUNTS_BASE || "https://accounts.zoho.com";
  const clientId = process.env.ZOHO_CLIENT_ID;
  const redirectUri = process.env.ZOHO_REDIRECT_URI;
  const scope = "ZohoCRM.modules.ALL"; // adjust scopes as needed (recommend minimal scopes)
  const params = new URLSearchParams({
    client_id: clientId,
    scope,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
  });
  const url = `${ACCOUNTS_BASE}/oauth/v2/auth?${params.toString()}`;
  return res.json({ url });
};

/**
 * Callback: Exchange authorization code for tokens and save them to the user record.
 * This route is called by frontend redirect with ?code=...
 */
exports.zohoCallback = async (req, res) => {
  
  try {
    // Expect frontend to call this endpoint and include Firebase auth
    const { code } = req.body; 

    // const code = req.query.code;
    if (!code) return res.status(400).json({ message: 'Missing code' });

    // req.user provided by authenticateJWT middleware
    const uid = req.user.uid;

    const tokenData = await zohoClient.exchangeCodeForTokens(code);
    // tokenData: { access_token, refresh_token, expires_in, api_domain, ... }

    const expires_at = new Date(Date.now() + tokenData.expires_in * 1000);

    // Store tokens on the user record
    const Zoho = await ZohoModel.findByIdAndUpdate(
      uid,
      {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expires_at: expires_at,
        connectedAt: new Date(),
        // region: tokenData.api_domain || process.env.ZOHO_API_BASE
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({ success: true, message: 'Zoho connected' });
    // Or respond with JSON:
    // return res.json({ success: true, user });
  } catch (err) {
    console.error("Zoho callback error", err.response?.data || err.message);
    return res.redirect(
      `${process.env.FRONTEND_BASE}/zoho/connected?status=error`
    );
    // Or res.status(500).json({ message: 'Zoho callback failed' });
  }
};

/**
 * Export current user's data to Zoho (example: create Leads)
 * Protected by authenticateJWT; uses stored refresh token if needed.
 */
exports.exportToZoho = async (req, res) => {
  try {
    const uid = req.user.uid;
    const Zoho = await ZohoModel.findById(uid);
    if (!Zoho || !Zoho.refreshToken) {
      return res
        .status(400)
        .json({ message: "Zoho not connected for this user" });
    }

    // Ensure valid access token (refresh if expired)
    let accessToken = Zoho.accessToken;
    if (!accessToken || new Date() >= Zoho.expires_at) {
      const refreshed = await zohoClient.refreshAccessToken(Zoho.refreshToken);
      accessToken = refreshed.access_token;
      Zoho.accessToken = accessToken;
      Zoho.expires_at = new Date(Date.now() + refreshed.expires_in * 1000);
      await Zoho.save();
    }

    // Build payload from user's app data (example)
    // In practice, fetch the actual data to export (lists, contacts, leads) based on req.body
    // Example payload for Leads:
    const { records } = req.body; // expect frontend to send an array of objects mapped to Zoho fields
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ message: "No records provided" });
    }

    const result = await zohoClient.createZohoRecord(
      accessToken,
      "Leads",
      records
    );
    return res.json({ success: true, result });
  } catch (err) {
    console.error("Export to Zoho error", err.response?.data || err.message);
    return res
      .status(500)
      .json({
        message: "Export failed",
        error: err.response?.data || err.message,
      });
  }
};

// Step B: Exchange authorization code for tokens
exports.exchangeZohoAuthCode = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: "Missing code" });

    const tokenResponse = await axios.post(
      `${ZOHO_ACCOUNTS_BASE}/oauth/v2/token`,
      null,
      {
        params: {
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    const expiryDate = new Date(Date.now() + expires_in * 1000);

    // await HubspotToken.findByIdAndUpdate(
    //   req.user.uid,
    //   { access_token, refresh_token, expires_at },
    //   { upsert: true }
    // );
    // {
    //     accessToken: tokenData.access_token,
    //     refreshToken: tokenData.refresh_token,
    //     expires_at,
    //     connectedAt: new Date(),
    //     // region: tokenData.api_domain || process.env.ZOHO_API_BASE
    // }

    await ZohoModel.findByIdAndUpdate(
      req.user.uid,
      {
        accessToken: access_token,
        refreshToken: refresh_token,
        expires_at: expiryDate,
      },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Zoho exchange error:", err.response?.data || err.message);
    res.status(500).json({ message: "Zoho authentication failed" });
  }
};

exports.checkZohoConnection = async (req, res) => {
  console.log('In zhoho check');
  try {
    const Zoho = await ZohoModel.findById(req.user.id);

    console.log('req.user.id', req.user.id)
    console.log('Zoho', Zoho)

    if (!Zoho?.refresh_token) {
      return res.json({ connected: false, reason: "no_token" });
    }

    try {
      // Optional: test API call to Zoho
      await axios.get("https://www.zohoapis.com/crm/v2/users", {
        headers: {
          Authorization: `Zoho-oauthtoken ${Zoho.access_token}`,
        },
      });
      return res.json({ connected: true });
    } catch (err) {
      return res.json({ connected: false, reason: "token_invalid_or_expired" });
    }
  } catch (error) {
    console.error("Zoho check error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
