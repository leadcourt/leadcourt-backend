const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  subscriptionType: {
    type: String,
    required: true,
    enum: [
      'STARTER',
      'PRO',
      'BUSINESS',
      'CUSTOM',
      'STARTER_ANNUAL',
      'PRO_ANNUAL',
      'BUSINESS_ANNUAL'
    ]
  },
  payerId: {
    type: String,
    required: true
  },
  payerEmail: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['COMPLETED', 'PENDING', 'REFUNDED', 'FAILED', 'DENIED']
  },
  description: String,
  webhookEvent: {
    type: String,
    required: true
  },
  customData: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map()
  },
  rawData: Object
}, { timestamps: true });

module.exports = mongoose.model('Transaction', TransactionSchema);
