const axios = require('axios');
const fs = require('fs');
const path = require('path');
const List = require('../../models/List');
const { Parser } = require('json2csv');
const { peopleDb } = require('../../config/duckdb');
const { getAccessMap } = require('../../services/accessLogger');
const HubspotToken = require('../../models/HubspotToken');
const FormData = require('form-data');

const CLIENT_ID = process.env.HUBSPOT_CLIENT_ID;
const CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET;
const REDIRECT_URI = process.env.HUBSPOT_REDIRECT_URI;

const HUBSPOT_CUSTOM_PROPERTIES = [
  { name: 'designation', label: 'Designation' },
  { name: 'org_size', label: 'Org Size' },
  { name: 'org_industry', label: 'Org Industry' },
  { name: 'city', label: 'City' },
  { name: 'state', label: 'State' },
  { name: 'country', label: 'Country' }
];

const ensureCustomPropertiesExist = async (access_token) => {
  for (const prop of HUBSPOT_CUSTOM_PROPERTIES) {
    try {
      await axios.get(`https://api.hubapi.com/crm/v3/properties/contacts/${prop.name}`, {
        headers: { Authorization: `Bearer ${access_token}` }
      });
    } catch (err) {
      if (err.response?.status === 404) {
        await axios.post(
          'https://api.hubapi.com/crm/v3/properties/contacts',
          {
            name: prop.name,
            label: prop.label,
            type: 'string',
            fieldType: 'text',
            groupName: 'contactinformation'
          },
          {
            headers: { Authorization: `Bearer ${access_token}` }
          }
        );
        console.log(`Created HubSpot property: ${prop.name}`);
      } else {
        console.warn(`Failed checking/creating property ${prop.name}:`, err.response?.data || err.message);
      }
    }
  }
};

//OAuth: Code Exchange
exports.exchangeAuthCode = async (req, res) => {
  const { code } = req.body;
  const { uid: userId } = req.user;

  if (!code || !userId) return res.status(400).json({ error: 'Missing code or userId' });

  try {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      code
    });

    const { data } = await axios.post('https://api.hubapi.com/oauth/v1/token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token, refresh_token, expires_in } = data;
    const expires_at = Date.now() + expires_in * 1000;

    await HubspotToken.findByIdAndUpdate(
      userId,
      { access_token, refresh_token, expires_at },
      { upsert: true }
    );

    res.json({ success: true, message: 'HubSpot connected' });
  } catch (err) {
    console.error('Token exchange failed:', err.response?.data || err.message);
    res.status(500).json({ error: 'HubSpot token exchange failed' });
  }
};

//Get Valid Token with Refresh
const getValidAccessToken = async (userId) => {
  const tokenDoc = await HubspotToken.findById(userId);
  if (!tokenDoc) throw new Error('HubSpot not connected');

  if (Date.now() < tokenDoc.expires_at - 60000) return tokenDoc.access_token;

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: tokenDoc.refresh_token
  });

  const { data } = await axios.post('https://api.hubapi.com/oauth/v1/token', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  const { access_token, expires_in } = data;
  const expires_at = Date.now() + expires_in * 1000;

  await HubspotToken.findByIdAndUpdate(tokenDoc._id, { access_token, expires_at });

  return access_token;
};

