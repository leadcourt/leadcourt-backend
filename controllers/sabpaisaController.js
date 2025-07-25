const crypto = require('crypto');
const Transaction = require('../models/Transactions');
const Credits = require('../models/Credits');

const AES_KEY_BASE64 = process.env.SABPAISA_AUTH_KEY;
const HMAC_KEY_BASE64 = process.env.SABPAISA_AUTH_IV;

const IV_SIZE = 12;
const TAG_SIZE = 16;
const HMAC_SIZE = 48;

function bufferToHex(buffer) {
  return buffer.toString('hex').toUpperCase();
}

function hexToBuffer(hex) {
  return Buffer.from(hex, 'hex');
}

function encrypt(plaintext) {
  const aesKey = Buffer.from(AES_KEY_BASE64, 'base64');
  const hmacKey = Buffer.from(HMAC_KEY_BASE64, 'base64');
  const iv = crypto.randomBytes(IV_SIZE);

  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv, { authTagLength: TAG_SIZE });
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const encryptedMessage = Buffer.concat([iv, encrypted, tag]);
  const hmac = crypto.createHmac('sha384', hmacKey).update(encryptedMessage).digest();
  const finalMessage = Buffer.concat([hmac, encryptedMessage]);

  return bufferToHex(finalMessage);
}

function decrypt(hexCiphertext) {
  const aesKey = Buffer.from(AES_KEY_BASE64, 'base64');
  const hmacKey = Buffer.from(HMAC_KEY_BASE64, 'base64');

  const fullMessage = hexToBuffer(hexCiphertext);
  const hmacReceived = fullMessage.slice(0, HMAC_SIZE);
  const encryptedData = fullMessage.slice(HMAC_SIZE);
  const hmacComputed = crypto.createHmac('sha384', hmacKey).update(encryptedData).digest();

  if (!crypto.timingSafeEqual(hmacReceived, hmacComputed)) {
    throw new Error('HMAC validation failed - data may be tampered');
  }

  const iv = encryptedData.slice(0, IV_SIZE);
  const tag = encryptedData.slice(encryptedData.length - TAG_SIZE);
  const ciphertext = encryptedData.slice(IV_SIZE, encryptedData.length - TAG_SIZE);

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv, { authTagLength: TAG_SIZE });
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

exports.initiateSabPaisaPayment = async (req, res) => {
  try {
    const { uid: userId, email: userEmail, name: userName } = req.user;
    const { amount, subscriptionType, mobile } = req.body;

    if (!userId || !amount || !subscriptionType || !mobile) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const txnId = 'SABP_' + Date.now();

    const now = new Date();
    const pad = (n) => (n < 10 ? '0' + n : n);
    const transDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
      now.getHours()
    )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const params = new URLSearchParams({
      payerName: userName.trim(),
      payerEmail: userEmail.trim(),
      payerMobile: mobile,
      clientTxnId: txnId,
      amount: amount.toString(),
      clientCode: process.env.SABPAISA_CLIENT_CODE,
      transUserName: process.env.SABPAISA_USERNAME,
      transUserPassword: process.env.SABPAISA_PASSWORD,
      callbackUrl: process.env.SABPAISA_RETURN_URL,
      channelId: "W",
      mcc: "5666",
      transDate: transDate,
    });
    const requestString = params.toString();

    console.log("Request string before encryption:", requestString);
    const requiredEnvVars = {
  SABPAISA_CLIENT_CODE: process.env.SABPAISA_CLIENT_CODE,
  SABPAISA_USERNAME: process.env.SABPAISA_USERNAME,
  SABPAISA_PASSWORD: process.env.SABPAISA_PASSWORD,
  SABPAISA_AUTH_KEY: process.env.SABPAISA_AUTH_KEY,
  SABPAISA_AUTH_IV: process.env.SABPAISA_AUTH_IV,
  SABPAISA_RETURN_URL: process.env.SABPAISA_RETURN_URL
};

for (const [key, value] of Object.entries(requiredEnvVars)) {
  if (!value) {
    console.error(`Missing environment variable: ${key}`);
    return res.status(500).json({ success: false, error: `Missing ${key}` });
  }
}
    const encData = encrypt(requestString);

    await Transaction.create({
      transactionId: txnId,
      userId,
      subscriptionType: subscriptionType.toUpperCase(),
      payerId: txnId,
      payerEmail: userEmail,
      amount,
      currency: 'INR',
      status: 'PENDING',
      description: 'SabPaisa initiated transaction',
      webhookEvent: 'INITIATED',
      customData: { mobile },
      rawData: {},
    });

    return res.json({
      success: true,
      formData: {
        spURL: 'https://securepay.sabpaisa.in/SabPaisa/sabPaisaInit?v=1',
        encData,
        clientCode: process.env.SABPAISA_CLIENT_CODE,
      },
      transactionId: txnId,
    });
  } catch (err) {
    console.error('SabPaisa Initiate Error:', err);
    res.status(500).json({ success: false, error: 'SabPaisa payment error' });
  }
};

exports.handleSabPaisaReturn = async (req, res) => {
  if (req.method === 'POST') {
    try {
      const encResponse = req.body.encResponse;
      if (!encResponse) {
        return res.status(400).send('encResponse missing');
      }

      const decryptedResponse = decrypt(encResponse);
      const responseMap = {};
      decryptedResponse.split('&').forEach((pair) => {
        const [key, value] = pair.split('=');
        responseMap[key] = value;
      });

      const statusCode = responseMap['statusCode'];
      const finalStatus = statusCode === '0000' ? 'COMPLETED' : 'FAILED';
      // Fixed: Use correct parameter name from documentation
      const clientTxnId = responseMap['clientTxId']; // Note: clientTxId not clientTxnId
      const txnAmount = responseMap['amount'];

      const transaction = await Transaction.findOne({ transactionId: clientTxnId });
      if (!transaction) {
        console.error('Transaction not found:', clientTxnId);
        return res.status(404).send('Transaction not found');
      }

      transaction.status = finalStatus;
      transaction.payerId = responseMap['sabpaisaTxnId'] || 'N/A';
      transaction.rawData = responseMap;
      transaction.webhookEvent = 'RETURN';
      await transaction.save();

      if (finalStatus === 'COMPLETED') {
        const subscriptionType = transaction.subscriptionType;
        let credits = 0;
        if (subscriptionType === 'STARTER') credits = 3000;
        else if (subscriptionType === 'PRO') credits = 10000;
        else if (subscriptionType === 'BUSINESS') credits = 15000;
        else credits = Math.floor(parseFloat(txnAmount) * 1.162790698);

        const updateData = {
          $inc: { credits },
          $set: { lastUpdated: new Date() },
        };

        if (subscriptionType !== 'CUSTOM') {
          updateData.$set.activePlan = subscriptionType;
        }

        await Credits.findOneAndUpdate(
          { userId: transaction.userId },
          updateData,
          { upsert: true }
        );
      }

      return res.redirect(
        `https://app.leadcourt.com/subscription/balance/?status=${finalStatus}&txnId=${responseMap['sabpaisaTxnId'] || ''}&amount=${txnAmount}`
      );
    } catch (err) {
      console.error('SabPaisa Return Error:', err);
      return res.status(500).send('Internal Server Error');
    }
  }

  return res.redirect('https://leadcourt.com');
};