const Transaction = require('../models/Transactions');
const Credits = require('../models/Credits');

const verifyWebhookSignature = async (req) => {
  try {
    // const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    // const requestBody = req.rawBody.toString();
    // const paypalSignature = req.headers['paypal-transmission-sig'];
    // const paypalCertUrl = req.headers['paypal-cert-url'];
    // const transmissionId = req.headers['paypal-transmission-id'];
    // const transmissionTime = req.headers['paypal-transmission-time'];
    
    return true;
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return false;
  }
};

exports.processWebhook = async (req, res) => {
  try {
    const isVerified = await verifyWebhookSignature(req);
    if (!isVerified) {
      return res.status(400).json({ success: false, error: 'Invalid signature' });
    }
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : req.body;
    const event = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    const eventType = event.event_type;

    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        await handlePaymentCaptureCompleted(event);
        break;
      case 'PAYMENT.CAPTURE.DENIED':
        await handlePaymentCaptureDenied(event);
        break;
      case 'PAYMENT.CAPTURE.REFUNDED':
        await handlePaymentCaptureRefunded(event);
        break;
      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ success: false });
  }
};

const handlePaymentCaptureCompleted = async (event) => {
  try {
    console.log('Payment Capture Completed Event:', JSON.stringify(event, null, 2));

    const resource = event.resource;
    let customData = {};

    try {
      customData = resource.custom_id ? JSON.parse(resource.custom_id) : {};
    } catch {
      console.warn('Invalid custom_id JSON:', resource.custom_id);
    }

    const userId = customData.userId;
    const amount = parseFloat(resource.amount.value);
    console.log('customData:', customData);
    console.log('userId:', userId);
    console.log('Credits to add (custom):', Math.floor(amount * 100));

    const isCustom = customData.type === 'CUSTOM';
    const subscriptionType = isCustom
      ? 'CUSTOM'
      : customData.subscriptionType || 'STARTER';

    const transactionData = {
      transactionId: resource.id,
      userId: userId || 'unknown',
      subscriptionType,
      payerId: resource.supplementary_data?.payer?.payer_id || 'unknown',
      payerEmail: resource.supplementary_data?.payer?.email_address || 'unknown',
      amount,
      currency: resource.amount.currency_code,
      status: 'COMPLETED',
      description: resource.description || '',
      webhookEvent: event.event_type,
      customData,
      rawData: resource
    };

    await saveTransaction(transactionData);

    if (!userId || !amount) return;

    if (['STARTER', 'PRO', 'BUSINESS'].includes((customData.subscriptionType || '').toUpperCase())) {
      let creditsToAdd = 0;
      switch ((customData.subscriptionType || '').toUpperCase()) {
        case 'STARTER': creditsToAdd = 3000; break;
        case 'PRO': creditsToAdd = 10000; break;
        case 'BUSINESS': creditsToAdd = 15000; break;
        default: creditsToAdd = 0;
      }

      const update = await Credits.findOneAndUpdate(
        { userId },
        {
          $inc: { credits: creditsToAdd },
          $set: {
            activePlan: (customData.subscriptionType || '').toUpperCase(),
            lastUpdated: new Date()
          }
        },
        { upsert: true, new: true }
      );

      console.log('Subscription credits updated:', update);
    } else {
      const creditsToAdd = Math.floor(amount * 100);

      const update = await Credits.findOneAndUpdate(
        { userId },
        {
          $inc: { credits: creditsToAdd },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true, new: true }
      );

      console.log('Custom credits updated:', update);
    }
  } catch (err) {
    console.error('handlePaymentCaptureCompleted error:', err);
  }
};

const handlePaymentCaptureDenied = async (event) => {
  console.log('Payment Denied:', event.resource.id);
};

const handlePaymentCaptureRefunded = async (event) => {
  console.log('Payment Refunded:', event.resource.id);
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
    console.error('saveTransaction error:', err);
  }
};
