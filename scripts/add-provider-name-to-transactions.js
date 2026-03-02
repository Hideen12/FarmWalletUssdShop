#!/usr/bin/env node
/**
 * Add provider_name column to mechanization_transactions (business name at time of transaction)
 * Run: node scripts/add-provider-name-to-transactions.js
 */
require('dotenv').config();
const db = require('../src/models');

async function migrate() {
  try {
    await db.sequelize.authenticate();
    const qi = db.sequelize.getQueryInterface();
    const tableInfo = await qi.describeTable('mechanization_transactions');
    if (!tableInfo.provider_name) {
      await qi.addColumn('mechanization_transactions', 'provider_name', {
        type: db.Sequelize.STRING(255),
        allowNull: true,
      });
      console.log('Added provider_name to mechanization_transactions');
      const [rows] = await db.sequelize.query(
        'SELECT t.id, t.provider_id, p.name FROM mechanization_transactions t JOIN mechanization_providers p ON t.provider_id = p.id WHERE t.provider_name IS NULL'
      );
      for (const r of rows) {
        await db.sequelize.query('UPDATE mechanization_transactions SET provider_name = ? WHERE id = ?', {
          replacements: [r.name, r.id],
        });
      }
      if (rows.length) console.log(`Backfilled provider_name for ${rows.length} existing transaction(s)`);
    } else {
      console.log('provider_name already exists');
    }
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
