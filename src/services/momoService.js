/**
 * Mobile Money Service - MTN MoMo API Integration (Ghana)
 * Collection: Request payment from buyer (MTN MoMo)
 * Disbursement: Transfer to exhibitor (MTN MoMo only)
 */
const axios = require('axios');
const crypto = require('crypto');

function uuidv4() {
  return crypto.randomUUID();
}

const BASE_URL = process.env.MTN_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';
const TARGET_ENV = process.env.MTN_TARGET_ENV || 'sandbox';

// Collection (request payment from buyer)
const COLLECTION_USER_ID = process.env.MTN_COLLECTION_USER_ID || '';
const COLLECTION_API_KEY = process.env.MTN_COLLECTION_API_KEY || '';
const COLLECTION_SUBSCRIPTION_KEY = process.env.MTN_COLLECTION_SUBSCRIPTION_KEY || '';

// Disbursement (pay exhibitor)
const DISBURSEMENT_USER_ID = process.env.MTN_DISBURSEMENT_USER_ID || '';
const DISBURSEMENT_API_KEY = process.env.MTN_DISBURSEMENT_API_KEY || '';
const DISBURSEMENT_SUBSCRIPTION_KEY = process.env.MTN_DISBURSEMENT_SUBSCRIPTION_KEY || '';

const CALLBACK_BASE = process.env.MTN_CALLBACK_URL || '';

const tokenCache = { collection: null, disbursement: null };

/**
 * MTN MoMo error codes -> user-friendly USSD messages
 * @see https://momodeveloper.mtn.com/error-codes
 */
const ERROR_MESSAGES = {
  NOT_ENOUGH_FUNDS: 'Insufficient MoMo balance. Add funds and try again.',
  PAYER_NOT_FOUND: 'MoMo wallet not found. Register for MoMo first.',
  TRANSFER_TYPE_UNKNOWN: 'Payment service error. Try again later.',
  TRANSACTION_NOT_FOUND: 'Transaction not found. Try again.',
  PAYEE_NOT_ALLOWED_TO_RECEIVE: 'Recipient wallet inactive. Use another number.',
  SENDER_ACCOUNT_NOT_ACTIVE: 'Your MoMo wallet is not active. Contact MTN.',
  COULD_NOT_PERFORM_TRANSACTION: 'Payment timed out (5 min). Please try again.',
  PAYER_LIMIT_REACHED: 'Wallet limit reached. Reduce amount or use another wallet.',
  PAYEE_LIMIT_REACHED: 'Recipient limit reached. Use another wallet.',
  RESOURCE_ALREADY_EXIST: 'Duplicate request. Please try again.',
  PAYEE_NOT_FOUND: 'Recipient wallet not found.',
  VALIDATION_ERROR: 'Invalid request. Check amount and try again.',
};

function getErrorMessage(err) {
  const code = (err.response?.data?.code || err.response?.data?.error || '').toUpperCase().replace(/\s/g, '_');
  const fallback = err.response?.data?.message || err.response?.data?.reason || err.message;
  return ERROR_MESSAGES[code] || fallback || 'Payment failed. Try again.';
}

function normalizePhone(phone) {
  if (!phone) return '';
  const raw = String(phone).replace(/\D/g, '');
  if (raw.startsWith('233')) return raw;
  return raw.length >= 9 ? '233' + raw.slice(-9) : '233' + raw;
}

async function getToken(product) {
  const cache = tokenCache[product];
  if (cache && cache.expiresAt > Date.now()) return cache.token;

  const config =
    product === 'collection'
      ? { userId: COLLECTION_USER_ID, apiKey: COLLECTION_API_KEY, subKey: COLLECTION_SUBSCRIPTION_KEY }
      : { userId: DISBURSEMENT_USER_ID, apiKey: DISBURSEMENT_API_KEY, subKey: DISBURSEMENT_SUBSCRIPTION_KEY };

  if (!config.userId || !config.apiKey || !config.subKey) return null;

  try {
    const auth = Buffer.from(`${config.userId}:${config.apiKey}`).toString('base64');
    const res = await axios.post(
      `${BASE_URL}/${product}/token/`,
      {},
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Ocp-Apim-Subscription-Key': config.subKey,
        },
        timeout: 10000,
      }
    );
    const token = res.data?.access_token;
    if (token) {
      const expiresIn = (res.data?.expires_in || 3600) * 1000;
      tokenCache[product] = { token, expiresAt: Date.now() + expiresIn - 60000 };
      return token;
    }
  } catch (err) {
    console.error(`MTN ${product} token error:`, err.response?.data || err.message);
  }
  return null;
}

