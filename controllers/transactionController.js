const Transaction = require('../models/Transactions');

exports.getFormattedTransactions = async (req, res) => {
  const { uid: userId } = req.user;
  const { page = 1, limit = 10 } = req.query;

  try {
    await Transaction.deleteMany({ userId, status: 'PENDING' });
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [transactions, totalCount] = await Promise.all([
      Transaction.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Transaction.countDocuments({ userId })
    ]);

    const formatted = transactions.map(txn => {
      const isCustom = txn.customData?.type === 'CREDIT_PURCHASE';

      return {
        plan: isCustom ? 'Custom Credits' : txn.subscriptionType || 'Unknown',
        subscriptionId: txn.transactionId,
        price: txn.amount,
        currency: txn.currency,
        purchaseDate: txn.createdAt,
        status: txn.status
      };
    });

    res.status(200).json({
      success: true,
      count: formatted.length,
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      currentPage: parseInt(page),
      data: formatted
    });
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
  }
};
