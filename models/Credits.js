const mongoose = require('mongoose');

const CreditsSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  credits: { type: Number, default: 500 },
  activePlan: {
    type: String,
    enum: ['STARTER', 'PRO', 'BUSINESS', null],
    default: null
  },
  lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Credits', CreditsSchema);
