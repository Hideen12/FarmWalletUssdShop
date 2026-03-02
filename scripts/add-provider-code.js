#!/usr/bin/env node
/**
 * Add provider_code column to mechanization_providers for USSD shortcode *920*73*XX#
 * Run: node scripts/add-provider-code.js
 */
require('dotenv').config();
const db = require('../src/models');

async function migrate() {
  try {
    await db.sequelize.authenticate();
    const qi = db.sequelize.getQueryInterface();
    const tableInfo = await qi.describeTable('mechanization_providers');
    if (!tableInfo.provider_code) {
      await qi.addColumn('mechanization_providers', 'provider_code', {
        type: db.Sequelize.STRING(5),
        allowNull: true,
      });
      console.log('Added provider_code to mechanization_providers');

      const providers = await db.MechanizationProvider.findAll({ order: [['id', 'ASC']] });
      for (let i = 0; i < providers.length; i++) {
        const code = String(i + 1).padStart(2, '0');
        await providers[i].update({ provider_code: code });
      }
      if (providers.length) {
        console.log(`Backfilled provider_code for ${providers.length} provider(s): 01, 02, ...`);
      }

      await qi.addIndex('mechanization_providers', ['provider_code'], { unique: true });
      console.log('Added unique index on provider_code');
    } else {
      console.log('provider_code already exists');
    }
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
