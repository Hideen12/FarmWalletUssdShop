#!/usr/bin/env node
/**
 * Seed mechanization providers and services for testing
 * Run: node scripts/seed-mechanization.js
 */
require('dotenv').config();
const db = require('../src/models');

const PROVIDERS = [
  { name: 'Northern Tractors', phone: '233244111001', region: 'Northern' },
  { name: 'Ashanti Farm Services', phone: '233244111002', region: 'Ashanti' },
  { name: 'Volta Plowing Co', phone: '233244111003', region: 'Volta' },
];

const SERVICE_TYPES = ['tractor', 'plowing', 'threshing', 'harvesting', 'seed_drill', 'irrigation', 'sprayer'];
const UNITS = ['per_acre', 'per_acre', 'per_acre']; // Primary: price per acre; farmer enters acres

function normalizePhone(p) {
  const raw = String(p).replace(/\D/g, '');
  return raw.startsWith('233') ? raw : '233' + raw.slice(-9);
}

async function seed() {
  try {
    await db.sequelize.authenticate();
    console.log('Database connected');

    for (const p of PROVIDERS) {
      const count = await db.MechanizationProvider.count();
      const providerCode = String(count + 1).padStart(2, '0');
      const [provider] = await db.MechanizationProvider.findOrCreate({
        where: { phone: normalizePhone(p.phone) },
        defaults: {
          name: p.name,
          phone: normalizePhone(p.phone),
          momo_number: p.phone.replace('233', '0'),
          region: p.region,
          provider_code: providerCode,
          is_active: true,
        },
      });
      if (!provider.provider_code) {
        await provider.update({ provider_code: providerCode });
      }

      const count = await db.MechanizationService.count({ where: { provider_id: provider.id } });
      if (count > 0) continue;

      for (let i = 0; i < 3; i++) {
        const type = SERVICE_TYPES[(provider.id + i) % SERVICE_TYPES.length];
        await db.MechanizationService.create({
          provider_id: provider.id,
          service_type: type,
          price_per_unit: 50 + Math.floor(Math.random() * 150),
          unit: UNITS[i % UNITS.length],
          tractor_registration_number: `TRC-${String(provider.id).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
          is_active: true,
        });
      }
      console.log(`  ${provider.name} – 3 services`);
    }

    const total = await db.MechanizationProvider.count();
    const svcTotal = await db.MechanizationService.count();
    console.log(`\nDone. ${total} providers, ${svcTotal} services.`);
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

seed();
