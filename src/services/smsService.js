const axios = require('axios');

class SMSService {
  constructor() {
    this.apiKey = process.env.ARKESEL_API_KEY;
    this.senderId = process.env.ARKESEL_SENDER_ID || 'FarmWallet';
    this.baseUrl = 'https://sms.arkesel.com/api/v2/sms/send';
  }

  async sendSMS(to, message) {
    if (!this.apiKey) {
      console.warn('Arkesel API key not configured. SMS not sent:', message.substring(0, 50) + '...');
      return { success: false, sandbox: true };
    }
    try {
      const response = await axios.post(
        this.baseUrl,
        {
          sender: this.senderId,
          message,
          recipients: [to.replace(/^0/, '233')],
        },
        {
          headers: {
            'api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
        }
      );
      return { success: response.data.status === 'success', data: response.data };
    } catch (error) {
      console.error('SMS send error:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  async sendShopConfirmation(phone, shopId, name) {
    const message = `FarmWallet Rice Shops\n\nWelcome ${name}! Your shop is live.\nShop ID: ${shopId}\nDial *920*72*${shopId}# for customers.\n\nFarmWallet`;
    return this.sendSMS(phone, message);
  }

  async sendSaleConfirmation(buyerPhone, exhibitorName, exhibitorMomo, quantity, amount) {
    const message = `FarmWallet Rice: ${quantity} bags = GHS ${amount}. Pay to ${exhibitorMomo} (${exhibitorName}). Shop receives directly. FarmWallet`;
    return this.sendSMS(buyerPhone, message);
  }
}

module.exports = new SMSService();
