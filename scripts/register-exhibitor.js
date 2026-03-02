#!/usr/bin/env node
/**
 * Register an exhibitor with PIN for dashboard login testing
 * Usage: node scripts/register-exhibitor.js [phone] [pin]
 * Default: phone=0555227753, pin=1234
 */
require('dotenv').config();
const db = require('../src/models');
const pinService = require('../src/services/pinService');

const phone = process.argv[2] || '0555227753';
const pin = process.argv[3] || '1234';
const phoneNorm = phone.replace(/\D/g, '').startsWith('233') ? phone.replace(/\D/g, '') : '233' + phone.replace(/\D/g, '').slice(-9);

async function register() {
  try {
    await db.sequelize.authenticate();
    console.log('Database connected');

    let exhibitor = await db.Exhibitor.findOne({ where: { phone: phoneNorm } });
    if (exhibitor) {
      const pinHash = await pinService.hashPin(pin);
      await exhibitor.update({ pin_hash: pinHash });
      console.log(`Updated existing exhibitor with PIN`);
    } else {
      const count = await db.Exhibitor.count();
      const shop_id = String(count + 1).padStart(2, '0');
      const pinHash = await pinService.hashPin(pin);

      exhibitor = await db.Exhibitor.create({
        shop_id,
        ghana_card: 'GHA-712897615-4',
        name: 'Demo Rice Shop',
        phone: phoneNorm,
        momo_number: phoneNorm.replace('233', '0'),
        momo_provider: 'mtn',
        exhibition_day: 1,
        is_active: true,
        pin_hash: pinHash,
      });

      await db.ExhibitorInventory.create({
        exhibitor_id: exhibitor.id,
        rice_type: 'perfumed',
        bag_size_kg: 50,
        quantity: 50,
        price_per_bag: 120,
        verification_status: 'verified',
      });
      await db.ExhibitorInventory.create({
        exhibitor_id: exhibitor.id,
        rice_type: 'brown',
        bag_size_kg: 25,
        quantity: 30,
        price_per_bag: 100,
        verification_status: 'verified',
      });
      console.log(`Exhibitor created!`);
    }

    console.log(`
Exhibitor Dashboard Login
=========================
URL:      http://localhost:3000/dashboard
Phone:    ${phone.replace(/\D/g, '').length === 10 ? '0' + phone.replace(/\D/g, '').slice(-9) : phone}
PIN:      ${pin}

Shop ID:  ${exhibitor.shop_id}
Name:     ${exhibitor.name}
`);
    process.exit(0);
  } catch (err) {
    console.error('Failed:', err.message || err.toString());
    if (err.parent?.message) console.error('DB:', err.parent.message);
    process.exit(1);
  }
}

register();
