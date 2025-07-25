const List = require('../models/List');
const { peopleDb } = require('../config/duckdb');
const { getAccessMap } = require('../services/accessLogger');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// GET LIST SUMMARY
exports.getListSummary = async (req, res) => {
  const { uid: userId } = req.user;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  try {
    const lists = await List.find({ userId });
    const summary = lists.map(list => ({
      name: list.listName,
      total: list.rowIds.filter(id => id !== -1).length
    }));
    res.json(summary);
  } catch (err) {
    console.error("Summary API failed:", err);
    res.status(500).json({ error: 'Failed to fetch list summary' });
  }
};

// STORE LIST (append only new rowIds)
exports.storeList = async (req, res) => {
  const { uid: userId } = req.user;
  const { listName, rowIds } = req.body;

  if (!listName || !Array.isArray(rowIds)) {
    return res.status(400).json({ error: "listName and rowIds[] are required" });
  }

  try {
    const list = await List.findOne({ userId, listName });

    if (list) {
      const existingSet = new Set(list.rowIds);
      const newIds = rowIds.filter(id => !existingSet.has(id));
      list.rowIds.push(...newIds);
      await list.save();
      return res.json({ message: "List updated", inserted: newIds.length });
    } else {
      await List.create({ userId, listName, rowIds });
      return res.json({ message: "List created", inserted: rowIds.length });
    }
  } catch (err) {
    console.error("Store List Error:", err);
    res.status(500).json({ error: "Failed to store list" });
  }
};

// CREATE EMPTY LIST
exports.createEmptyList = async (req, res) => {
  const { uid: userId } = req.user;
  const { listName } = req.body;

  if (!listName) return res.status(400).json({ error: "listName is required" });

  try {
    const exists = await List.findOne({ userId, listName });
    if (exists) return res.status(400).json({ error: "List already exists" });

    await List.create({ userId, listName, rowIds: [-1] });
    res.json({ message: `Empty list '${listName}' created successfully` });
  } catch (err) {
    console.error("Create List Error:", err);
    res.status(500).json({ error: "Failed to create list" });
  }
};

// SHOW LIST (paginated)
exports.showList = async (req, res) => {
  const { uid: userId } = req.user;
  const { listName, page = 1 } = req.body;

  if (!listName) return res.status(400).json({ error: "listName is required" });

  try {
    const list = await List.findOne({ userId, listName });
    if (!list || !list.rowIds.length) return res.json([]);

    const validRowIds = list.rowIds.filter(id => id !== -1);
    const offset = (page - 1) * 50;
    const rowIds = validRowIds.slice(offset, offset + 50);

    if (rowIds.length === 0) return res.json([]);

    const peopleRows = await new Promise((resolve, reject) => {
      peopleDb.all(`
        SELECT row_id, Name, Designation, Email, Phone, Organization, City, State, Country, "Org Size", "Org Industry"
        FROM people
        WHERE row_id IN (${rowIds.join(',')});
      `, (err, rows) => err ? reject(err) : resolve(rows));
    });

    const accessMap = await getAccessMap(userId, rowIds);

    const cleaned = peopleRows.map(row => {
      const rowId = Number(row.row_id);
      const accessKey = `${userId}_${rowId}`;
      const accessType = accessMap[accessKey];
      return {
        ...row,
        row_id: rowId,
        Email: [1, 3, 4].includes(accessType) ? row.Email : null,
        Phone: [2, 3, 4].includes(accessType) ? (row.Phone || "NIL") : null
      };
    });

    res.json(cleaned);
  } catch (err) {
    console.error('showList Error:', err);
    res.status(500).json({ error: "Failed to fetch list data" });
  }
};

// EXPORT LIST
exports.queueExportJob = async (req, res) => {
  const { uid: userId, email } = req.user;
  const { listName } = req.body;

  if (!listName) return res.status(400).json({ error: 'listName is required' });

  try {
    const list = await List.findOne({ userId, listName });
    if (!list || !list.rowIds.length) {
      return res.status(404).json({ error: 'List is empty' });
    }

    const rowIds = list.rowIds.filter(id => id !== -1);
    const jobId = uuidv4();
    const jobData = { jobId, userId, email, rowIds, listName };

    const exportDir = path.resolve(__dirname, '../export_jobs');
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir);

    const filePath = path.join(exportDir, `${jobId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(jobData));

    res.json({
      message: 'Your export has been queued and will be emailed shortly.',
      rowCount: rowIds.length
    });
  } catch (err) {
    console.error('Export job queueing failed:', err);
    res.status(500).json({ error: 'Failed to queue export' });
  }
};

// RENAME LIST
exports.renameList = async (req, res) => {
  const { uid: userId } = req.user;
  const { oldName, newName } = req.body;

  if (!oldName || !newName) {
    return res.status(400).json({ error: 'oldName and newName are required' });
  }

  try {
    const existing = await List.findOne({ userId, listName: newName });
    if (existing) return res.status(400).json({ error: 'A list with the new name already exists' });

    const list = await List.findOne({ userId, listName: oldName });
    if (!list) return res.status(404).json({ error: 'List not found' });

    list.listName = newName;
    await list.save();

    res.json({ message: 'List renamed successfully' });
  } catch (err) {
    console.error('Rename List Error:', err);
    res.status(500).json({ error: 'Failed to rename list' });
  }
};

// DELETE LIST
exports.deleteList = async (req, res) => {
  const { uid: userId } = req.user;
  const { listName } = req.params;

  if (!listName) return res.status(400).json({ error: 'listName is required' });

  try {
    const deleted = await List.findOneAndDelete({ userId, listName });
    if (!deleted) return res.status(404).json({ error: 'List not found' });

    res.json({ message: `List '${listName}' deleted successfully` });
  } catch (err) {
    console.error('Delete List Error:', err);
    res.status(500).json({ error: 'Failed to delete list' });
  }
};