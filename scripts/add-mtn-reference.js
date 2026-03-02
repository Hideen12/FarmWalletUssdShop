#!/usr/bin/env node
/**
 * Add mtn_reference column to sales table (manual migration)
 * Run when sync fails with "Too many keys" on exhibitors
 */
require('dotenv').config();
const db = require('../src/models');

async function migrate() {
  try {
    await db.sequelize.authenticate();
    await db.sequelize.query(`
      ALTER TABLE sales ADD COLUMN mtn_reference VARCHAR(100) NULL
      COMMENT 'MTN X-Reference-Id from requestToPay'
    `);
    console.log('Migration complete: mtn_reference column added to sales');
  } catch (err) {
    if (err.message?.includes('Duplicate column')) {
      console.log('mtn_reference column already exists');
    } else {
      console.error('Migration failed:', err.message);
      process.exit(1);
    }
  } finally {
    await db.sequelize.close();
  }
}

migrate();
