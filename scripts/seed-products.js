#!/usr/bin/env node
/**
 * Seed exhibitors and products for stress testing
 * Run: node scripts/seed-products.js [count]
 * Default: 20 exhibitors, ~100 products total
 */
require('dotenv').config();
const db = require('../src/models');

const RICE_TYPES = ['perfumed', 'brown', 'parboiled', 'jasmine', 'basmati', 'other'];
const BAG_SIZES_KG = [5, 25, 50, 100];
const STATUSES = ['pending', 'verified', 'verified', 'verified', 'rejected']; // more verified for marketplace
const NAMES = [
  'Golden Grain Rice', 'Premium Rice Co', 'Farm Fresh Rice', 'Northern Rice Hub',
  'Accra Rice Store', 'Kumasi Rice Mart', 'Tamale Rice Depot', 'Cape Coast Rice',
  'Sunrise Rice Shop', 'Harvest Rice Co', 'Green Valley Rice', 'Royal Rice Ltd',
  'Best Rice Ghana', 'Quality Rice Shop', 'Fresh Rice Depot', 'Ghana Rice Plus',
  'Top Rice Store', 'Choice Rice Co', 'Select Rice Shop', 'Prime Rice Mart',
];

async function seed(count = 20) {
  try {
    await db.sequelize.authenticate();
    console.log('Database connected');

    const existingCount = await db.Exhibitor.count();
    const startId = existingCount + 1;

    for (let i = 0; i < count; i++) {
      const shopId = String(startId + i).padStart(2, '0');
      const phone = `233555${String(100000 + i).slice(-6)}`;
      const name = NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : '');

      const [exhibitor] = await db.Exhibitor.findOrCreate({
        where: { shop_id: shopId },
        defaults: {
          shop_id: shopId,
          ghana_card: `GHA-${700000000 + i}-${(i % 10)}`,
          name,
          phone,
          momo_number: `0555${String(100000 + i).slice(-6)}`,
          momo_provider: ['mtn', 'vodafone', 'airteltigo'][i % 3],
          exhibition_day: (i % 3) + 1,
          is_active: true,
        },
      });

      const invCount = await db.ExhibitorInventory.count({ where: { exhibitor_id: exhibitor.id } });
      if (invCount > 0) continue;

      // 3–6 products per exhibitor
      const numProducts = 3 + (i % 4);
      for (let p = 0; p < numProducts; p++) {
        const riceType = RICE_TYPES[(i + p) % RICE_TYPES.length];
        const status = STATUSES[(i + p) % STATUSES.length];
        await db.ExhibitorInventory.create({
          exhibitor_id: exhibitor.id,
          rice_type: riceType,
          bag_size_kg: BAG_SIZES_KG[(i + p) % BAG_SIZES_KG.length],
          quantity: 20 + Math.floor(Math.random() * 80),
          price_per_bag: 80 + Math.floor(Math.random() * 80),
          verification_status: status,
        });
      }
      console.log(`  Shop ${shopId}: ${name} – ${numProducts} products`);
    }

    const totalExhibitors = await db.Exhibitor.count();
    const totalProducts = await db.ExhibitorInventory.count();
    console.log(`\nDone. ${totalExhibitors} exhibitors, ${totalProducts} products total.`);
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

const count = parseInt(process.argv[2], 10) || 20;
seed(count);
