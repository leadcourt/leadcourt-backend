const mongoose = require('mongoose');

const ZohoModelSchema = new mongoose.Schema({
  uid: { type: String },
  accessToken: { type: String },
  refreshToken: { type: String },
  expires_at: { type: Date }, // expires_at
  connectedAt: { type: Date },
}, { _id: false });

module.exports = mongoose.model('zohoModel', ZohoModelSchema);


  // access_token: { type: String, required: true },
  // refresh_token: { type: String, required: true },
  // expires_at: { type: Number, required: true },