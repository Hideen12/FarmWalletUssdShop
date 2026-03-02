#!/usr/bin/env node
/**
 * Create data_submissions table for collecting user data via USSD
 * No registration required - export via GET /api/admin/data-submissions?format=csv
 * Run: node scripts/add-data-submissions.js
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

    if (!(await tableExists(qi, 'data_submissions'))) {
      await qi.createTable('data_submissions', {
        id: { type: db.Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        phone_number: { type: db.Sequelize.STRING(20), allowNull: false },
        submission_type: { type: db.Sequelize.STRING(50), allowNull: false, defaultValue: 'user_info' },
        data: { type: db.Sequelize.JSON, allowNull: true },
        source: { type: db.Sequelize.STRING(20), allowNull: true, defaultValue: 'ussd' },
        created_at: { type: db.Sequelize.DATE, allowNull: false },
        updated_at: { type: db.Sequelize.DATE, allowNull: false },
      });
      await qi.addIndex('data_submissions', ['phone_number']);
      await qi.addIndex('data_submissions', ['submission_type']);
      await qi.addIndex('data_submissions', ['created_at']);
      console.log('Created data_submissions table');
    } else {
      console.log('data_submissions already exists');
    }

    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