/**
 * Validate account holder - check if payer has active MoMo wallet before charging
 * GET /accountholder/{accountHolderIdType}/{accountHolderId}
 * Use case: Avoid PAYER_NOT_FOUND by validating before POST /requesttopay
 */
async function isPayerActive(phone) {
  if (!COLLECTION_USER_ID || !COLLECTION_API_KEY || !COLLECTION_SUBSCRIPTION_KEY) return true;
  const token = await getToken('collection');
  if (!token) return true;
  const payerId = normalizePhone(phone);
  try {
    const res = await axios.get(
      `${BASE_URL}/collection/v1_0/accountholder/msisdn/${payerId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Ocp-Apim-Subscription-Key': COLLECTION_SUBSCRIPTION_KEY,
        },
        timeout: 5000,
        validateStatus: (s) => s === 200 || s === 404,
      }
    );
    return res.status === 200 && (res.data?.result === true || res.data === true);
  } catch (err) {
    console.warn('MTN accountholder check failed:', err.message);
    return true;
  }
}

/**
 * Request payment from buyer (Collection)
 * Flow: POST /requesttopay → 202 Accepted → customer approves on client → callback (SUCCESSFUL/FAILED)
 * Buyer receives MoMo prompt; payment goes to FarmWallet collections account
 */
async function initiatePayment(buyerPhone, amount, reference, provider = 'mtn', recipientMomo = null) {
  if (!COLLECTION_USER_ID || !COLLECTION_API_KEY || !COLLECTION_SUBSCRIPTION_KEY) {
    console.warn('MTN Collection credentials not configured. Using mock payment.');
    return mockPayment(buyerPhone, amount, reference, provider, recipientMomo);
  }

  const token = await getToken('collection');
  if (!token) {
    return {
      success: false,
      status: 'failed',
      reference,
      message: 'Payment service unavailable. Try again.',
    };
  }

  if (process.env.MTN_VALIDATE_PAYER === 'true') {
    const active = await isPayerActive(buyerPhone);
    if (!active) {
      return {
        success: false,
        status: 'failed',
        reference,
        message: ERROR_MESSAGES.PAYER_NOT_FOUND,
      };
    }
  }

  const xRefId = uuidv4();
  const payerId = normalizePhone(buyerPhone);
  const amountStr = String(parseFloat(amount).toFixed(2));

  const payload = {
    amount: amountStr,
    currency: 'GHS',
    externalId: reference,
    payer: { partyIdType: 'MSISDN', partyId: payerId },
    payerMessage: 'FarmWallet Rice - Pay for order',
    payeeNote: `Order ${reference}`,
  };

  const callbackUrl = CALLBACK_BASE ? `${CALLBACK_BASE}/api/mtn/callback/collection` : undefined;

  try {
    const res = await axios.post(`${BASE_URL}/collection/v1_0/requesttopay`, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Reference-Id': xRefId,
        'X-Target-Environment': TARGET_ENV,
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': COLLECTION_SUBSCRIPTION_KEY,
        ...(callbackUrl && { 'X-Callback-Url': callbackUrl }),
      },
      timeout: 15000,
      validateStatus: (s) => s === 202 || s === 200,
    });

    if (res.status === 202) {
      console.log(`MTN Collection: request sent to ${payerId}, ref ${reference}, xRef ${xRefId}`);
      return {
        success: true,
        status: 'PENDING',
        reference,
        transactionId: xRefId,
        message: 'MoMo prompt sent. Complete payment on your phone.',
      };
    }

    return {
      success: false,
      status: 'failed',
      reference,
      message: 'Payment request failed. Try again.',
    };
  } catch (err) {
    const msg = getErrorMessage(err);
    const code = err.response?.data?.code || err.response?.data?.error;
    console.error('MTN Collection error:', code || err.message, err.response?.data);
    return {
      success: false,
      status: 'failed',
      reference,
      message: msg,
    };
  }
}

/**
 * Transfer to exhibitor (Disbursement) - MTN MoMo only
 */
async function transferToExhibitor(payeePhone, amount, reference, payeeNote = '') {
  if (!DISBURSEMENT_USER_ID || !DISBURSEMENT_API_KEY || !DISBURSEMENT_SUBSCRIPTION_KEY) {
    console.warn('MTN Disbursement credentials not configured. Skipping exhibitor payout.');
    return { success: false, message: 'Disbursement not configured' };
  }

  const token = await getToken('disbursement');
  if (!token) {
    return { success: false, message: 'Disbursement service unavailable' };
  }

  const xRefId = uuidv4();
  const payeeId = normalizePhone(payeePhone);
  const amountStr = String(parseFloat(amount).toFixed(2));

  const payload = {
    amount: amountStr,
    currency: 'GHS',
    externalId: reference,
    payee: { partyIdType: 'MSISDN', partyId: payeeId },
    payerMessage: 'FarmWallet Rice - Sale payout',
    payeeNote: payeeNote || `Payout ${reference}`,
  };

  const callbackUrl = CALLBACK_BASE ? `${CALLBACK_BASE}/api/mtn/callback/disbursement` : undefined;

  try {
    const res = await axios.post(`${BASE_URL}/disbursement/v1_0/transfer`, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Reference-Id': xRefId,
        'X-Target-Environment': TARGET_ENV,
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': DISBURSEMENT_SUBSCRIPTION_KEY,
        ...(callbackUrl && { 'X-Callback-Url': callbackUrl }),
      },
      timeout: 15000,
      validateStatus: (s) => s === 202 || s === 200,
    });

    if (res.status === 202) {
      console.log(`MTN Disbursement: transfer to ${payeeId}, ref ${reference}`);
      return {
        success: true,
        status: 'PENDING',
        reference,
        transactionId: xRefId,
      };
    }
    return { success: false, message: 'Transfer failed' };
  } catch (err) {
    const msg = getErrorMessage(err);
    const code = err.response?.data?.code || err.response?.data?.error;
    console.error('MTN Disbursement error:', code || err.message, err.response?.data);
    return { success: false, message: msg };
  }
}

/**
 * Check transaction status (Collection)
 */
async function checkStatus(transactionId) {
  if (!COLLECTION_USER_ID || !COLLECTION_API_KEY || !COLLECTION_SUBSCRIPTION_KEY) {
    return { status: 'pending', reference: transactionId };
  }

  const token = await getToken('collection');
  if (!token) return { status: 'pending', reference: transactionId };

  try {
    const res = await axios.get(
      `${BASE_URL}/collection/v1_0/requesttopay/${transactionId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Ocp-Apim-Subscription-Key': COLLECTION_SUBSCRIPTION_KEY,
        },
        timeout: 10000,
      }
    );
    const status = res.data?.status;
    return {
      status: status === 'SUCCESSFUL' ? 'completed' : status === 'FAILED' ? 'failed' : 'pending',
      reference: transactionId,
    };
  } catch (err) {
    console.error('MTN checkStatus error:', err.message);
    return { status: 'pending', reference: transactionId };
  }
}

function mockPayment(buyerPhone, amount, reference, provider, recipientMomo) {
  console.log(`MoMo (mock): buyer ${buyerPhone} pays GHS ${amount}, ref ${reference}`);
  return {
    success: true,
    status: 'initiated',
    reference: reference || `MOMO-${Date.now()}`,
    message: 'Payment prompt sent. Complete on your device.',
  };
}

module.exports = {
  initiatePayment,
  checkStatus,
  transferToExhibitor,
  isPayerActive,
};
