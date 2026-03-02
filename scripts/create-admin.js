#!/usr/bin/env node
/**
 * Create first admin user
 * Usage: node scripts/create-admin.js
 * Or: ADMIN_PHONE=0555227753 ADMIN_PASSWORD=yourpassword node scripts/create-admin.js
 */
require('dotenv').config();
const db = require('../src/models');
const pinService = require('../src/services/pinService');

function normalizePhone(phone) {
  if (!phone) return '';
  const raw = String(phone).replace(/\D/g, '');
  return raw.startsWith('233') ? raw : (raw.length >= 9 ? '233' + raw.slice(-9) : '233' + raw);
}

async function main() {
  const phone = process.env.ADMIN_PHONE || process.argv[2];
  const password = process.env.ADMIN_PASSWORD || process.argv[3];

  if (!phone || !password) {
    console.error('Usage: ADMIN_PHONE=0555227753 ADMIN_PASSWORD=yourpassword node scripts/create-admin.js');
    console.error('   Or: node scripts/create-admin.js 0555227753 yourpassword');
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }

  if (password.length < 6) {
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }

  const phoneNorm = normalizePhone(phone);
  await db.sequelize.authenticate();
  await db.sequelize.sync({ alter: false }); // creates admins table if missing

  const existing = await db.Admin.findOne({ where: { phone: phoneNorm } });
  if (existing) {
    const hash = await pinService.hashPassword(password);
    await existing.update({ password_hash: hash });
    console.log('Admin password updated for', phoneNorm);
  } else {
    const hash = await pinService.hashPassword(password);
    await db.Admin.create({
      phone: phoneNorm,
      password_hash: hash,
      name: 'Admin',
      is_active: true,
    });
    console.log('Admin created:', phoneNorm);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
