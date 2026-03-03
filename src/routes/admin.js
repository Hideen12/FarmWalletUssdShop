/**
 * Admin API - manage exhibitors (users)
 * Auth: JWT (phone + password login) OR ADMIN_API_KEY (X-Api-Key / api_key query)
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { Op } = require('sequelize');
const db = require('../models');
const pinService = require('../services/pinService');
const { escapeLike, loginLimiter } = require('../middleware/security');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
const { JWT_SECRET, JWT_EXPIRES_IN, isProduction } = require('../config/auth');

function normalizePhone(phone) {
  if (!phone) return '';
  const raw = String(phone).replace(/\D/g, '');
  return raw.startsWith('233') ? raw : (raw.length >= 9 ? '233' + raw.slice(-9) : '233' + raw);
}

function getMechCommissionPercent() {
  const pct = parseFloat(process.env.MECHANIZATION_COMMISSION_PERCENT || '10');
  return isNaN(pct) || pct < 0 ? 10 : Math.min(50, pct);
}

/**
 * POST /api/admin/login
 * Body: { phone, password }
 */
router.post('/login', loginLimiter, express.json(), async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    const phoneNorm = normalizePhone(phone);
    if (!phoneNorm || !password || String(password).length < 6) {
      return res.status(400).json({ error: 'Phone and password (min 6 chars) required' });
    }

    const admin = await db.Admin.findOne({
      where: { phone: phoneNorm, is_active: true },
    });
    if (!admin) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    const valid = await pinService.verifyPassword(password, admin.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    const token = jwt.sign(
      { adminId: admin.id, type: 'admin' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });
    res.json({
      token,
      admin: { id: admin.id, phone: admin.phone, name: admin.name },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/logout
 */
router.post('/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ message: 'Logged out' });
});

function requireAdmin(req, res, next) {
  const apiKey = req.headers['x-api-key'] || (isProduction ? null : req.query.api_key);
  const bearerToken =
    req.headers.authorization?.replace('Bearer ', '') ||
    req.cookies?.admin_token ||
    (isProduction ? null : req.query?.token);

  if (bearerToken) {
    try {
      const decoded = jwt.verify(bearerToken, JWT_SECRET);
      if (decoded.type === 'admin' && decoded.adminId) return next();
    } catch {}
  }

  const expectedKey = process.env.ADMIN_API_KEY;
  if (apiKey && expectedKey && apiKey === expectedKey) return next();
  if (apiKey && !expectedKey) {
    return res.status(503).json({ error: 'Admin API key not configured. Set ADMIN_API_KEY or use phone + password login.' });
  }
  res.status(401).json({ error: 'Unauthorized' });
}

router.use(requireAdmin);

/**
 * GET /api/admin/exhibitors
 * List exhibitors with optional filters
 * Query: page, limit, day (exhibition_day), active (true/false), search (name/phone/shop_id)
 */
router.get('/exhibitors', async (req, res) => {
  try {
    const { page = 1, limit = 10, day, active, search } = req.query;
    const where = {};
    if (day) where.exhibition_day = parseInt(day, 10);
    if (active !== undefined) where.is_active = active === 'true';
    if (search) {
      const escaped = escapeLike(String(search));
      if (escaped) {
        where[Op.or] = [
          { name: { [Op.like]: `%${escaped}%` } },
          { phone: { [Op.like]: `%${escaped}%` } },
          { shop_id: { [Op.like]: `%${escaped}%` } },
        ];
      }
    }

    const lim = Math.min(parseInt(limit, 10) || 10, 50);
    const { count, rows } = await db.Exhibitor.findAndCountAll({
      where,
      limit: lim,
      offset: (Math.max(parseInt(page, 10) || 1, 1) - 1) * lim,
      order: [['created_at', 'DESC']],
      attributes: { exclude: ['pin_hash'] },
    });

    res.json({
      exhibitors: rows,
      pagination: {
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 10,
        total: count,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/exhibitors/:id
 * Get exhibitor details with inventory and sales summary
 */
router.get('/exhibitors/:id', async (req, res) => {
  try {
    const exhibitor = await db.Exhibitor.findByPk(req.params.id, {
      attributes: { exclude: ['pin_hash'] },
      include: [
        { model: db.ExhibitorInventory, attributes: ['id', 'rice_type', 'bag_size_kg', 'quantity', 'price_per_bag', 'verification_status'] },
      ],
    });

    if (!exhibitor) {
      return res.status(404).json({ error: 'Exhibitor not found' });
    }

    const recentSales = await db.Sale.findAll({
      where: { exhibitor_id: exhibitor.id },
      attributes: ['id', 'quantity', 'amount', 'momo_status', 'created_at'],
      limit: 5,
      order: [['created_at', 'DESC']],
    });

    const salesSummary = await db.Sale.findAll({
      where: { exhibitor_id: exhibitor.id },
      attributes: [
        [db.sequelize.fn('SUM', db.sequelize.col('amount')), 'total_sales'],
        [db.sequelize.fn('SUM', db.sequelize.col('farmwallet_commission')), 'total_commission'],
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'sale_count'],
      ],
      raw: true,
    });

    res.json({
      ...exhibitor.toJSON(),
      recent_sales: recentSales,
      sales_summary: salesSummary[0] || { total_sales: 0, total_commission: 0, sale_count: 0 },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/admin/exhibitors/:id
 * Update exhibitor (is_active, name, exhibition_day, momo_number, momo_provider)
 */
router.patch('/exhibitors/:id', async (req, res) => {
  try {
    const exhibitor = await db.Exhibitor.findByPk(req.params.id);
    if (!exhibitor) {
      return res.status(404).json({ error: 'Exhibitor not found' });
    }

    const allowed = ['is_active', 'name', 'exhibition_day', 'momo_number', 'momo_provider'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === 'exhibition_day') updates[key] = Math.max(1, Math.min(3, parseInt(req.body[key], 10) || 1));
        else if (key === 'is_active') updates[key] = Boolean(req.body[key]);
        else if (key === 'momo_provider') {
          if (['mtn', 'vodafone', 'airteltigo'].includes(req.body[key])) updates[key] = req.body[key];
        } else updates[key] = String(req.body[key]).trim();
      }
    }

    await exhibitor.update(updates);
    const out = exhibitor.toJSON();
    delete out.pin_hash;
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/admin/exhibitors/:id
 * Deactivate exhibitor (soft delete - sets is_active=false)
 */
router.delete('/exhibitors/:id', async (req, res) => {
  try {
    const exhibitor = await db.Exhibitor.findByPk(req.params.id);
    if (!exhibitor) {
      return res.status(404).json({ error: 'Exhibitor not found' });
    }

    await exhibitor.update({ is_active: false });
    res.json({ message: 'Exhibitor deactivated', shop_id: exhibitor.shop_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/users
 * List admin users
 */
router.get('/users', async (req, res) => {
  try {
    const admins = await db.Admin.findAll({
      attributes: { exclude: ['password_hash'] },
      order: [['created_at', 'DESC']],
    });
    res.json({ admins });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/users
 * Create new admin user
 * Body: { phone, password, name? }
 */
router.post('/users', express.json(), async (req, res) => {
  try {
    const { phone, password, name } = req.body || {};
    const phoneNorm = normalizePhone(phone);
    if (!phoneNorm || !password || String(password).length < 6) {
      return res.status(400).json({ error: 'Phone and password (min 6 chars) required' });
    }

    const existing = await db.Admin.findOne({ where: { phone: phoneNorm } });
    if (existing) {
      return res.status(409).json({ error: 'Admin with this phone already exists' });
    }

    const password_hash = await pinService.hashPassword(password);
    const admin = await db.Admin.create({
      phone: phoneNorm,
      password_hash,
      name: (name || '').trim() || null,
      is_active: true,
    });
    const out = admin.toJSON();
    delete out.password_hash;
    res.status(201).json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/inventory
 * List products (inventory)
 * Query: status (pending|verified|rejected), exhibitor_id, page, limit
 * Response: { items: InventoryItem[], pagination: { page, limit, total } }
 */
router.get('/inventory', async (req, res) => {
  try {
    const { status, exhibitor_id, page = 1, limit = 20 } = req.query;
    const where = {};
    if (status && ['pending', 'verified', 'rejected'].includes(status)) where.verification_status = status;
    if (exhibitor_id) where.exhibitor_id = parseInt(exhibitor_id, 10);

    const { count, rows } = await db.ExhibitorInventory.findAndCountAll({
      where,
      limit: Math.min(parseInt(limit, 10) || 20, 50),
      offset: (Math.max(parseInt(page, 10) || 1, 1) - 1) * (parseInt(limit, 10) || 20),
      order: [['created_at', 'DESC']],
      include: [{ model: db.Exhibitor, attributes: ['id', 'shop_id', 'name'] }],
    });

    const items = rows.map((r) => {
      const j = r.toJSON();
      j.exhibitor_name = r.Exhibitor?.name;
      j.shop_id = r.Exhibitor?.shop_id;
      return j;
    });

    res.json({
      items,
      inventory: items,
      pagination: { page: parseInt(page, 10) || 1, limit: parseInt(limit, 10) || 20, total: count },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/admin/inventory/:id
 * Update product verification status
 * Body: { verification_status: 'verified' | 'rejected' }
 */
router.patch('/inventory/:id', express.json(), async (req, res) => {
  try {
    const item = await db.ExhibitorInventory.findByPk(req.params.id, {
      include: [{ model: db.Exhibitor, attributes: ['shop_id', 'name'] }],
    });
    if (!item) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const status = req.body.verification_status;
    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'verification_status must be verified or rejected' });
    }
    await item.update({ verification_status: status });
    const out = item.toJSON();
    out.exhibitor_name = item.Exhibitor?.name;
    out.shop_id = item.Exhibitor?.shop_id;
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/admin/inventory/:id/verify
 * Legacy endpoint - Body: { verified: true|false } maps to verification_status
 */
router.patch('/inventory/:id/verify', express.json(), async (req, res) => {
  try {
    const item = await db.ExhibitorInventory.findByPk(req.params.id, {
      include: [{ model: db.Exhibitor, attributes: ['shop_id', 'name'] }],
    });
    if (!item) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const verified = req.body.verified === true;
    await item.update({ verification_status: verified ? 'verified' : 'rejected' });
    const out = item.toJSON();
    out.exhibitor_name = item.Exhibitor?.name;
    out.shop_id = item.Exhibitor?.shop_id;
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/dashboard
 * Summary stats for admin
 */
router.get('/dashboard', async (req, res) => {
  try {
    const [exhibitorCount, activeCount, saleStats, mechStats] = await Promise.all([
      db.Exhibitor.count(),
      db.Exhibitor.count({ where: { is_active: true } }),
      db.Sale.findAll({
        attributes: [
          [db.sequelize.fn('SUM', db.sequelize.col('amount')), 'total_sales'],
          [db.sequelize.fn('SUM', db.sequelize.col('farmwallet_commission')), 'total_commission'],
          [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'sale_count'],
        ],
        raw: true,
      }),
      db.MechanizationTransaction.findAll({
        attributes: [
          [db.sequelize.fn('SUM', db.sequelize.col('amount')), 'total_amount'],
          [db.sequelize.fn('SUM', db.sequelize.col('farmwallet_commission')), 'total_commission'],
          [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count'],
        ],
        raw: true,
      }),
    ]);

    const stats = saleStats[0] || { total_sales: 0, total_commission: 0, sale_count: 0 };
    const mech = mechStats[0] || { total_amount: 0, total_commission: 0, count: 0 };

    res.json({
      exhibitors: { total: exhibitorCount, active: activeCount },
      sales: {
        total_amount: Number(stats.total_sales || 0).toFixed(2),
        total_commission: Number(stats.total_commission || 0).toFixed(2),
        count: Number(stats.sale_count || 0),
      },
      mechanization: {
        total_amount: Number(mech.total_amount || 0).toFixed(2),
        total_commission: Number(mech.total_commission || 0).toFixed(2),
        count: Number(mech.count || 0),
        commission_percent: getMechCommissionPercent(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/commission
 * Commission summary with sales breakdown (JWT or API key)
 * Query: start, end (ISO dates)
 */
router.get('/commission', async (req, res) => {
  try {
    const { start, end } = req.query;
    const where = {};
    if (start) where.created_at = { ...where.created_at, [Op.gte]: new Date(start) };
    if (end) where.created_at = { ...where.created_at, [Op.lte]: new Date(end) };

    const [sales, mechTransactions] = await Promise.all([
      db.Sale.findAll({
        where,
        attributes: ['id', 'amount', 'farmwallet_commission', 'commission_percent', 'created_at'],
        include: [{ model: db.Exhibitor, attributes: ['shop_id', 'name'] }],
        order: [['created_at', 'DESC']],
      }),
      db.MechanizationTransaction.findAll({
        where,
        attributes: ['id', 'amount', 'farmwallet_commission', 'commission_percent', 'tractor_registration_number', 'created_at'],
        include: [{ model: db.MechanizationProvider, attributes: ['name', 'region'] }],
        order: [['created_at', 'DESC']],
      }),
    ]);

    const totalSales = sales.reduce((s, r) => s + Number(r.amount), 0);
    const totalMech = mechTransactions.reduce((s, r) => s + Number(r.amount), 0);
    const totalCommission = sales.reduce((s, r) => s + Number(r.farmwallet_commission), 0) +
      mechTransactions.reduce((s, r) => s + Number(r.farmwallet_commission), 0);

    res.json({
      period: { start: start || 'all', end: end || 'all' },
      total_sales: (totalSales + totalMech).toFixed(2),
      total_commission: totalCommission.toFixed(2),
      commission_deposit: {
        bank_name: process.env.COMMISSION_BANK_NAME || 'Absa Bank',
        account_number: process.env.COMMISSION_BANK_ACCOUNT || '0851116494',
      },
      rice: { total_sales: totalSales.toFixed(2), commission: sales.reduce((s, r) => s + Number(r.farmwallet_commission), 0).toFixed(2), count: sales.length },
      mechanization: { total_sales: totalMech.toFixed(2), commission: mechTransactions.reduce((s, r) => s + Number(r.farmwallet_commission), 0).toFixed(2), count: mechTransactions.length, commission_percent: getMechCommissionPercent() },
      commission_percent: process.env.FARMWALLET_COMMISSION_PERCENT || '2',
      count: sales.length + mechTransactions.length,
      sales: sales.map((s) => ({
        id: s.id,
        type: 'rice',
        shop: s.Exhibitor?.name,
        shop_id: s.Exhibitor?.shop_id,
        amount: Number(s.amount),
        commission: Number(s.farmwallet_commission),
        created_at: s.created_at,
      })),
      mechanization_transactions: mechTransactions.map((t) => ({
        id: t.id,
        type: 'mechanization',
        provider: t.provider_name || t.MechanizationProvider?.name,
        tractor_registration_number: t.tractor_registration_number,
        amount: Number(t.amount),
        commission: Number(t.farmwallet_commission),
        created_at: t.created_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/data-submissions
 * List/export data submissions (no registration required - collected via USSD "Share your info")
 * Query: format (csv|json), type (submission_type), start, end (ISO dates), page, limit
 */
router.get('/data-submissions', async (req, res) => {
  try {
    const { format = 'json', type, start, end, page = 1, limit = 100 } = req.query;
    const where = {};
    if (type) where.submission_type = String(type).trim();
    if (start) where.created_at = { ...where.created_at, [Op.gte]: new Date(start) };
    if (end) where.created_at = { ...where.created, [Op.lte]: new Date(end) };

    const rows = await db.DataSubmission.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: format === 'csv' ? 5000 : Math.min(parseInt(limit, 10) || 100, 500),
      offset: format === 'csv' ? 0 : (Math.max(parseInt(page, 10) || 1, 1) - 1) * (parseInt(limit, 10) || 100),
    });

    if (format === 'csv') {
      const headers = ['id', 'phone_number', 'submission_type', 'name', 'region', 'interest', 'farm_size_acres', 'source', 'created_at'];
      const escapeCsv = (v) => (v == null ? '' : String(v).replace(/"/g, '""'));
      const toRow = (r) => {
        const d = r.data || {};
        return headers.map((h) => {
          if (h === 'name' || h === 'region' || h === 'interest' || h === 'farm_size_acres') return escapeCsv(d[h]);
          return escapeCsv(r[h]);
        }).join(',');
      };
      const csv = [headers.join(','), ...rows.map(toRow)].join('\n');
      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', `attachment; filename="data-submissions-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(csv);
    }

    res.json({
      submissions: rows.map((r) => ({
        id: r.id,
        phone_number: r.phone_number,
        submission_type: r.submission_type,
        data: r.data,
        source: r.source,
        created_at: r.created_at,
      })),
      count: rows.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Parse CSV text into rows of objects (first row = headers)
 */
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const parseLine = (line) => {
    const vals = [];
    let cur = '';
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c === '"') {
        if (inQuotes && line[j + 1] === '"') {
          cur += '"';
          j++;
        } else inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        vals.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    vals.push(cur);
    return vals;
  };
  const headers = parseLine(lines[0]).map((h) => h.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim().replace(/^"|"$/g, '').replace(/""/g, '"'); });
    rows.push(row);
  }
  return rows;
}

/**
 * POST /api/admin/data-submissions/import
 * Import data submissions from CSV. Body: multipart/form-data, field "file" (CSV).
 * Expected columns: phone_number, name, region, interest, farm_size_acres (submission_type, source optional)
 */
router.post('/data-submissions/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No file uploaded. Use form field "file" with a CSV file.' });
    }
    const text = req.file.buffer.toString('utf8');
    const rows = parseCsv(text);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'CSV is empty or has no data rows. Expected header row + at least one data row.' });
    }
    const MAX_IMPORT_ROWS = 5000;
    if (rows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({ error: `CSV has ${rows.length} rows. Maximum ${MAX_IMPORT_ROWS} rows per import.` });
    }
    const created = [];
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const phone = (r.phone_number || r.phone || '').trim();
      if (!phone) {
        errors.push({ row: i + 2, message: 'Missing phone_number' });
        continue;
      }
      const phoneNorm = normalizePhone(phone);
      const data = {
        name: (r.name || '').trim() || undefined,
        region: (r.region || '').trim() || undefined,
        interest: (r.interest || '').trim() || undefined,
        farm_size_acres: (r.farm_size_acres || '').trim() || undefined,
      };
      Object.keys(data).forEach((k) => { if (data[k] === undefined) delete data[k]; });
      try {
        const sub = await db.DataSubmission.create({
          phone_number: phoneNorm,
          submission_type: (r.submission_type || 'user_info').trim() || 'user_info',
          data: Object.keys(data).length ? data : null,
          source: (r.source || 'manual').trim() || 'manual',
        });
        created.push({ id: sub.id, phone_number: sub.phone_number });
      } catch (e) {
        errors.push({ row: i + 2, message: e.message || 'Insert failed' });
      }
    }
    res.status(201).json({
      imported: created.length,
      errors: errors.length ? errors : undefined,
      message: `Imported ${created.length} row(s)${errors.length ? `, ${errors.length} error(s)` : ''}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Mechanization Services - providers and service offerings
 */

router.get('/mechanization/providers', async (req, res) => {
  try {
    const { page = 1, limit = 20, active, region } = req.query;
    const where = {};
    if (active !== undefined) where.is_active = active === 'true';
    if (region) {
      const escaped = escapeLike(String(region));
      if (escaped) where.region = { [Op.like]: `%${escaped}%` };
    }
    const { count, rows } = await db.MechanizationProvider.findAndCountAll({
      where,
      limit: Math.min(parseInt(limit, 10) || 20, 100),
      offset: (Math.max(parseInt(page, 10) || 1, 1) - 1) * (parseInt(limit, 10) || 20),
      order: [['created_at', 'DESC']],
      include: [{ model: db.MechanizationService, where: { is_active: true }, required: false }],
    });
    res.json({
      providers: rows,
      pagination: { page: parseInt(page, 10) || 1, limit: parseInt(limit, 10) || 20, total: count },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/mechanization/providers', express.json(), async (req, res) => {
  try {
    const { name, phone, momo_number, region, provider_code } = req.body || {};
    const phoneNorm = normalizePhone(phone);
    if (!name || !phoneNorm) return res.status(400).json({ error: 'Name and phone required' });
    let code = provider_code ? String(provider_code).trim() : null;
    if (!code) {
      const count = await db.MechanizationProvider.count();
      code = String(count + 1).padStart(2, '0');
    }
    const provider = await db.MechanizationProvider.create({
      name: String(name).trim(),
      phone: phoneNorm,
      momo_number: momo_number ? String(momo_number).replace(/\D/g, '').replace(/^0/, '233') || null : null,
      region: region ? String(region).trim() : null,
      provider_code: code,
      is_active: true,
    });
    res.status(201).json(provider);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/mechanization/providers/:id', async (req, res) => {
  try {
    const provider = await db.MechanizationProvider.findByPk(req.params.id, {
      include: [{ model: db.MechanizationService }],
    });
    if (!provider) return res.status(404).json({ error: 'Provider not found' });
    res.json(provider);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/mechanization/providers/:id', express.json(), async (req, res) => {
  try {
    const provider = await db.MechanizationProvider.findByPk(req.params.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });
    const allowed = ['name', 'phone', 'momo_number', 'region', 'is_active', 'provider_code'];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        if (k === 'phone' || k === 'momo_number') updates[k] = normalizePhone(req.body[k]) || req.body[k];
        else if (k === 'is_active') updates[k] = Boolean(req.body[k]);
        else if (k === 'verification_status') {
          if (!['pending', 'verified', 'rejected'].includes(req.body[k])) continue;
          updates[k] = req.body[k];
        } else updates[k] = String(req.body[k]).trim();
      }
    }
    await provider.update(updates);
    res.json(provider);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/mechanization/providers/:id/services', express.json(), async (req, res) => {
  try {
    const provider = await db.MechanizationProvider.findByPk(req.params.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });
    const { service_type, price_per_unit, unit, description, tractor_registration_number } = req.body || {};
    const validTypes = ['tractor', 'plowing', 'threshing', 'harvesting', 'seed_drill', 'irrigation', 'sprayer', 'other'];
    const validUnits = ['per_acre', 'per_hour', 'per_day', 'per_job'];
    if (!service_type || !validTypes.includes(service_type)) return res.status(400).json({ error: 'Valid service_type required' });
    if (price_per_unit == null || isNaN(parseFloat(price_per_unit)) || parseFloat(price_per_unit) < 0) return res.status(400).json({ error: 'Valid price_per_unit required' });
    const regNum = tractor_registration_number ? String(tractor_registration_number).trim() : '';
    if (!regNum) return res.status(400).json({ error: 'tractor_registration_number is required (for tracking earnings and commission per tractor)' });
    const service = await db.MechanizationService.create({
      provider_id: provider.id,
      service_type,
      price_per_unit: parseFloat(price_per_unit),
      unit: validUnits.includes(unit) ? unit : 'per_acre',
      description: description ? String(description).trim() : null,
      tractor_registration_number: regNum,
      is_active: true,
      verification_status: 'verified',
    });
    res.status(201).json(service);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Mechanization transactions — 10% commission per tractor service
 */
router.get('/mechanization/transactions', async (req, res) => {
  try {
    const { page = 1, limit = 20, provider_id, start, end } = req.query;
    const where = {};
    if (provider_id) where.provider_id = parseInt(provider_id, 10);
    if (start) where.created_at = { ...where.created_at, [Op.gte]: new Date(start) };
    if (end) where.created_at = { ...where.created_at, [Op.lte]: new Date(end) };
    const { count, rows } = await db.MechanizationTransaction.findAndCountAll({
      where,
      limit: Math.min(parseInt(limit, 10) || 20, 100),
      offset: (Math.max(parseInt(page, 10) || 1, 1) - 1) * (parseInt(limit, 10) || 20),
      order: [['created_at', 'DESC']],
      include: [
        { model: db.MechanizationProvider, attributes: ['id', 'name', 'phone', 'region'] },
        { model: db.MechanizationService, attributes: ['id', 'service_type', 'tractor_registration_number'] },
      ],
    });
    res.json({
      transactions: rows,
      pagination: { page: parseInt(page, 10) || 1, limit: parseInt(limit, 10) || 20, total: count },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/mechanization/transactions', express.json(), async (req, res) => {
  try {
    const { provider_id, service_id, amount, farmer_phone } = req.body || {};
    const service = await db.MechanizationService.findByPk(service_id, {
      include: [{ model: db.MechanizationProvider }],
    });
    if (!service) return res.status(404).json({ error: 'Service not found' });
    if (service.provider_id !== parseInt(provider_id, 10)) return res.status(400).json({ error: 'Service does not belong to provider' });
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Valid amount required' });
    const commissionPct = getMechCommissionPercent();
    const commission = Math.round(amt * commissionPct) / 100;
    const providerName = service.MechanizationProvider?.name ? String(service.MechanizationProvider.name).trim() : null;
    const tx = await db.MechanizationTransaction.create({
      provider_id: service.provider_id,
      provider_name: providerName,
      service_id: service.id,
      amount: amt,
      farmer_phone: farmer_phone ? String(farmer_phone).replace(/\D/g, '').replace(/^0/, '233') || null : null,
      tractor_registration_number: service.tractor_registration_number,
      farmwallet_commission: commission,
      commission_percent: commissionPct,
    });
    res.status(201).json(tx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/mechanization/services
 * List mechanization services. Query: status (pending|verified|rejected), provider_id
 */
router.get('/mechanization/services', async (req, res) => {
  try {
    const { status, provider_id, limit = 50 } = req.query;
    const where = {};
    if (status && ['pending', 'verified', 'rejected'].includes(status)) where.verification_status = status;
    if (provider_id) where.provider_id = parseInt(provider_id, 10);
    const services = await db.MechanizationService.findAll({
      where,
      limit: Math.min(parseInt(limit, 10) || 50, 100),
      order: [['created_at', 'DESC']],
      include: [{ model: db.MechanizationProvider, attributes: ['id', 'name', 'provider_code', 'region'] }],
    });
    res.json({ services });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/mechanization/services/:id', express.json(), async (req, res) => {
  try {
    const service = await db.MechanizationService.findByPk(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    const allowed = ['service_type', 'price_per_unit', 'unit', 'description', 'tractor_registration_number', 'is_active', 'verification_status'];
    const validTypes = ['tractor', 'plowing', 'threshing', 'harvesting', 'seed_drill', 'irrigation', 'sprayer', 'other'];
    const validUnits = ['per_acre', 'per_hour', 'per_day', 'per_job'];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        if (k === 'service_type' && !validTypes.includes(req.body[k])) continue;
        if (k === 'unit' && !validUnits.includes(req.body[k])) continue;
        if (k === 'price_per_unit') updates[k] = parseFloat(req.body[k]);
        else if (k === 'is_active') updates[k] = Boolean(req.body[k]);
        else if (k === 'tractor_registration_number') {
          const v = String(req.body[k]).trim();
          if (!v) {
            return res.status(400).json({ error: 'tractor_registration_number cannot be empty (required for tracking earnings per tractor)' });
          }
          updates[k] = v;
        } else updates[k] = String(req.body[k]).trim();
      }
    }
    await service.update(updates);
    res.json(service);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
