#!/usr/bin/env node
/**
 * Seed sample sales for testing dashboards
 * Run: node scripts/seed-sales.js [count]
 */
require('dotenv').config();
const db = require('../src/models');

const COMMISSION_PCT = parseFloat(process.env.FARMWALLET_COMMISSION_PERCENT || '2');

async function seed(count = 15) {
  try {
    await db.sequelize.authenticate();
    const exhibitors = await db.Exhibitor.findAll({
      where: { is_active: true },
      attributes: ['id'],
      limit: 10,
    });
    if (exhibitors.length === 0) {
      console.log('No exhibitors found. Run seed-products first.');
      process.exit(1);
    }

    const created = [];
    for (let i = 0; i < count; i++) {
      const ex = exhibitors[i % exhibitors.length];
      const amount = 80 + Math.floor(Math.random() * 200);
      const commission = Math.round(amount * COMMISSION_PCT) / 100;
      const sale = await db.Sale.create({
        exhibitor_id: ex.id,
        buyer_phone: `233555${String(100000 + i).slice(-6)}`,
        rice_type: ['perfumed', 'brown', 'parboiled'][i % 3],
        bag_size_kg: [25, 50, 50, 100][i % 4],
        quantity: 1 + (i % 3),
        amount,
        farmwallet_commission: commission,
        commission_percent: COMMISSION_PCT,
        momo_status: ['completed', 'completed', 'initiated', 'failed'][i % 4],
        momo_reference: `MOCK-${Date.now()}-${i}`,
      });
      created.push(sale.id);
    }
    console.log(`Created ${created.length} sample sales.`);
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

seed(parseInt(process.argv[2], 10) || 15);
