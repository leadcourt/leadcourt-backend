const duckdb = require('duckdb');
const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');
const { getAccessMap } = require('../services/accessLogger');
const { sendCSVEmail } = require('../services/emailService');
const { peopleDb } = require('../config/duckdb');
const { accessDb } = require('../config/duckdb');
const jobDir = path.resolve(__dirname, '../export_jobs');
const failedDir = path.resolve(__dirname, '../failed_jobs');

if (!fs.existsSync(failedDir)) fs.mkdirSync(failedDir);

// export cron job
exports.runExportJobs = async (req, res) => {
  let processedCount = 0;

  const processDir = async (dirPath, isRetry = false) => {
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const jobPath = path.join(dirPath, file);
      const job = JSON.parse(fs.readFileSync(jobPath, 'utf-8'));
      const { userId, rowIds, email, listName } = job;

      try {
        const rowIdStr = rowIds.join(',');
        const rows = await new Promise((resolve, reject) => {
          peopleDb.all(
            `SELECT * FROM people WHERE row_id IN (${rowIdStr})`,
            (err, result) => err ? reject(err) : resolve(result)
          );
        });

        const accessMap = await getAccessMap(userId, rowIds);
        const finalRows = [];
        const defaultHeaders = [
          'Name', 'Designation', 'LinkedIn URL', 'Organization',
          'Org Size', 'Org Industry', 'City', 'State', 'Country'
        ];
        const headerSet = new Set(defaultHeaders);

        for (const row of rows) {
          const rowId = row.row_id;
          const accessType = accessMap[`${userId}_${rowId}`] || 0;

          const cleanedRow = {
            Name: row.Name,
            Designation: row.Designation,
            'LinkedIn URL': row['LinkedIn URL'],
            Organization: row.Organization,
            'Org Size': row['Org Size'],
            'Org Industry': row['Org Industry'],
            City: row.City,
            State: row.State,
            Country: row.Country,
          };

          if ([1, 3].includes(accessType) && row.Email) {
            cleanedRow.Email = row.Email;
            headerSet.add('Email');
          }
          if ([2, 3].includes(accessType) && row.Phone) {
            cleanedRow.Phone = row.Phone;
            headerSet.add('Phone');
          }

          if (cleanedRow.Email || cleanedRow.Phone) {
            finalRows.push(cleanedRow);
          }
        }

        const headers = [
          'Name', 'Designation', 'Email', 'Phone',
          ...defaultHeaders.filter(h => !['Name', 'Designation', 'Email', 'Phone'].includes(h))
        ];
        if (finalRows.length > 0) {
          const parser = new Parser({ fields: headers });
          const csv = parser.parse(finalRows);
          const buffer = Buffer.from(csv, 'utf-8');
          const filename = listName ? `${listName}.csv` : 'export.csv';
          await sendCSVEmail(email, buffer, filename);
        }

        fs.unlinkSync(jobPath);
        console.log(`${isRetry ? 'Retried' : 'Processed'} export: ${job.jobId}`);
        processedCount++;
      } catch (err) {
        console.error(`${isRetry ? 'Retry' : 'Export'} failed for job ${file}:`, err);
        if (!isRetry) {
          fs.renameSync(jobPath, path.join(failedDir, file));
        }
      }
    }
  };

  await processDir(jobDir, false); 
  await processDir(failedDir, true);

  if (processedCount > 0) {
    res.json({ done: true, processed: processedCount });
  } else {
    res.status(204).end();
  }
};

// checkpoint cron job
exports.runCheckpoint = async (req, res) => {
  const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

  accessDb.run('CHECKPOINT;', (err) => {
    if (err) log('Access log checkpoint failed: ' + err);
    else log('Access log checkpointed');
  });

  res.json({ success: true });
};