const buildEmailPhoneQuery = require('../queries/emailPhoneQuery');
const { getAccessMap, logAccessBatch } = require('../services/accessLogger');
const { peopleDb: db, optionsDb } = require('../config/duckdb');
const Credits = require('../models/Credits');

// Filter API
const synonymMap = {
  ceo: ['chief', 'executive', 'officer'],
  cfo: ['financial', 'officer'],
  coo: ['chief', 'operating', 'officer'],
  cto: ['chief', 'technical', 'officer'],
  cmo: ['chief', 'marketing', 'officer'],
  cio: ['chief', 'information', 'officer'],
  cso: ['chief', 'strategy', 'officer'],
  cpo: ['chief', 'product', 'officer', 'chief', 'people', 'officer'],
  cao: ['chief', 'administrative', 'officer'],
  cdo: ['chief', 'data', 'officer', 'chief', 'digital', 'officer'],
  hr: ['human', 'resources'],
  vp: ['vice', 'president'],
  svp: ['senior', 'vice', 'president'],
  avp: ['assistant', 'vice', 'president', 'associate', 'vice', 'president'],
  md: ['managing', 'director'],
  gm: ['general', 'manager'],
  bd: ['business', 'development'],
  bdm: ['business', 'development', 'manager'],
  sdr: ['sales', 'development', 'representative'],
  bdr: ['business', 'development', 'representative'],
  ae: ['account', 'executive'],
  am: ['account', 'manager'],
  sam: ['senior', 'account', 'manager'],
  pm: ['product', 'manager', 'project', 'manager'],
  tpm: ['technical', 'program', 'manager'],
  sde: ['software', 'development', 'engineer'],
  swe: ['software', 'engineer'],
  qa: ['quality', 'assurance'],
  ux: ['user', 'experience', 'designer'],
  ui: ['user', 'interface', 'designer'],
  cs: ['customer', 'success'],
  csm: ['customer', 'success', 'manager'],
  crm: ['customer', 'relationship', 'manager'],
  pr: ['public', 'relations'],
  pa: ['personal', 'assistant'],
  ea: ['executive', 'assistant']
};

function expandShortforms(query) {
  const words = query.toLowerCase().split(/\s+/);
  const expandedWords = [];

  for (const word of words) {
    if (word.length <= 4 && synonymMap[word]) {
      expandedWords.push(...synonymMap[word]);
    } else {
      expandedWords.push(word);
    }
  }

  return expandedWords;
}

