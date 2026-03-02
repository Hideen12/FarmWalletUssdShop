#!/usr/bin/env node
/**
 * Add tractor_registration_number column to mechanization_services
 * Run: node scripts/add-tractor-registration-column.js
 */
require('dotenv').config();
const db = require('../src/models');

async function migrate() {
  try {
    const qi = db.sequelize.getQueryInterface();
    const tableInfo = await qi.describeTable('mechanization_services');
    if (!tableInfo.tractor_registration_number) {
      await qi.addColumn('mechanization_services', 'tractor_registration_number', {
        type: db.Sequelize.STRING(50),
        allowNull: true,
      });
      console.log('Added tractor_registration_number to mechanization_services');
    } else {
      console.log('tractor_registration_number already exists');
    }
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
