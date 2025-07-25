const { withAccessQueue } = require('../utils/accessQueueMap');
const { accessDb } = require('../config/duckdb');

accessDb.run(`
  CREATE TABLE IF NOT EXISTS access_logs (
    userId TEXT,
    row_id INTEGER,
    accessType INTEGER,
    PRIMARY KEY(userId, row_id)
);
`);

exports.logAccess = async (userId, row_id, newVal) => {
  await withAccessQueue(userId, row_id, async () => {
    const stmt = `
      INSERT INTO access_logs (userId, row_id, accessType)
      VALUES ('${userId}', ${row_id}, ${newVal})
      ON CONFLICT(userId, row_id)
      DO UPDATE SET accessType = 
        CASE 
          WHEN access_logs.accessType = 1 AND ${newVal} = 2 THEN 3
          WHEN access_logs.accessType = 2 AND ${newVal} = 1 THEN 3
          WHEN access_logs.accessType = 3 THEN 3
          WHEN access_logs.accessType = 4 THEN 4
          ELSE ${newVal}
        END;
    `;

    return new Promise((resolve, reject) => {
      accessDb.run(stmt, (err) => (err ? reject(err) : resolve()));
    });
  });
};

exports.getAccessMap = async (userId, rowIds = []) => {
    if (!rowIds.length) return {};

    const map = {};
    const chunkSize = 5000;
    const chunks = [];

    for (let i = 0; i < rowIds.length; i += chunkSize) {
        chunks.push(rowIds.slice(i, i + chunkSize));
    }

    try {
        await Promise.all(chunks.map(async (chunk) => {
            const placeholders = chunk.join(',');
            const stmt = `
                SELECT row_id, accessType
                FROM access_logs
                WHERE userId = ? AND row_id IN (${placeholders});
            `;

            const rows = await new Promise((resolve, reject) => {
                accessDb.all(stmt, [userId], (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                });
            });

            for (const row of rows) {
                map[`${userId}_${row.row_id}`] = row.accessType;
            }
        }));
    } catch (err) {
        console.error("getAccessMap Error:", err);
        throw err;
    }

    return map;
};

exports.logAccessBatch = async (userId, rowIds, newVal) => {
  if (!Array.isArray(rowIds) || !rowIds.length) return;

  const values = rowIds
    .map(id => `('${userId}', ${id}, ${newVal})`)
    .join(',');

  const stmt = `
    INSERT INTO access_logs (userId, row_id, accessType)
    VALUES ${values}
    ON CONFLICT(userId, row_id)
    DO UPDATE SET accessType = 
      CASE 
        WHEN access_logs.accessType = 1 AND ${newVal} = 2 THEN 3
        WHEN access_logs.accessType = 2 AND ${newVal} = 1 THEN 3
        WHEN access_logs.accessType = 3 THEN 3
        WHEN access_logs.accessType = 4 THEN 4
        ELSE ${newVal}
      END;
  `;

  return new Promise((resolve, reject) => {
    accessDb.run(stmt, (err) => (err ? reject(err) : resolve()));
  });
};