exports.filterLeads = async (req, res) => {

  const { filters = {}, page = 1, limit: reqLimit } = req.body;
  const { uid: userId } = req.user;
  const creditsDoc = await Credits.findOne({ userId });
  const subscriptionType = creditsDoc?.activePlan || null;

  if (!subscriptionType || subscriptionType === 'FREE') {
    for (const key of Object.keys(filters)) {
      if (key.toLowerCase() === 'orgsize' || key.toLowerCase() === 'orgindustry') {
        delete filters[key];
      }
    }
  }

  try {

    const { searchQuery = '', ...otherFilters } = filters;

    const fieldMap = {
      Organization: "organization",
      City: "city",
      State: "state",
      Country: "country",
      orgSize: "\"Org Size\"",
      orgIndustry: "\"Org Industry\""
    };

    const whereConditions = [];

    for (const [camelCaseField, dbField] of Object.entries(fieldMap)) {
      const values = otherFilters[camelCaseField];
      if (Array.isArray(values) && values.length > 0) {
        const safeVals = values.map(v => `'${v.trim().toLowerCase().replace(/'/g, "''")}'`);
        whereConditions.push(`${dbField} IN (${safeVals.join(', ')})`);
      }
    }

    let tokenSources = [];

    if (searchQuery?.trim()) {
      tokenSources = searchQuery.split(',').map(q => q.trim()).filter(Boolean);
    } else if (Array.isArray(filters.Designation) && filters.Designation.length > 0) {
      tokenSources = filters.Designation.map(d => d.trim()).filter(Boolean);
    }

    const tokenConditions = [];

    for (const source of tokenSources) {
      const tokens = expandShortforms(source);
      if (tokens.length > 0) {
        const containsClauses = tokens.map(token => `list_contains(words_array, '${token}')`);
        tokenConditions.push(`(${containsClauses.join(' AND ')})`);
      }
    }

    if (tokenConditions.length > 0) {
      whereConditions.push(`(${tokenConditions.join(' OR ')})`);
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const limit = Number(reqLimit) || 25;
    const offset = (page - 1) * limit;

    const dataQuery = `
      SELECT row_id, Name, Designation, Email, Phone, NULL AS "LinkedIn URL", 
             Organization, City, State, Country,
             "Org Size", "Org Industry"
      FROM people
      ${whereClause}
      ORDER BY row_id
      LIMIT ${limit}
      OFFSET ${offset};
    `;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM people
      ${whereClause};
    `;

    const [rows, countRows] = await Promise.all([
      new Promise((resolve, reject) => {
        db.all(dataQuery, (err, rows) => (err ? reject(err) : resolve(rows)));
      }),
      new Promise((resolve, reject) => {
        db.all(countQuery, (err, rows) => (err ? reject(err) : resolve(rows)));
      })
    ]);

    const ids = rows.map(r => Number(r.row_id));

    const accessMap = await getAccessMap(userId, ids);

    const cleaned = rows.map(row => {
      const rowId = Number(row.row_id);
      const accessKey = `${userId}_${rowId}`;
      const accessType = accessMap[accessKey];
      return {
        ...row,
        row_id: rowId,
        Email: [1, 3, 4].includes(accessType) ? row.Email : null,
        Phone: [2, 3, 4].includes(accessType) ? row.Phone || "NIL" : null
      };
    });

    const count = countRows[0]?.total || 0;

    res.json({ cleaned, count: Number(count) });

  } catch (err) {
    console.error('filterLeads Error:', err);
    res.status(500).json({ error: "Filter processing failed" });
  }
};

// Get Email or Phone
exports.getEmailOrPhone = async (req, res) => {
  const { row_ids, type } = req.body;
  const { uid: userId } = req.user;

  if (!Array.isArray(row_ids) || row_ids.length === 0 || !type || !userId) {
    return res.status(400).json({ error: 'row_ids (array) and type are required' });
  }

  try {
    const userCredits = await Credits.findOne({ userId });
    if (!userCredits || userCredits.credits <= 0) {
      return res.json({ error: 'Insufficient credits' });
    }

    const accessMap = await getAccessMap(userId, row_ids);

    let totalCreditsRequired = 0;
    const rowsToLog = [];
    const results = [];

    for (const row_id of row_ids) {
      const query = buildEmailPhoneQuery(row_id, type);
      const rows = await new Promise((resolve, reject) => {
        db.all(query, (err, rows) => (err ? reject(err) : resolve(rows)));
      });

      const result = rows[0] || {};
      if (type === 'phone') result.Phone = result.Phone || "NIL";
      if (type === 'email' && !result.Email) result.Email = "NIL";
      if (type === 'both') {
        result.Phone = result.Phone || "NIL";
        result.Email = result.Email || "NIL";
      }

      results.push({ row_id, ...result });

      const isInvalidData =
        (type === 'email' && (!result.Email || result.Email === 'NIL')) ||
        (type === 'phone' && (!result.Phone || result.Phone === 'NIL')) ||
        (type === 'both' &&
          (!result.Email || result.Email === 'NIL') &&
          (!result.Phone || result.Phone === 'NIL'));

      const skipCreditDeduction = isInvalidData;

      const accessKey = `${userId}_${row_id}`;
      const currentAccess = accessMap[accessKey] || 0;
      let newVal;
      let creditsToDeduct = 0;

      if (type === 'email') {
        newVal = currentAccess === 2 ? 3 : 1;
        creditsToDeduct = currentAccess === 0 ? 1 : (currentAccess === 2 ? 1 : 0);
      } else if (type === 'phone') {
        newVal = currentAccess === 1 ? 3 : 2;
        creditsToDeduct = currentAccess === 0 ? 5 : (currentAccess === 1 ? 5 : 0);
      } else if (type === 'both') {
        newVal = 3;
        if (currentAccess === 0) creditsToDeduct = 6;
        else if (currentAccess === 1) creditsToDeduct = 5;
        else if (currentAccess === 2) creditsToDeduct = 1;
      }

      if (!skipCreditDeduction && creditsToDeduct > 0) {
        totalCreditsRequired += creditsToDeduct;
      }

      rowsToLog.push(row_id);
    }

    if (userCredits.credits < totalCreditsRequired) {
      return res.json({ error: 'Insufficient credits' });
    }

    if (rowsToLog.length > 0) {
      if (totalCreditsRequired > 0) {
        await Credits.updateOne(
          { userId },
          { $inc: { credits: -totalCreditsRequired } }
        );
      }

      await logAccessBatch(userId, rowsToLog, type === 'email' ? 1 : type === 'phone' ? 2 : 3);
    }

    res.json({ results, remainingCredits: userCredits.credits - totalCreditsRequired });
  } catch (err) {
    console.error('Error in getEmailOrPhone:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get LinkedIn Url
exports.getLinkedInUrl = (req, res) => {
  const { row_id } = req.body;

  if (!row_id || isNaN(Number(row_id))) {
    return res.status(400).json({ error: 'Valid row_id is required' });
  }

  const sql = `SELECT "LinkedIn URL" FROM people WHERE row_id = ${Number(row_id)} LIMIT 1`;

  db.all(sql, (err, rows) => {
  if (err) {
    console.error('getLinkedInUrl Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  if (!rows || rows.length === 0) {
    return res.status(404).json({ error: 'Row not found' });
  }

  const row = rows[0];
  res.json({ row_id: Number(row_id), linkedin_url: row["LinkedIn URL"] || null });
});
};

//Search Params
exports.searchOptions = (req, res) => {
  const { field, query, page = 1 } = req.body;

  if (!field || !query) {
    return res.status(400).json({ error: 'field and query are required' });
  }

  if (query.length > 100) {
    return res.status(400).json({ error: 'Query too long' });
  }

  const safeField = field.replace(/[^a-zA-Z_]/g, '');
  const safeQuery = query.replace(/'/g, "''").toLowerCase();
  const limit = 100;

  const sql = `
    SELECT DISTINCT Value
    FROM options
    WHERE LOWER(Field) = '${safeField.toLowerCase()}'
      AND LOWER(Value) LIKE '%${safeQuery}%'
    ORDER BY LOWER(Value) = '${safeQuery}' DESC
    LIMIT ${limit};
  `;

  optionsDb.all(sql, (err, rows) => {
    if (err) {
      console.error('Search failed:', err);
      return res.status(500).json({ error: 'Search failed' });
    }

    return res.json(rows.map(r => r.Value));
  });
};

// Designation Search
exports.getDesignations = async (req, res) => {
  const { field, query } = req.body;

  if (!field || !query) {
    return res.status(400).json({ error: 'field and query are required' });
  }

  if (field.toLowerCase() !== 'designation') {
    return res.status(400).json({ error: 'Only "designation" field is supported' });
  }

  if (query.length > 100) {
    return res.status(400).json({ error: 'Query too long' });
  }

  try {
    const tokens = expandShortforms(query);
    if (tokens.length === 0) return res.json([]);

    const tokenClause = tokens.map(t => `list_contains(words_array, '${t}')`).join(' AND ');

    const sql = `
      WITH limited AS (
        SELECT Designation
        FROM people
        WHERE ${tokenClause}
        LIMIT 1000
      )
      SELECT DISTINCT Designation
      FROM limited
      LIMIT 25;
    `;

    db.all(sql, (err, rows) => {
      if (err) {
        console.error('Error in getDesignations:', err);
        return res.status(500).json({ error: 'Failed to fetch designations' });
      }

      const prefixed = rows.map(r => `${query} - ${r.Designation}`);
      res.json(prefixed);
    });

  } catch (err) {
    console.error('getDesignations Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};