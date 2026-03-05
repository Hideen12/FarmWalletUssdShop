#!/usr/bin/env node
/**
 * Add 'purification' to mechanization_services.service_type ENUM
 * Run: node scripts/add-purification-service.js
 */
require('dotenv').config();
const db = require('../src/models');

async function migrate() {
  try {
    await db.sequelize.authenticate();
    await db.sequelize.query(`
      ALTER TABLE mechanization_services
      MODIFY COLUMN service_type ENUM(
        'tractor', 'plowing', 'threshing', 'harvesting',
        'seed_drill', 'irrigation', 'sprayer', 'purification', 'other'
      ) NOT NULL
    `);
    console.log("Added 'purification' to mechanization_services.service_type");
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
