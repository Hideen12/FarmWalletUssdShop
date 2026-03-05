#!/usr/bin/env node
/**
 * Add group_code column to VSL groups table (for USSD shortcodes *920*72*XX#)
 * Run when VSL_DB_* is configured: node scripts/add-vsla-group-code.js
 */
require('dotenv').config();
const vslDb = require('../src/models/vsl');

async function main() {
  if (!vslDb.isConfigured()) {
    console.log('VSL database not configured. Set VSL_DB_HOST, VSL_DB_NAME, VSL_DB_USER.');
    process.exit(1);
  }
  try {
    const [results] = await vslDb.sequelize.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'groups' AND COLUMN_NAME IN ('group_code', 'groupCode')
    `);
    if (results.length > 0) {
      console.log('group_code column already exists.');
      process.exit(0);
    }
    await vslDb.sequelize.query(`
      ALTER TABLE groups ADD COLUMN group_code VARCHAR(5) UNIQUE NULL
      COMMENT 'USSD shortcode extension e.g. 100 for *920*72*100#'
    `);
    console.log('Added group_code column to groups table.');
    console.log('Assign codes to groups: UPDATE groups SET group_code = "01" WHERE id = "uuid";');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
  process.exit(0);
}

main();
