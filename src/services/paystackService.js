/**
 * Paystack Payment Service - Ghana
 * Charge: Mobile money payment from buyer
 * Transfer: Payout to exhibitor (mobile money)
 */
const axios = require('axios');
const crypto = require('crypto');

const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const CALLBACK_BASE = process.env.PAYSTACK_CALLBACK_URL || process.env.MTN_CALLBACK_URL || '';

// Map momo_provider to Paystack provider codes
const PROVIDER_MAP = { mtn: 'mtn', vodafone: 'vod', airteltigo: 'atl' };

function normalizePhone(phone) {
  if (!phone) return '';
  const raw = String(phone).replace(/\D/g, '');
  if (raw.startsWith('233')) return raw;
  return raw.length >= 9 ? '233' + raw.slice(-9) : '233' + raw;
}

function toLocalPhone(phone) {
  const p = String(phone).replace(/\D/g, '');
  if (p.startsWith('233') && p.length >= 12) return '0' + p.slice(3);
  return p;
}

/**
 * Initiate mobile money charge (payment from buyer)
 * Amount in GHS; Paystack expects pesewas (amount * 100)
 */
async function initiatePayment(buyerPhone, amount, reference, provider = 'mtn') {
  if (!SECRET_KEY) {
    console.warn('Paystack secret key not configured. Using mock payment.');
    return mockPayment(buyerPhone, amount, reference);
  }

  const amountPesewas = Math.round(parseFloat(amount) * 100);
  if (amountPesewas < 10) {
    return { success: false, status: 'failed', reference, message: 'Minimum amount is GHS 0.10' };
  }

  const paystackProvider = PROVIDER_MAP[provider] || 'mtn';
  const phone = toLocalPhone(normalizePhone(buyerPhone));

  const payload = {
    email: `ussd-${phone}@farmwallet.gh`,
    amount: amountPesewas,
    currency: 'GHS',
    reference: reference,
    mobile_money: {
      phone,
      provider: paystackProvider,
    },
    metadata: {
      sale_reference: reference,
      channel: 'ussd',
    },
  };

  try {
    const res = await axios.post('https://api.paystack.co/charge', payload, {
      headers: {
        Authorization: `Bearer ${SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    const data = res.data?.data;
    const status = data?.status;

    if (status === 'success') {
      return {
        success: true,
        status: 'completed',
        reference: data.reference || reference,
        transactionId: data.reference || reference,
        message: 'Payment successful.',
      };
    }

    if (status === 'pending') {
      console.log(`Paystack charge: pending for ${phone}, ref ${reference}`);
      return {
        success: true,
        status: 'PENDING',
        reference: data.reference || reference,
        transactionId: data.reference || reference,
        message: 'MoMo prompt sent. Complete payment on your phone.',
      };
    }

    if (status === 'send_otp' || status === 'send_birthday') {
      return {
        success: true,
        status: 'PENDING',
        reference: data.reference || reference,
        transactionId: data.reference || reference,
        message: 'MoMo prompt sent. Complete payment on your phone.',
      };
    }

    const msg = data?.message || data?.gateway_response || 'Payment failed. Try again.';
    return {
      success: false,
      status: 'failed',
      reference,
      message: msg,
    };
  } catch (err) {
    const msg = err.response?.data?.message || err.message || 'Payment failed. Try again.';
    console.error('Paystack charge error:', msg, err.response?.data);
    return {
      success: false,
      status: 'failed',
      reference,
      message: msg,
    };
  }
}

/**
 * Create transfer recipient (mobile money) - cached per exhibitor
 */
async function getOrCreateRecipient(phone, provider, name = 'Exhibitor') {
  if (!SECRET_KEY) return null;

  const bankCode = (provider || 'mtn') === 'vodafone' ? 'VOD' : (provider || 'mtn') === 'airteltigo' ? 'ATL' : 'MTN';
  const accountNumber = toLocalPhone(normalizePhone(phone));

  try {
    const res = await axios.post(
      'https://api.paystack.co/transferrecipient',
      {
        type: 'mobile_money',
        name: name.slice(0, 100),
        account_number: accountNumber,
        bank_code: bankCode,
        currency: 'GHS',
      },
      {
        headers: {
          Authorization: `Bearer ${SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    return res.data?.data?.recipient_code || null;
  } catch (err) {
    if (err.response?.status === 400 && err.response?.data?.message?.includes('already exists')) {
      const list = await axios.get('https://api.paystack.co/transferrecipient', {
        params: { perPage: 50 },
        headers: { Authorization: `Bearer ${SECRET_KEY}` },
      });
      const match = list.data?.data?.find(
        (r) => r.details?.account_number === accountNumber && r.details?.bank_code === bankCode
      );
      return match?.recipient_code || null;
    }
    console.error('Paystack create recipient error:', err.response?.data || err.message);
    return null;
  }
}

/**
 * Transfer to exhibitor (disbursement)
 * provider: mtn | vodafone | airteltigo
 */
async function transferToExhibitor(payeePhone, amount, reference, payeeNote = '', payeeName = '', provider = 'mtn') {
  if (!SECRET_KEY) {
    console.warn('Paystack secret key not configured. Skipping exhibitor payout.');
    return { success: false, message: 'Transfer not configured' };
  }

  const recipientCode = await getOrCreateRecipient(payeePhone, provider, payeeName || 'Exhibitor');
  if (!recipientCode) {
    return { success: false, message: 'Could not create transfer recipient' };
  }

  const amountPesewas = Math.round(parseFloat(amount) * 100);
  const transferRef = `payout-${reference}`.slice(0, 50);

  try {
    const res = await axios.post(
      'https://api.paystack.co/transfer',
      {
        source: 'balance',
        amount: amountPesewas,
        recipient: recipientCode,
        reference: transferRef,
        reason: payeeNote?.slice(0, 100) || `Payout ${reference}`,
      },
      {
        headers: {
          Authorization: `Bearer ${SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    if (res.data?.status) {
      console.log(`Paystack transfer: to ${payeePhone}, ref ${reference}`);
      return {
        success: true,
        status: 'PENDING',
        reference,
        transactionId: res.data?.data?.transfer_code || transferRef,
      };
    }
    return { success: false, message: res.data?.message || 'Transfer failed' };
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error('Paystack transfer error:', msg);
    return { success: false, message: msg };
  }
}

/**
 * Verify charge status (for polling if needed)
 */
async function checkStatus(reference) {
  if (!SECRET_KEY) return { status: 'pending', reference };

  try {
    const res = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${SECRET_KEY}` },
      timeout: 10000,
    });
    const status = res.data?.data?.status;
    return {
      status: status === 'success' ? 'completed' : status === 'failed' ? 'failed' : 'pending',
      reference,
    };
  } catch (err) {
    return { status: 'pending', reference };
  }
}

/**
 * Verify Paystack webhook signature
 */
function verifyWebhookSignature(payload, signature) {
  if (!process.env.PAYSTACK_WEBHOOK_SECRET) return true;
  const hash = crypto.createHmac('sha512', process.env.PAYSTACK_WEBHOOK_SECRET).update(payload).digest('hex');
  return hash === signature;
}

function mockPayment(buyerPhone, amount, reference) {
  console.log(`Paystack (mock): buyer ${buyerPhone} pays GHS ${amount}, ref ${reference}`);
  return {
    success: true,
    status: 'initiated',
    reference: reference || `PAY-${Date.now()}`,
    message: 'Payment prompt sent. Complete on your device.',
  };
}

module.exports = {
  initiatePayment,
  checkStatus,
  transferToExhibitor,
  verifyWebhookSignature,
};
