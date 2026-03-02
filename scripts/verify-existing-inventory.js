#!/usr/bin/env node
/**
 * Migrate to verification_status: add column, migrate from verified (if exists), drop verified
 * Run once: node scripts/verify-existing-inventory.js
 */
require('dotenv').config();
const db = require('../src/models');

async function main() {
  await db.sequelize.authenticate();

  try {
    await db.sequelize.query(
      "ALTER TABLE exhibitor_inventory ADD COLUMN verification_status ENUM('pending','verified','rejected') DEFAULT 'pending'"
    );
    console.log('Added verification_status column.');
  } catch (e) {
    if (e.original?.code === 'ER_DUP_FIELDNAME') {
      console.log('verification_status column already exists.');
    } else throw e;
  }

  try {
    await db.sequelize.query(
      "UPDATE exhibitor_inventory SET verification_status = 'verified' WHERE verified = 1"
    );
    console.log('Migrated verified=1 to verification_status=verified.');
  } catch (e) {
    if (e.original?.code !== 'ER_BAD_FIELD_ERROR') console.log('No verified column to migrate.');
  }

  try {
    await db.sequelize.query('ALTER TABLE exhibitor_inventory DROP COLUMN verified');
    console.log('Dropped verified column.');
  } catch (e) {
    if (e.original?.code !== 'ER_CANT_DROP_FIELD_OR_KEY' && e.original?.code !== 'ER_BAD_FIELD_ERROR') {
      console.log('verified column not found or already dropped.');
    }
  }

  console.log('Migration complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
