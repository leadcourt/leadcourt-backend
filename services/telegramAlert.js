const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const sendTelegramAlert = async (message, chatId) => {
  try {
    if (!chatId) throw new Error('chat_id is missing');

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text: message,
      parse_mode: 'MarkdownV2',
    };

    const res = await axios.post(url, payload);
  } catch (err) {
    console.error('Failed to send Telegram alert:', err.response?.data || err.message);
  }
};

module.exports = sendTelegramAlert;