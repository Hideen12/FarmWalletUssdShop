#!/usr/bin/env node
/**
 * Add pin_hash column to mechanization_providers for dashboard login
 * Run: node scripts/add-provider-pin-hash.js
 */
require('dotenv').config();
const db = require('../src/models');

async function migrate() {
  try {
    await db.sequelize.authenticate();
    const qi = db.sequelize.getQueryInterface();
    const tableInfo = await qi.describeTable('mechanization_providers');
    if (!tableInfo.pin_hash) {
      await qi.addColumn('mechanization_providers', 'pin_hash', {
        type: db.Sequelize.STRING(255),
        allowNull: true,
      });
      console.log('Added pin_hash to mechanization_providers');
    } else {
      console.log('pin_hash already exists');
    }
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
