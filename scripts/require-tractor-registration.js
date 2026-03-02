#!/usr/bin/env node
/**
 * Make tractor_registration_number required (NOT NULL)
 * Backfills any NULL values with UNKNOWN-{id} before altering the column.
 * Run: node scripts/require-tractor-registration.js
 */
require('dotenv').config();
const db = require('../src/models');

async function migrate() {
  try {
    await db.sequelize.authenticate();
    console.log('Database connected');

    const [rows] = await db.sequelize.query(
      "SELECT id FROM mechanization_services WHERE tractor_registration_number IS NULL OR tractor_registration_number = ''"
    );
    if (rows.length > 0) {
      console.log(`Backfilling ${rows.length} service(s) with placeholder registration numbers...`);
      for (const r of rows) {
        await db.sequelize.query(
          'UPDATE mechanization_services SET tractor_registration_number = ? WHERE id = ?',
          { replacements: [`UNKNOWN-${r.id}`, r.id] }
        );
      }
      console.log('Backfill complete. Please update these to real registration numbers via Admin.');
    }

    const qi = db.sequelize.getQueryInterface();
    const tableInfo = await qi.describeTable('mechanization_services');
    if (tableInfo.tractor_registration_number && tableInfo.tractor_registration_number.allowNull) {
      await qi.changeColumn('mechanization_services', 'tractor_registration_number', {
        type: db.Sequelize.STRING(50),
        allowNull: false,
      });
      console.log('tractor_registration_number is now required (NOT NULL)');
    } else {
      console.log('tractor_registration_number already required');
    }
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
