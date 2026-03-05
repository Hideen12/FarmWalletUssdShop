/**
 * VSLA (Village Savings and Loan Association) API
 * Reads from external VSL database when VSL_DB_* is configured
 * Payments: MoMo via Paystack for savings contributions
 */
const express = require('express');
const { Op } = require('sequelize');
const { fn, col } = require('sequelize');
const vslDb = require('../models/vsl');
const db = require('../models');
const vslaContributionService = require('../services/vslaContributionService');

const router = express.Router();

function requireVslaAccess(req, res, next) {
  const isProduction = process.env.NODE_ENV === 'production';
  const key = req.headers['x-api-key'] || (isProduction ? null : req.query.api_key);
  const expected = process.env.ADMIN_API_KEY || process.env.VSLA_API_KEY;
  if (!expected) {
    return res.status(503).json({ error: 'VSLA_API_KEY or ADMIN_API_KEY not configured' });
  }
  if (key === expected) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

function normalizePhone(phone) {
  const raw = String(phone || '').replace(/\D/g, '');
  if (raw.startsWith('233')) return raw;
  return raw.length >= 9 ? '233' + raw.slice(-9) : raw;
}

async function lookupUser(phone) {
  if (!vslDb.isConfigured() || !vslDb.User) return null;
  const p = normalizePhone(phone);
  const local = p.startsWith('233') ? '0' + p.slice(3) : p;
  return vslDb.User.findOne({
    where: {
      [Op.or]: [{ phoneNumber: p }, { phoneNumber: local }],
      isDeleted: false,
    },
    attributes: ['id', 'fullname', 'userType', 'status', 'phoneNumber', 'ghanaCardNumber'],
  });
}

router.get('/', (req, res) => {
  if (!vslDb.isConfigured()) {
    return res.json({
      vsla: true,
      configured: false,
      message: 'VSLA API available. Configure VSL_DB_* to enable.',
    });
  }
  res.json({
    vsla: true,
    configured: true,
    endpoints: [
      'GET /api/vsla/profile?phone=xxx',
      'GET /api/vsla/profile/:phone/groups',
      'GET /api/vsla/profile/:phone/savings',
      'GET /api/vsla/profile/:phone/visits',
      'POST /api/vsla/contribute',
    ],
  });
});

/**
 * GET /api/vsla/profile?phone=0555227753
 * Returns user profile. Requires API key.
 */
router.get('/profile', requireVslaAccess, async (req, res) => {
  if (!vslDb.isConfigured()) {
    return res.status(503).json({ error: 'VSLA database not configured' });
  }
  const phone = req.query.phone;
  if (!phone) {
    return res.status(400).json({ error: 'phone query parameter required' });
  }
  try {
    const user = await lookupUser(phone);
    if (!user) {
      return res.status(404).json({ error: 'User not found in VSLA system' });
    }
    res.json({
      id: user.id,
      fullname: user.fullname,
      userType: user.userType,
      status: user.status,
      phoneNumber: user.phoneNumber,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/vsla/profile/:phone/groups
 * Returns groups (membership for farmers, assigned for VBAs). Requires API key.
 */
router.get('/profile/:phone/groups', requireVslaAccess, async (req, res) => {
  if (!vslDb.isConfigured()) {
    return res.status(503).json({ error: 'VSLA database not configured' });
  }
  const phone = req.params.phone;
  try {
    const user = await lookupUser(phone);
    if (!user) {
      return res.status(404).json({ error: 'User not found in VSLA system' });
    }
    const isVba = user.userType === 'vba';

    if (isVba && vslDb.VbaGroupAssignment && vslDb.Group) {
      const assignments = await vslDb.VbaGroupAssignment.findAll({
        where: { vbaId: user.id },
        include: [{ model: vslDb.Group, attributes: ['id', 'name', 'isActive', 'groupCode'] }],
      });
      const groupsWithShortcode = await Promise.all(assignments.map(async (a) => {
        const ext = db.UssdExtension ? await db.UssdExtension.findOne({ where: { entityType: 'group', entityRef: a.Group?.id } }) : null;
        return {
          id: a.Group?.id,
          name: a.Group?.name,
          isActive: a.Group?.isActive,
          groupCode: a.Group?.groupCode,
          extension: ext?.extension,
          shortcode: ext?.extension ? `*920*72*${ext.extension}#` : null,
        };
      }));
      return res.json({
        type: 'assigned',
        groups: groupsWithShortcode,
      });
    }

    if (vslDb.GroupMembers && vslDb.Group) {
      const memberships = await vslDb.GroupMembers.findAll({
        where: { userId: user.id },
        include: [{ model: vslDb.Group, attributes: ['id', 'name', 'isActive', 'groupCode'] }],
      });
      const groupsWithShortcode = await Promise.all(memberships.map(async (m) => {
        const ext = db.UssdExtension ? await db.UssdExtension.findOne({ where: { entityType: 'group', entityRef: m.Group?.id } }) : null;
        return {
          id: m.Group?.id,
          name: m.Group?.name,
          isActive: m.Group?.isActive,
          groupCode: m.Group?.groupCode,
          extension: ext?.extension,
          shortcode: ext?.extension ? `*920*72*${ext.extension}#` : null,
        };
      }));
      return res.json({
        type: 'membership',
        groups: groupsWithShortcode,
      });
    }

    res.json({ type: 'membership', groups: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/vsla/profile/:phone/savings
 * Returns total savings contributions per group. Requires API key.
 */
router.get('/profile/:phone/savings', requireVslaAccess, async (req, res) => {
  if (!vslDb.isConfigured()) {
    return res.status(503).json({ error: 'VSLA database not configured' });
  }
  const phone = req.params.phone;
  try {
    const user = await lookupUser(phone);
    if (!user) {
      return res.status(404).json({ error: 'User not found in VSLA system' });
    }
    if (!vslDb.SavingsContribution || !vslDb.Group) {
      return res.json({ savings: [] });
    }
    const rows = await vslDb.SavingsContribution.findAll({
      where: { userId: user.id, status: 'confirmed' },
      attributes: ['groupId', [fn('SUM', col('amount')), 'total']],
      group: ['groupId'],
      raw: true,
    });
    const savings = [];
    for (const r of rows) {
      const g = r.groupId ? await vslDb.Group.findByPk(r.groupId, { attributes: ['name'] }) : null;
      savings.push({
        groupId: r.groupId,
        groupName: g?.name || null,
        total: Number(r.total || 0).toFixed(2),
      });
    }
    res.json({ savings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/vsla/profile/:phone/visits
 * Returns upcoming scheduled visits (VBA only). Requires API key.
 */
router.get('/profile/:phone/visits', requireVslaAccess, async (req, res) => {
  if (!vslDb.isConfigured()) {
    return res.status(503).json({ error: 'VSLA database not configured' });
  }
  const phone = req.params.phone;
  try {
    const user = await lookupUser(phone);
    if (!user) {
      return res.status(404).json({ error: 'User not found in VSLA system' });
    }
    if (user.userType !== 'vba') {
      return res.json({ visits: [], message: 'Visits only available for VBA users' });
    }
    if (!vslDb.VbaVisit) {
      return res.json({ visits: [] });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const visits = await vslDb.VbaVisit.findAll({
      where: {
        vbaId: user.id,
        status: 'scheduled',
        scheduledAt: { [Op.gte]: today },
      },
      order: [['scheduledAt', 'ASC'], ['scheduledTime', 'ASC']],
      limit: 20,
      attributes: ['id', 'scheduleCode', 'groupId', 'farmerId', 'typeOfVisit', 'purpose', 'scheduledAt', 'scheduledTime', 'status'],
    });
    res.json({
      visits: visits.map((v) => ({
        id: v.id,
        scheduleCode: v.scheduleCode,
        groupId: v.groupId,
        farmerId: v.farmerId,
        typeOfVisit: v.typeOfVisit,
        purpose: v.purpose,
        scheduledAt: v.scheduledAt,
        scheduledTime: v.scheduledTime,
        status: v.status,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/vsla/contribute
 * Initiate savings contribution via MoMo. Creates pending contribution, sends Paystack charge.
 * Webhook confirms and updates GroupWallet on success.
 * Body: { phone, groupId, amount, momoProvider? (mtn|vodafone|airteltigo), recordedBy? }
 */
router.post('/contribute', requireVslaAccess, express.json(), async (req, res) => {
  if (!vslDb.isConfigured()) {
    return res.status(503).json({ error: 'VSLA database not configured' });
  }
  const { phone, groupId, amount, momoProvider = 'mtn', recordedBy } = req.body;
  if (!phone || !groupId || amount == null) {
    return res.status(400).json({ error: 'phone, groupId, and amount are required' });
  }
  try {
    const user = await lookupUser(phone);
    if (!user) {
      return res.status(404).json({ error: 'User not found in VSLA system' });
    }
    const result = await vslaContributionService.initiateContribution(
      phone,
      user.id,
      groupId,
      amount,
      momoProvider,
      recordedBy
    );
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
        contributionId: result.contributionId,
        reference: result.reference,
      });
    }
    res.status(200).json({
      success: true,
      contributionId: result.contributionId,
      reference: result.reference,
      status: result.status,
      message: result.message,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
