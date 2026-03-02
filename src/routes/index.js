/**
 * API routes - minimal for shops-only app
 */
const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');

const router = express.Router();

/**
 * MTN MoMo Collection callback
 * MTN sends callback via PUT when requestToPay completes (SUCCESSFUL, FAILED, PENDING)
 * Body: reference (X-Reference-Id), externalId, status, financialTransactionId
 */
const mtnCollectionCallback = async (req, res) => {
  try {
    const body = req.body || {};
    const status = (body.status || '').toUpperCase();
    const ref = String(body.reference || body.externalId || '').trim().slice(0, 100);

    if (!ref) {
      return res.status(400).send('Missing reference');
    }

    const sale = await db.Sale.findOne({
      where: { [Op.or]: [{ mtn_reference: ref }, { momo_reference: ref }] },
      include: [{ model: db.Exhibitor, attributes: ['id', 'momo_number', 'momo_provider', 'name'] }],
    });
    if (!sale) {
      console.warn('MTN callback: sale not found for', ref);
      return res.status(200).send('OK');
    }

    let momoStatus = 'initiated';
    if (status === 'SUCCESSFUL') momoStatus = 'completed';
    else if (status === 'FAILED') momoStatus = 'failed';

    await sale.update({ momo_status: momoStatus });

    if (momoStatus === 'completed' && sale.Exhibitor?.momo_provider === 'mtn') {
      const exhibitorReceives = Number(sale.amount) - Number(sale.farmwallet_commission || 0);
      const momoService = require('../services/momoService');
      const transfer = await momoService.transferToExhibitor(
        sale.Exhibitor.momo_number,
        exhibitorReceives,
        `PAYOUT-${sale.momo_reference}`,
        `FarmWallet Rice sale - ${sale.Exhibitor.name}`
      );
      if (transfer.success) {
        console.log(`MTN Disbursement initiated: GHS ${exhibitorReceives} to ${sale.Exhibitor.momo_number}`);
      }
    }

    console.log(`MTN Collection callback: ${ref} status=${status} -> ${momoStatus}`);
    res.status(200).send('OK');
  } catch (err) {
    console.error('MTN callback error:', err);
    res.status(500).send('Error');
  }
};

const jsonParser = express.json();
const urlEncoded = express.urlencoded({ extended: true });
router.put('/mtn/callback/collection', jsonParser, urlEncoded, mtnCollectionCallback);
router.post('/mtn/callback/collection', jsonParser, urlEncoded, mtnCollectionCallback);

/**
 * MTN MoMo Disbursement callback (optional - for transfer status updates)
 * MTN sends via PUT
 */
const mtnDisbursementCallback = async (req, res) => {
  try {
    const body = req.body || {};
    const status = (body.status || '').toUpperCase();
    console.log('MTN Disbursement callback:', body.reference || body.externalId, status);
    res.status(200).send('OK');
  } catch (err) {
    console.error('MTN Disbursement callback error:', err);
    res.status(500).send('Error');
  }
};
router.put('/mtn/callback/disbursement', jsonParser, urlEncoded, mtnDisbursementCallback);
router.post('/mtn/callback/disbursement', jsonParser, urlEncoded, mtnDisbursementCallback);

function requireAdminApiKey(req, res, next) {
  const isProduction = process.env.NODE_ENV === 'production';
  const key = req.headers['x-api-key'] || (isProduction ? null : req.query.api_key);
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    return res.status(503).json({ error: 'ADMIN_API_KEY not configured' });
  }
  if (key === expected) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

router.get('/', (req, res) => {
  res.json({ message: 'FarmWallet Rice Shops API', version: '1.0' });
});

router.use('/admin', require('./admin'));
router.use('/exhibitor', require('./exhibitor'));
router.use('/provider', require('./provider'));

/**
 * Commission summary - requires ADMIN_API_KEY
 * GET /api/commission?api_key=xxx or X-Api-Key: xxx
 */
router.get('/commission', requireAdminApiKey, async (req, res) => {
  try {
    const { start, end } = req.query;
    const where = {};
    if (start) where.created_at = { ...where.created_at, [Op.gte]: new Date(start) };
    if (end) where.created_at = { ...where.created_at, [Op.lte]: new Date(end) };

    const sales = await db.Sale.findAll({
      where,
      attributes: ['id', 'amount', 'farmwallet_commission', 'commission_percent', 'created_at'],
      include: [{ model: db.Exhibitor, attributes: ['shop_id', 'name'] }],
    });

    const totalSales = sales.reduce((s, r) => s + Number(r.amount), 0);
    const totalCommission = sales.reduce((s, r) => s + Number(r.farmwallet_commission), 0);

    res.json({
      period: { start: start || 'all', end: end || 'all' },
      total_sales: totalSales.toFixed(2),
      total_commission: totalCommission.toFixed(2),
      commission_percent: process.env.FARMWALLET_COMMISSION_PERCENT || '2',
      count: sales.length,
      sales: sales.map((s) => ({
        id: s.id,
        shop: s.Exhibitor?.name,
        amount: Number(s.amount),
        commission: Number(s.farmwallet_commission),
        created_at: s.created_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
