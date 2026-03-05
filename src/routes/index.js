/**
 * API routes - minimal for shops-only app
 * Payments: Paystack (Ghana mobile money)
 */
const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');

const router = express.Router();

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
router.use('/vsla', require('./vsla'));

/**
 * Commission summary - requires ADMIN_API_KEY
 * GET /api/commission?api_key=xxx or X-Api-Key: xxx
 */
router.get('/commission', requireAdminApiKey, async (req, res) => {
  try {
    const { start, end, limit = 50 } = req.query;
    const where = {};
    if (start) where.created_at = { ...where.created_at, [Op.gte]: new Date(start) };
    if (end) where.created_at = { ...where.created_at, [Op.lte]: new Date(end) };

    const [agg, sales] = await Promise.all([
      db.Sale.findAll({
        where,
        attributes: [
          [db.sequelize.fn('SUM', db.sequelize.col('amount')), 'total'],
          [db.sequelize.fn('SUM', db.sequelize.col('farmwallet_commission')), 'commission'],
          [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count'],
        ],
        raw: true,
      }),
      db.Sale.findAll({
        where,
        limit: Math.min(parseInt(limit, 10) || 50, 100),
        attributes: ['id', 'amount', 'farmwallet_commission', 'created_at'],
        include: [{ model: db.Exhibitor, attributes: ['shop_id', 'name'] }],
        order: [['created_at', 'DESC']],
      }),
    ]);

    const a = agg[0] || { total: 0, commission: 0, count: 0 };
    res.json({
      period: { start: start || 'all', end: end || 'all' },
      total_sales: Number(a.total || 0).toFixed(2),
      total_commission: Number(a.commission || 0).toFixed(2),
      commission_percent: process.env.FARMWALLET_COMMISSION_PERCENT || '2',
      count: Number(a.count || 0),
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
