#!/usr/bin/env node
/**
 * Add bag_size_kg column to exhibitor_inventory and sales tables
 * Run: node scripts/add-bag-size-columns.js
 */
require('dotenv').config();
const db = require('../src/models');

async function migrate() {
  try {
    const queryInterface = db.sequelize.getQueryInterface();
    const tableInfo = await queryInterface.describeTable('exhibitor_inventory');
    if (!tableInfo.bag_size_kg) {
      await queryInterface.addColumn('exhibitor_inventory', 'bag_size_kg', {
        type: db.Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 50,
      });
      console.log('Added bag_size_kg to exhibitor_inventory');
    } else {
      console.log('exhibitor_inventory.bag_size_kg already exists');
    }

    const saleInfo = await queryInterface.describeTable('sales');
    if (!saleInfo.bag_size_kg) {
      await queryInterface.addColumn('sales', 'bag_size_kg', {
        type: db.Sequelize.INTEGER,
        allowNull: true,
      });
      console.log('Added bag_size_kg to sales');
    } else {
      console.log('sales.bag_size_kg already exists');
    }
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
