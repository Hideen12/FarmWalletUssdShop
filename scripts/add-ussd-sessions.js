#!/usr/bin/env node
/**
 * Create ussd_sessions table for persistent USSD session storage
 * Enables: server restart survival, resume after Africa's Talking timeout (~60 sec)
 * Run: node scripts/add-ussd-sessions.js
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

    if (!(await tableExists(qi, 'ussd_sessions'))) {
      await qi.createTable('ussd_sessions', {
        id: { type: db.Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        session_id: { type: db.Sequelize.STRING(100), allowNull: false },
        phone_number: { type: db.Sequelize.STRING(20), allowNull: false },
        step: { type: db.Sequelize.STRING(80), allowNull: false, defaultValue: 'menu' },
        data: { type: db.Sequelize.JSON, allowNull: true },
        provider: { type: db.Sequelize.STRING(20), allowNull: true },
        created_at: { type: db.Sequelize.DATE, allowNull: false },
        updated_at: { type: db.Sequelize.DATE, allowNull: false },
      });
      await qi.addIndex('ussd_sessions', ['session_id', 'phone_number'], { unique: true });
      await qi.addIndex('ussd_sessions', ['phone_number']);
      await qi.addIndex('ussd_sessions', ['updated_at']);
      console.log('Created ussd_sessions table');
    } else {
      console.log('ussd_sessions already exists');
    }

    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
