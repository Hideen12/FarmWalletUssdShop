#!/usr/bin/env node
/**
 * Create mechanization_transactions table (10% commission per tractor service)
 * Run: node scripts/add-mechanization-transactions-table.js
 */
require('dotenv').config();
const db = require('../src/models');

async function tableExists(qi, name) {
  try {
    await qi.describeTable(name);
    return true;
  } catch {
    return false;
  }
}

async function migrate() {
  try {
    await db.sequelize.authenticate();
    const qi = db.sequelize.getQueryInterface();

    if (!(await tableExists(qi, 'mechanization_transactions'))) {
      await qi.createTable('mechanization_transactions', {
        id: { type: db.Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        provider_id: { type: db.Sequelize.INTEGER, allowNull: false, references: { model: 'mechanization_providers', key: 'id' } },
        service_id: { type: db.Sequelize.INTEGER, allowNull: false, references: { model: 'mechanization_services', key: 'id' } },
        amount: { type: db.Sequelize.DECIMAL(12, 2), allowNull: false },
        farmer_phone: { type: db.Sequelize.STRING(20), allowNull: true },
        tractor_registration_number: { type: db.Sequelize.STRING(50), allowNull: false },
        farmwallet_commission: { type: db.Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        commission_percent: { type: db.Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 10 },
        created_at: { type: db.Sequelize.DATE, allowNull: false },
        updated_at: { type: db.Sequelize.DATE, allowNull: false },
      });
      console.log('Created mechanization_transactions table');
    } else {
      console.log('mechanization_transactions already exists');
    }

    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
