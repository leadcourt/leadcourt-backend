const mongoose = require('mongoose');

const listSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  listName: { type: String, required: true },
  rowIds: { type: [Number], default: [] },
}, { timestamps: true });

listSchema.index({ userId: 1, listName: 1 }, { unique: true });

module.exports = mongoose.model('List', listSchema);