//Export List to HubSpot
exports.exportListToHubspot = async (req, res) => {
  const { uid: userId } = req.user;
  const { listName } = req.body;
  if (!userId || !listName) return res.status(400).json({ error: 'Missing userId or listName' });

  try {
    const list = await List.findOne({ userId, listName });
    if (!list || !list.rowIds.length) return res.status(404).json({ error: 'List is empty' });

    const rowIds = list.rowIds.filter(id => id !== -1);
    const access_token = await getValidAccessToken(userId);
    await ensureCustomPropertiesExist(access_token);

    const rowIdStr = rowIds.join(',');
    const rows = await new Promise((resolve, reject) => {
      peopleDb.all(`SELECT * FROM people WHERE row_id IN (${rowIdStr})`, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    const accessMap = await getAccessMap(userId, rowIds);
    const finalRows = [];

    for (const row of rows) {
      const accessType = accessMap[`${userId}_${row.row_id}`] || 0;

      const cleaned = {
        email: [1, 3, 4].includes(accessType) ? row.Email || '' : '',
        firstname: (row.Name || '').split(' ')[0] || '',
        phone: [2, 3, 4].includes(accessType) ? row.Phone || '' : '',
        company: row.Organization || '',
        designation: row.Designation || '',
        hs_linkedin_url: row['LinkedIn URL'] || '',
        org_size: row['Org Size'] || '',
        org_industry: row['Org Industry'] || '',
        city: row.City || '',
        state: row.State || '',
        country: row.Country || ''
      };

      if (cleaned.email || cleaned.phone) finalRows.push(cleaned);
    }

    if (!finalRows.length) return res.status(400).json({ error: 'No valid leads with unlocked email/phone' });

    const tmpDir = path.join(__dirname, '../..', 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

    const csvFilename = `hubspot_${Date.now()}.csv`;
    const csvPath = path.join(tmpDir, csvFilename);
    const headers = [
      'email', 'firstname', 'phone', 'company',
      'designation', 'hs_linkedin_url', 'org_size', 'org_industry',
      'city', 'state', 'country'
    ];

    const parser = new Parser({ fields: headers });
    const csv = parser.parse(finalRows);
    await fs.promises.writeFile(csvPath, csv, 'utf-8');

    const importRequest = {
      name: `LeadCourt - ${listName}`,
      createContactListFromImport: true,
      importOperations: { '0-1': 'CREATE' },
      files: [
        {
          fileName: csvFilename,
          fileFormat: 'CSV',
          fileImportPage: {
            hasHeader: true,
            columnMappings: [
              { columnObjectTypeId: '0-1', columnName: 'email', propertyName: 'email', columnType: 'HUBSPOT_ALTERNATE_ID' },
              { columnObjectTypeId: '0-1', columnName: 'firstname', propertyName: 'firstname' },
              { columnObjectTypeId: '0-1', columnName: 'phone', propertyName: 'phone' },
              { columnObjectTypeId: '0-1', columnName: 'company', propertyName: 'company' },
              { columnObjectTypeId: '0-1', columnName: 'designation', propertyName: 'designation' },
              { columnObjectTypeId: '0-1', columnName: 'linkedin Url', propertyName: 'hs_linkedin_url' },
              { columnObjectTypeId: '0-1', columnName: 'org_size', propertyName: 'org_size' },
              { columnObjectTypeId: '0-1', columnName: 'org_industry', propertyName: 'org_industry' },
              { columnObjectTypeId: '0-1', columnName: 'city', propertyName: 'city' },
              { columnObjectTypeId: '0-1', columnName: 'state', propertyName: 'state' },
              { columnObjectTypeId: '0-1', columnName: 'country', propertyName: 'country' }
            ]
          }
        }
      ]
    };

    const importPath = path.join(tmpDir, 'importRequest.json');
    await fs.promises.writeFile(importPath, JSON.stringify(importRequest), 'utf-8');

    // 📦 Construct form-data properly
    const form = new FormData();
    form.append('importRequest', JSON.stringify(importRequest), {
      contentType: 'application/json'
    });
    form.append('files', fs.createReadStream(csvPath), {
      contentType: 'text/csv',
      filename: csvFilename
    });

    const response = await axios.post('https://api.hubapi.com/crm/v3/imports', form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${access_token}`
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    fs.unlinkSync(csvPath);
    fs.unlinkSync(importPath);

    return res.status(200).json({
      success: true,
      portalId: response.data?.importRequestJson?.portalId || null
    });
  } catch (err) {
    console.error('HubSpot import error:', err.response?.data || err.message);
    return res.status(500).json({ error: 'HubSpot import failed' });
  }
};

//Check Hubspot Connection
exports.checkHubspotConnection = async (req, res) => {
  const { uid: userId } = req.user;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  try {
    const tokenDoc = await HubspotToken.findById(userId);
    if (!tokenDoc) return res.json({ connected: false });

    const stillValid = Date.now() < tokenDoc.expires_at;
    return res.json({ connected: stillValid });
  } catch (err) {
    console.error('Check connection failed:', err.message);
    return res.status(500).json({ error: 'Failed to check connection' });
  }
};

//Remove Hubspot Connection
exports.removeHubspotConnection = async (req, res) => {
  const { uid: userId } = req.user;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  try {
    await HubspotToken.findByIdAndDelete(userId);
    return res.json({ success: true, message: 'HubSpot connection removed' });
  } catch (err) {
    console.error('Remove connection failed:', err.message);
    return res.status(500).json({ error: 'Failed to remove HubSpot connection' });
  }
};