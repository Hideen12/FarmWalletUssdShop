#!/usr/bin/env node
/**
 * Make provider_code required (NOT NULL). Backfills any nulls with system-generated codes.
 * Run: node scripts/require-provider-code.js
 */
require('dotenv').config();
const db = require('../src/models');

async function migrate() {
  try {
    await db.sequelize.authenticate();
    const qi = db.sequelize.getQueryInterface();
    const tableInfo = await qi.describeTable('mechanization_providers');
    if (!tableInfo.provider_code) {
      console.log('provider_code column does not exist. Run npm run add-provider-code first.');
      process.exit(1);
    }
    const providers = await db.MechanizationProvider.findAll({ where: { provider_code: null }, order: [['id', 'ASC']] });
    if (providers.length > 0) {
      let next = 50;
      try {
        const [rows] = await db.sequelize.query(
          `SELECT COALESCE(MAX(CAST(extension AS UNSIGNED)), 49) + 1 as next FROM ussd_extensions WHERE CAST(extension AS UNSIGNED) BETWEEN 50 AND 99`
        );
        next = Number(rows?.[0]?.next || 50);
      } catch (e) {
        const count = await db.MechanizationProvider.count();
        next = Math.min(50 + count, 99);
      }
      for (const p of providers) {
        const code = String(Math.min(next++, 99)).padStart(2, '0');
        await p.update({ provider_code: code });
        console.log(`Backfilled provider ${p.id} (${p.name}) -> ${code}`);
      }
    }
    await db.sequelize.query(
      `ALTER TABLE mechanization_providers MODIFY COLUMN provider_code VARCHAR(5) NOT NULL`
    );
    console.log('provider_code is now required (NOT NULL)');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
