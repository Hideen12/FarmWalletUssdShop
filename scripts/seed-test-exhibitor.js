#!/usr/bin/env node
/**
 * Seed a test exhibitor with your phone number for USSD testing
 * Run: node scripts/seed-test-exhibitor.js
 */
require('dotenv').config();
const db = require('../src/models');

const TEST_EXHIBITOR = {
  phone: '233555227753',
  momo_number: '0555227753',
  ghana_card: 'GHA-712897615-4',
  name: 'Test Rice Shop',
  momo_provider: 'mtn',
  exhibition_day: 1,
};

async function seed() {
  try {
    await db.sequelize.authenticate();
    console.log('Database connected');

    const existing = await db.Exhibitor.findOne({ where: { phone: TEST_EXHIBITOR.phone } });
    if (existing) {
      console.log(`Exhibitor already exists: Shop ${existing.shop_id} - ${existing.name}`);
      process.exit(0);
      return;
    }

    const count = await db.Exhibitor.count();
    const shop_id = String(count + 1).padStart(2, '0');

    const exhibitor = await db.Exhibitor.create({
      shop_id,
      ...TEST_EXHIBITOR,
    });

    await db.ExhibitorInventory.create({
      exhibitor_id: exhibitor.id,
      rice_type: 'perfumed',
      bag_size_kg: 50,
      quantity: 50,
      price_per_bag: 120,
    });
    await db.ExhibitorInventory.create({
      exhibitor_id: exhibitor.id,
      rice_type: 'brown',
      bag_size_kg: 25,
      quantity: 30,
      price_per_bag: 100,
    });

    console.log(`Test exhibitor created!`);
    console.log(`  Shop ID: ${exhibitor.shop_id}`);
    console.log(`  Name: ${exhibitor.name}`);
    console.log(`  Phone: +${exhibitor.phone}`);
    console.log(`  Dial *920*72*${exhibitor.shop_id}# to access your shop`);
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
