#!/usr/bin/env node
/**
 * MTN MoMo Sandbox Provisioning
 * Creates API User and API Key for Collection and/or Disbursement products.
 *
 * Usage:
 *   SUBSCRIPTION_KEY=your_key node scripts/mtn-provision-sandbox.js collection
 *   SUBSCRIPTION_KEY=your_key node scripts/mtn-provision-sandbox.js disbursement
 *   SUBSCRIPTION_KEY=your_key node scripts/mtn-provision-sandbox.js both
 *
 * Get SUBSCRIPTION_KEY from https://momodeveloper.mtn.com (Profile > Primary Key)
 * Set providerCallbackHost to your callback domain (e.g. your-ngrok.ngrok-free.app)
 */
require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

const BASE = process.env.MTN_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';
const COLLECTION_SUB = process.env.MTN_COLLECTION_SUBSCRIPTION_KEY || process.env.SUBSCRIPTION_KEY;
const DISBURSEMENT_SUB = process.env.MTN_DISBURSEMENT_SUBSCRIPTION_KEY || process.env.SUBSCRIPTION_KEY;
const CALLBACK_HOST = process.env.MTN_CALLBACK_HOST || 'example.com';

function uuidv4() {
  return crypto.randomUUID();
}

async function createApiUser(product, subKey) {
  const refId = uuidv4();
  const path = product ? `${BASE}/${product}/v1_0/apiuser` : `${BASE}/v1_0/apiuser`;
  const res = await axios.post(
    path,
    { providerCallbackHost: CALLBACK_HOST },
    {
      headers: {
        'X-Reference-Id': refId,
        'Ocp-Apim-Subscription-Key': subKey,
        'Content-Type': 'application/json',
      },
      validateStatus: (s) => s === 201 || s === 409,
    }
  );
  if (res.status === 409) {
    console.log(`API User already exists for ${product}. Use existing Reference ID.`);
    return refId;
  }
  console.log(`Created API User for ${product}:`);
  console.log(`  X-Reference-Id (UserId): ${refId}`);
  return refId;
}

async function createApiKey(product, userId, subKey) {
  const path = product ? `${BASE}/${product}/v1_0/apiuser/${userId}/apikey` : `${BASE}/v1_0/apiuser/${userId}/apikey`;
  const res = await axios.post(
    path,
    {},
    {
      headers: {
        'Ocp-Apim-Subscription-Key': subKey,
        'Content-Type': 'application/json',
      },
      validateStatus: (s) => s === 201,
    }
  );
  const apiKey = res.data?.apiKey;
  if (apiKey) {
    console.log(`Created API Key for ${product}:`);
    console.log(`  API Key: ${apiKey}`);
    return apiKey;
  }
  throw new Error('No API Key in response');
}

async function provision(product) {
  const subKey = product === 'collection' ? COLLECTION_SUB : DISBURSEMENT_SUB;
  if (!subKey) {
    console.error(`Set MTN_${product.toUpperCase()}_SUBSCRIPTION_KEY or SUBSCRIPTION_KEY in env`);
    process.exit(1);
  }
  console.log(`\nProvisioning ${product} (callback host: ${CALLBACK_HOST})...\n`);
  const userId = await createApiUser(product, subKey);
  const apiKey = await createApiKey(product, userId, subKey);
  console.log(`\nAdd to .env:\n`);
  console.log(`MTN_${product.toUpperCase()}_USER_ID=${userId}`);
  console.log(`MTN_${product.toUpperCase()}_API_KEY=${apiKey}`);
  console.log(`MTN_${product.toUpperCase()}_SUBSCRIPTION_KEY=${SUB_KEY}`);
  console.log('');
}

async function main() {
  const product = (process.argv[2] || 'both').toLowerCase();
  try {
    if (product === 'collection' || product === 'disbursement') {
      await provision(product);
    } else if (product === 'both') {
      await provision('collection');
      await provision('disbursement');
    } else {
      console.log('Usage: node mtn-provision-sandbox.js [collection|disbursement|both]');
      process.exit(1);
    }
  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
    process.exit(1);
  }
}

main();
