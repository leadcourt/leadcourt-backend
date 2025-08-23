const admin = require('firebase-admin');
const Transaction = require('../models/Transactions');
const Credits = require('../models/Credits');
const sendTelegramAlert = require('../services/telegramAlert');
const { handlePlanPurchase } = require('../services/purchasePlan');

const TELEGRAM_GROUP_ID_FAILURE = process.env.TELEGRAM_GROUP_ID_FAILURE;
const TELEGRAM_GROUP_ID_SUCCESS = process.env.TELEGRAM_GROUP_ID_SUCCESS;

const LP = '[PayPalWH]';

const verifyWebhookSignature = async () => {
  try {
    return true;
  } catch (error) {
    console.error(`${LP} verifyWebhookSignature error:`, error);
    return false;
  }
};

function escapeMarkdownV2(text) {
  return String(text ?? '').replace(/[\\_*\[\]()~`>#+=|{}.!-]/g, '\\$&');
}

async function getUserInfo(uid) {
  if (!uid) return { name: 'N/A', email: 'N/A' };
  try {
    const u = await admin.auth().getUser(uid);
    return { name: u.displayName || 'N/A', email: u.email || 'N/A' };
  } catch {
    return { name: 'N/A', email: 'N/A' };
  }
}

exports.processWebhook = async (req, res) => {
  try {
    const isVerified = await verifyWebhookSignature(req);
    if (!isVerified) return res.status(400).json({ success: false, error: 'Invalid signature' });

    const rawBody = req?.rawBody
      ? req.rawBody.toString('utf8')
      : (req.body instanceof Buffer
          ? req.body.toString('utf8')
          : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})));

    let event;
    try {
      event = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    } catch {
      return res.status(400).json({ success: false, error: 'Bad JSON' });
    }

    const eventType = event?.event_type;

    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        await handlePaymentCaptureCompleted(event);
        break;
      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.DECLINED':
        await handlePaymentCaptureDenied(event);
        break;
      case 'PAYMENT.CAPTURE.REFUNDED':
        await handlePaymentCaptureRefunded(event);
        break;
      default:
        // no-op
        break;
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error(`${LP} webhook processing error:`, error);
    res.status(500).json({ success: false });
  }
};

const handlePaymentCaptureCompleted = async (event) => {
  try {
    const resource = event.resource;
    let customData = {};
    try {
      customData = resource.custom_id ? JSON.parse(resource.custom_id) : {};
    } catch {
      customData = {};
    }

    const userId = customData.userId;
    const amount = parseFloat(resource.amount?.value || '0');
    const currency = resource.amount?.currency_code || 'N/A';
    const isCustom = customData.type === 'CREDIT_PURCHASE';
    const subscriptionType = isCustom ? 'CUSTOM' : (customData.subscriptionType || 'STARTER').toUpperCase();
    const { name, email } = await getUserInfo(userId);
    const orderId = resource?.supplementary_data?.related_ids?.order_id || 'N/A';

    const transactionData = {
      transactionId: resource.id,
      userId: userId || 'unknown',
      subscriptionType,
      payerId: resource.supplementary_data?.payer?.payer_id || 'unknown',
      payerEmail: resource.supplementary_data?.payer?.email_address || 'unknown',
      amount,
      currency,
      status: 'COMPLETED',
      description: resource.description || '',
      webhookEvent: event.event_type,
      customData,
      rawData: resource
    };

    await saveTransaction(transactionData);

    const tgSuccessMsg =
      `*PayPal Payment Successful*\n\n` +
      `*Name:* ${escapeMarkdownV2(name)}\n` +
      `*Email:* ${escapeMarkdownV2(email)}\n` +
      `*Amount:* ${escapeMarkdownV2(amount)} ${escapeMarkdownV2(currency)}\n` +
      `*Payment Method:* PAYPAL \n` +
      `*Status:* COMPLETED\n` +
      `*ClientTxnId:* ${escapeMarkdownV2(resource.id)}\n` +
      `*OrderId:* ${escapeMarkdownV2(orderId)}\n` +
      `*CustomId:* ${escapeMarkdownV2(resource.custom_id || 'N/A')}`;
    await sendTelegramAlert(tgSuccessMsg, TELEGRAM_GROUP_ID_SUCCESS);

    if (!userId || !amount) return;

    if ((customData.type?.toUpperCase() === 'SUBSCRIPTION' || customData.subscriptionType)) {
      const subType = (customData.subscriptionType || '').toUpperCase();
      const isAnnual = subType.endsWith('_ANNUAL');
      const basePlan = isAnnual ? subType.replace('_ANNUAL', '') : subType;

      let creditsToAdd = 0;
      let durationDays = isAnnual ? 365 : 30;

      if (basePlan === 'STARTER') creditsToAdd = isAnnual ? 3000 * 12 : 3000;
      else if (basePlan === 'PRO') creditsToAdd = isAnnual ? 10000 * 12 : 10000;
      else if (basePlan === 'BUSINESS') creditsToAdd = isAnnual ? 15000 * 12 : 15000;

      if (['STARTER', 'PRO', 'BUSINESS'].includes(basePlan)) {
        await handlePlanPurchase(userId, basePlan, creditsToAdd, durationDays);
      }
    } 
    else {
      const creditsToAdd = Math.floor(amount * 100);
      await Credits.findOneAndUpdate(
        { userId },
        { 
          $inc: { credits: creditsToAdd },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true, new: true }
      );
    }
  } catch (err) {
    console.error(`${LP} handlePaymentCaptureCompleted error:`, err);
  }
};


const handlePaymentCaptureDenied = async (event) => {
  try {
    const r = event.resource || {};
    let customData = {};
    try {
      customData = r.custom_id ? JSON.parse(r.custom_id) : {};
    } catch {
      customData = {};
    }
    const { name, email } = await getUserInfo(customData.userId);
    const amount = r.amount?.value || 'N/A';
    const currency = r.amount?.currency_code || 'N/A';
    const orderId = r?.supplementary_data?.related_ids?.order_id || 'N/A';
    const status = event.event_type?.split('.').pop() || 'DENIED';

    const tgFailMsg =
      `*PayPal Payment Failed*\n\n` +
      `*Name:* ${escapeMarkdownV2(name)}\n` +
      `*Email:* ${escapeMarkdownV2(email)}\n` +
      `*Amount:* ${escapeMarkdownV2(amount)} ${escapeMarkdownV2(currency)}\n` +
      `*Payment Method:* PAYPAL \n` +
      `*Status:* ${escapeMarkdownV2(status)}\n` +
      `*ClientTxnId:* ${escapeMarkdownV2(r.id || 'N/A')}\n` +
      `*OrderId:* ${escapeMarkdownV2(orderId)}\n` +
      `*CustomId:* ${escapeMarkdownV2(r.custom_id || 'N/A')}`;
    await sendTelegramAlert(tgFailMsg, TELEGRAM_GROUP_ID_FAILURE);
  } catch (e) {
    console.error(`${LP} handlePaymentCaptureDenied error:`, e);
  }
};

const handlePaymentCaptureRefunded = async (event) => {
  try {
    const r = event.resource || {};
    let customData = {};
    try {
      customData = r.custom_id ? JSON.parse(r.custom_id) : {};
    } catch {
      customData = {};
    }
    const { name, email } = await getUserInfo(customData.userId);
    const amount = r.amount?.value || 'N/A';
    const currency = r.amount?.currency_code || 'N/A';
    const orderId = r?.supplementary_data?.related_ids?.order_id || 'N/A';

    const tgMsg =
      `*PayPal Payment Refunded*\n\n` +
      `*Name:* ${escapeMarkdownV2(name)}\n` +
      `*Email:* ${escapeMarkdownV2(email)}\n` +
      `*Amount:* ${escapeMarkdownV2(amount)} ${escapeMarkdownV2(currency)}\n` +
      `*Payment Method:* PAYPAL \n` +
      `*Status:* REFUNDED\n` +
      `*ClientTxnId:* ${escapeMarkdownV2(r.id || 'N/A')}\n` +
      `*OrderId:* ${escapeMarkdownV2(orderId)}\n` +
      `*CustomId:* ${escapeMarkdownV2(r.custom_id || 'N/A')}`;
    await sendTelegramAlert(tgMsg, TELEGRAM_GROUP_ID_FAILURE);
  } catch (e) {
    console.error(`${LP} handlePaymentCaptureRefunded error:`, e);
  }
};

const saveTransaction = async (data) => {
  try {
    const existing = await Transaction.findOne({ transactionId: data.transactionId });
    if (existing) {
      existing.status = data.status;
      existing.rawData = data.rawData;
      await existing.save();
    } else {
      await Transaction.create(data);
    }
  } catch (err) {
    console.error(`${LP} saveTransaction error:`, err);
  }
};
