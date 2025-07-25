const mongoose = require('mongoose');

const hubspotTokenSchema = new mongoose.Schema({
  _id: { type: String },
  access_token: { type: String, required: true },
  refresh_token: { type: String, required: true },
  expires_at: { type: Number, required: true }
}, { _id: false });

module.exports = mongoose.model('HubspotToken', hubspotTokenSchema);