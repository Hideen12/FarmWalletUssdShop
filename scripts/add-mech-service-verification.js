#!/usr/bin/env node
/**
 * Add verification_status to mechanization_services (pending, verified, rejected)
 * Run: node scripts/add-mech-service-verification.js
 */
require('dotenv').config();
const db = require('../src/models');

async function migrate() {
  try {
    await db.sequelize.authenticate();
    const qi = db.sequelize.getQueryInterface();
    const tableInfo = await qi.describeTable('mechanization_services');
    if (!tableInfo.verification_status) {
      await qi.addColumn('mechanization_services', 'verification_status', {
        type: db.Sequelize.ENUM('pending', 'verified', 'rejected'),
        allowNull: true,
      });
      console.log('Added verification_status to mechanization_services');
      await db.sequelize.query("UPDATE mechanization_services SET verification_status = 'verified'");
      console.log('Backfilled existing services as verified');
    } else {
      console.log('verification_status already exists');
    }
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
