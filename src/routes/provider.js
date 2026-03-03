/**
 * Mechanization Provider dashboard API
 * Login with phone + PIN, view services, transactions, earnings
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
  return raw.startsWith('233') ? raw : (raw.length >= 9 ? '233' + raw.slice(-9) : '233' + raw);
}

function createToken(providerId) {
  return jwt.sign(
    { providerId, type: 'provider' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function getProviderFromToken(req) {
  const token =
    req.headers.authorization?.replace('Bearer ', '') ||
    req.cookies?.provider_token ||
    (isProduction ? null : req.query?.token);
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type === 'provider' && decoded.providerId) return decoded.providerId;
    return null;
  } catch {
    return null;
  }
}

/**
 * POST /api/provider/login
 * Body: { phone, pin }
 */
router.post('/login', loginLimiter, express.json(), async (req, res) => {
  try {
    const { phone, pin } = req.body || {};
    const phoneNorm = normalizePhone(phone);
    if (!phoneNorm || !pin || String(pin).length !== 4) {
      return res.status(400).json({ error: 'Phone and 4-digit PIN required' });
    }

    const provider = await db.MechanizationProvider.findOne({
      where: { phone: phoneNorm, is_active: true },
    });
    if (!provider) {
      return res.status(401).json({ error: 'Provider not found or inactive' });
    }
    if (!provider.pin_hash) {
      return res.status(401).json({ error: 'PIN not set. Use register-provider script or contact admin.' });
    }

    const valid = await pinService.verifyPin(pin, provider.pin_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    const token = createToken(provider.id);
    res.cookie('provider_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });
    res.json({ token, provider: { id: provider.id, name: provider.name, region: provider.region } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/provider/dashboard
 * Provider's services, transactions, earnings summary
 */
router.get('/dashboard', async (req, res) => {
  try {
    const providerId = getProviderFromToken(req);
    if (!providerId) {
      return res.status(401).json({ error: 'Login required' });
    }

    const provider = await db.MechanizationProvider.findByPk(providerId, {
      attributes: { exclude: ['pin_hash'] },
      include: [
        {
          model: db.MechanizationService,
          attributes: ['id', 'service_type', 'price_per_unit', 'unit', 'tractor_registration_number', 'is_active', 'verification_status'],
        },
      ],
    });
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const transactions = await db.MechanizationTransaction.findAll({
      where: { provider_id: providerId },
      attributes: ['id', 'amount', 'farmwallet_commission', 'farmer_phone', 'tractor_registration_number', 'created_at'],
      include: [{ model: db.MechanizationService, attributes: ['service_type', 'unit'] }],
      order: [['created_at', 'DESC']],
      limit: 10,
    });

    const totals = await db.MechanizationTransaction.findAll({
      where: { provider_id: providerId },
      attributes: [
        [db.sequelize.fn('SUM', db.sequelize.col('amount')), 'total_amount'],
        [db.sequelize.fn('SUM', db.sequelize.col('farmwallet_commission')), 'total_commission'],
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'transaction_count'],
      ],
      raw: true,
    });

    const t = totals[0] || { total_amount: 0, total_commission: 0, transaction_count: 0 };
    const netEarnings = Number(t.total_amount || 0) - Number(t.total_commission || 0);

    res.json({
      provider: provider.toJSON(),
      stats: {
        total_amount: Number(t.total_amount || 0).toFixed(2),
        total_commission: Number(t.total_commission || 0).toFixed(2),
        net_earnings: netEarnings.toFixed(2),
        transaction_count: Number(t.transaction_count || 0),
      },
      recent_transactions: transactions.map((tx) => ({
        id: tx.id,
        amount: tx.amount,
        farmwallet_commission: tx.farmwallet_commission,
        farmer_phone: tx.farmer_phone,
        tractor_registration_number: tx.tractor_registration_number,
        service_type: tx.MechanizationService?.service_type,
        created_at: tx.created_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/provider/services
 * Add a tractor/service to provider's offerings. Requires JWT.
 * Body: { service_type, tractor_registration_number, price_per_unit, unit?, description? }
 */
const SERVICE_TYPES = ['tractor', 'plowing', 'threshing', 'harvesting', 'seed_drill', 'irrigation', 'sprayer', 'other'];
const UNITS = ['per_acre', 'per_hour', 'per_day', 'per_job'];

router.post('/services', express.json(), async (req, res) => {
  try {
    const providerId = getProviderFromToken(req);
    if (!providerId) {
      return res.status(401).json({ error: 'Login required' });
    }

    const { service_type, tractor_registration_number, price_per_unit, unit, description } = req.body || {};
    if (!service_type || !SERVICE_TYPES.includes(service_type)) {
      return res.status(400).json({ error: 'Valid service_type required: tractor, plowing, threshing, harvesting, seed_drill, irrigation, sprayer, other' });
    }
    const regNum = tractor_registration_number ? String(tractor_registration_number).trim() : '';
    if (!regNum) {
      return res.status(400).json({ error: 'tractor_registration_number is required (official registration number for tracking)' });
    }
    const price = parseFloat(price_per_unit);
    if (isNaN(price) || price < 0) {
      return res.status(400).json({ error: 'Valid price_per_unit (≥0) required' });
    }
    const unitVal = unit && UNITS.includes(unit) ? unit : 'per_acre';

    const provider = await db.MechanizationProvider.findByPk(providerId);
    if (!provider || !provider.is_active) {
      return res.status(404).json({ error: 'Provider not found or inactive' });
    }

    const service = await db.MechanizationService.create({
      provider_id: providerId,
      service_type,
      price_per_unit: price,
      unit: unitVal,
      tractor_registration_number: regNum,
      description: description ? String(description).trim() : null,
      is_active: true,
      verification_status: 'pending',
    });

    res.status(201).json({
      message: 'Tractor/service added successfully',
      service: {
        id: service.id,
        service_type: service.service_type,
        tractor_registration_number: service.tractor_registration_number,
        price_per_unit: service.price_per_unit,
        unit: service.unit,
        is_active: service.is_active,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/provider/logout
 */
router.post('/logout', (req, res) => {
  res.clearCookie('provider_token');
  res.json({ message: 'Logged out' });
});

module.exports = router;
