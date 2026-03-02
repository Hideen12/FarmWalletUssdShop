#!/usr/bin/env node
/**
 * Create mechanization_providers and mechanization_services tables
 * Run: node scripts/add-mechanization-tables.js
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

    if (!(await tableExists(qi, 'mechanization_providers'))) {
      await qi.createTable('mechanization_providers', {
        id: { type: db.Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: db.Sequelize.STRING(255), allowNull: false },
        phone: { type: db.Sequelize.STRING(20), allowNull: false },
        momo_number: { type: db.Sequelize.STRING(20), allowNull: true },
        region: { type: db.Sequelize.STRING(100), allowNull: true },
        is_active: { type: db.Sequelize.BOOLEAN, defaultValue: true },
        created_at: { type: db.Sequelize.DATE, allowNull: false },
        updated_at: { type: db.Sequelize.DATE, allowNull: false },
      });
      console.log('Created mechanization_providers table');
    } else {
      console.log('mechanization_providers already exists');
    }

    if (!(await tableExists(qi, 'mechanization_services'))) {
      await qi.createTable('mechanization_services', {
        id: { type: db.Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        provider_id: { type: db.Sequelize.INTEGER, allowNull: false, references: { model: 'mechanization_providers', key: 'id' } },
        service_type: { type: db.Sequelize.ENUM('tractor', 'plowing', 'threshing', 'harvesting', 'seed_drill', 'irrigation', 'sprayer', 'other'), allowNull: false },
        price_per_unit: { type: db.Sequelize.DECIMAL(10, 2), allowNull: false },
        unit: { type: db.Sequelize.ENUM('per_acre', 'per_hour', 'per_day', 'per_job'), allowNull: false, defaultValue: 'per_acre' },
        description: { type: db.Sequelize.STRING(255), allowNull: true },
        is_active: { type: db.Sequelize.BOOLEAN, defaultValue: true },
        created_at: { type: db.Sequelize.DATE, allowNull: false },
        updated_at: { type: db.Sequelize.DATE, allowNull: false },
      });
      console.log('Created mechanization_services table');
    } else {
      console.log('mechanization_services already exists');
    }

    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
