/**
 * Exhibitor dashboard API
 * Login with phone + PIN, view shop stats and sales
 * Uses JWT for authentication
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../models');
const pinService = require('../services/pinService');
const { loginLimiter } = require('../middleware/security');

const router = express.Router();
const { JWT_SECRET, JWT_EXPIRES_IN, isProduction } = require('../config/auth');

function normalizePhone(phone) {
  if (!phone) return '';
  const raw = String(phone).replace(/\D/g, '');
  if (!raw) return '';
  if (raw.startsWith('233')) return raw;
  if (raw.length >= 9) return '233' + raw.slice(-9);
  return '233' + raw;
}

function toLocalPhone(phone) {
  if (!phone) return '';
  const p = String(phone).replace(/\D/g, '');
  if (p.startsWith('233') && p.length >= 12) return '0' + p.slice(3);
  return p;
}

function createToken(exhibitorId) {
  return jwt.sign(
    { exhibitorId, type: 'exhibitor' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function getExhibitorFromToken(req) {
  const token =
    req.headers.authorization?.replace('Bearer ', '') ||
    req.cookies?.exhibitor_token ||
    (isProduction ? null : req.query?.token);
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type === 'exhibitor' && decoded.exhibitorId) return decoded.exhibitorId;
    return null;
  } catch {
    return null;
  }
}

/**
 * POST /api/exhibitor/login
 * Body: { phone, pin }
 */
router.post('/login', loginLimiter, express.json(), async (req, res) => {
  try {
    const { phone, pin } = req.body || {};
    const phoneNorm = normalizePhone(phone);
    if (!phoneNorm || !pin || String(pin).length !== 4) {
      return res.status(400).json({ error: 'Phone and 4-digit PIN required' });
    }

    let exhibitor = await db.Exhibitor.findOne({
      where: { phone: phoneNorm, is_active: true },
    });
    if (!exhibitor && phoneNorm.startsWith('233')) {
      const localPhone = toLocalPhone(phoneNorm);
      exhibitor = await db.Exhibitor.findOne({
        where: { phone: localPhone, is_active: true },
      });
    }
    if (!exhibitor) {
      return res.status(401).json({ error: 'Shop not found or inactive. Register via USSD *920*72# (option 1) or run: npm run register-exhibitor' });
    }
    if (!exhibitor.pin_hash) {
      return res.status(401).json({ error: 'PIN not set. Set PIN via USSD (Manage My Shop) first.' });
    }

    const valid = await pinService.verifyPin(pin, exhibitor.pin_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    const token = createToken(exhibitor.id);
    res.cookie('exhibitor_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });
    res.json({ token, exhibitor: { id: exhibitor.id, shop_id: exhibitor.shop_id, name: exhibitor.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/exhibitor/dashboard
 * Requires: Bearer token, cookie, or ?token=
 */
router.get('/dashboard', async (req, res) => {
  try {
    const exhibitorId = getExhibitorFromToken(req);
    if (!exhibitorId) {
      return res.status(401).json({ error: 'Login required' });
    }

    const exhibitor = await db.Exhibitor.findByPk(exhibitorId, {
      attributes: { exclude: ['pin_hash'] },
      include: [
        { model: db.ExhibitorInventory, attributes: ['id', 'rice_type', 'bag_size_kg', 'quantity', 'price_per_bag', 'verification_status'] },
      ],
    });
    if (!exhibitor) {
      return res.status(404).json({ error: 'Exhibitor not found' });
    }

    const [salesSummary, recentSales] = await Promise.all([
      db.Sale.findAll({
        where: { exhibitor_id: exhibitorId },
        attributes: [
          [db.sequelize.fn('SUM', db.sequelize.col('amount')), 'total_sales'],
          [db.sequelize.fn('SUM', db.sequelize.col('farmwallet_commission')), 'total_commission'],
          [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'sale_count'],
        ],
        raw: true,
      }),
      db.Sale.findAll({
        where: { exhibitor_id: exhibitorId },
        attributes: ['id', 'quantity', 'amount', 'momo_status', 'buyer_phone', 'rice_type', 'created_at'],
        limit: 15,
        order: [['created_at', 'DESC']],
      }),
    ]);

    const stats = salesSummary[0] || { total_sales: 0, total_commission: 0, sale_count: 0 };
    const commissionPct = parseFloat(process.env.FARMWALLET_COMMISSION_PERCENT || '2');

    res.json({
      exhibitor: exhibitor.toJSON(),
      stats: {
        total_sales: Number(stats.total_sales || 0).toFixed(2),
        total_commission: Number(stats.total_commission || 0).toFixed(2),
        sale_count: Number(stats.sale_count || 0),
        commission_percent: commissionPct,
      },
      recent_sales: recentSales,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/exhibitor/inventory
 * Add a product to exhibitor's inventory. Requires JWT.
 * Body: { rice_type, bag_size_kg, quantity, price_per_bag }
 */
const RICE_TYPES = ['perfumed', 'brown', 'parboiled', 'jasmine', 'basmati', 'other'];
const BAG_SIZES_KG = [5, 25, 50, 100];

router.post('/inventory', express.json(), async (req, res) => {
  try {
    const exhibitorId = getExhibitorFromToken(req);
    if (!exhibitorId) {
      return res.status(401).json({ error: 'Login required' });
    }

    const { rice_type, bag_size_kg, quantity, price_per_bag } = req.body || {};
    if (!rice_type || !RICE_TYPES.includes(rice_type)) {
      return res.status(400).json({ error: 'Valid rice_type required: perfumed, brown, parboiled, jasmine, basmati, other' });
    }
    const bagKg = bag_size_kg != null ? parseInt(bag_size_kg, 10) : 50;
    if (!BAG_SIZES_KG.includes(bagKg)) {
      return res.status(400).json({ error: 'bag_size_kg must be 5, 25, 50, or 100' });
    }
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1) {
      return res.status(400).json({ error: 'Valid quantity (≥1) required' });
    }
    const price = parseFloat(price_per_bag);
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ error: 'Valid price_per_bag (>0) required' });
    }

    const exhibitor = await db.Exhibitor.findByPk(exhibitorId);
    if (!exhibitor || !exhibitor.is_active) {
      return res.status(404).json({ error: 'Exhibitor not found or inactive' });
    }

    const item = await db.ExhibitorInventory.create({
      exhibitor_id: exhibitorId,
      rice_type,
      bag_size_kg: bagKg,
      quantity: qty,
      price_per_bag: price,
      verification_status: 'pending',
    });

    res.status(201).json({
      message: 'Product added. Pending admin verification.',
      item: {
        id: item.id,
        rice_type: item.rice_type,
        bag_size_kg: item.bag_size_kg,
        quantity: item.quantity,
        price_per_bag: item.price_per_bag,
        verification_status: item.verification_status,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/exhibitor/logout
 * Clears cookie. Client should discard token (JWT is stateless).
 */
router.post('/logout', (req, res) => {
  res.clearCookie('exhibitor_token');
  res.json({ message: 'Logged out' });
});

module.exports = router;
