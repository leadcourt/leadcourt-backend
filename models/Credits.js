const mongoose = require('mongoose');

const CreditsSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  credits: { type: Number, default: 500 },
  activePlan: {
    type: String,
    enum: ['FREE', 'STARTER', 'PRO', 'BUSINESS', 'CUSTOM', null],
    default: 'FREE'
  },
  expiresAt: { type: Date, default: null },
  starterRemainingDays: { type: Number, default: 0 },
  proRemainingDays: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Credits', CreditsSchema);
