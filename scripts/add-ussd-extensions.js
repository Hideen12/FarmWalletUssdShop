#!/usr/bin/env node
/**
 * Create ussd_extensions table and populate from existing shops, providers, groups
 * All extensions under *920*72# - unique per entity
 * Ranges: 01-49 shops, 50-99 providers, 100+ groups
 * Run: node scripts/add-ussd-extensions.js
 */
require('dotenv').config();
const db = require('../src/models');
const vslDb = require('../src/models/vsl');

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

    if (!(await tableExists(qi, 'ussd_extensions'))) {
      await qi.createTable('ussd_extensions', {
        id: { type: db.Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        extension: { type: db.Sequelize.STRING(5), allowNull: false, unique: true },
        entity_type: { type: db.Sequelize.ENUM('shop', 'provider', 'group'), allowNull: false },
        entity_ref: { type: db.Sequelize.STRING(100), allowNull: false },
        created_at: { type: db.Sequelize.DATE, allowNull: false },
        updated_at: { type: db.Sequelize.DATE, allowNull: false },
      });
      await qi.addIndex('ussd_extensions', ['extension'], { unique: true });
      console.log('Created ussd_extensions table');
    }

    const UssdExtension = db.UssdExtension || require('../src/models/UssdExtension')(db.sequelize, db.Sequelize.DataTypes);
    const now = new Date();

    // Shops: 01-49
    const exhibitors = await db.Exhibitor.findAll({ where: { is_active: true }, order: [['id', 'ASC']] });
    for (const e of exhibitors) {
      const ext = e.shop_id;
      const [rec] = await db.sequelize.query(
        `SELECT id FROM ussd_extensions WHERE extension = ?`,
        { replacements: [ext] }
      );
      if (!rec || rec.length === 0) {
        await db.sequelize.query(
          `INSERT INTO ussd_extensions (extension, entity_type, entity_ref, created_at, updated_at) VALUES (?, 'shop', ?, ?, ?)`,
          { replacements: [ext, e.shop_id, now, now] }
        );
        console.log(`Registered shop ${e.shop_id} -> *920*72*${ext}#`);
      }
    }

    // Providers: 50-99
    const providers = await db.MechanizationProvider.findAll({ where: { is_active: true }, order: [['id', 'ASC']] });
    for (let i = 0; i < providers.length; i++) {
      const [rec] = await db.sequelize.query(
        `SELECT id FROM ussd_extensions WHERE entity_type = 'provider' AND entity_ref = ?`,
        { replacements: [String(providers[i].id)] }
      );
      if (!rec || rec.length === 0) {
        const [maxRow] = await db.sequelize.query(
          `SELECT COALESCE(MAX(CAST(extension AS UNSIGNED)), 49) + 1 as next FROM ussd_extensions WHERE CAST(extension AS UNSIGNED) BETWEEN 50 AND 99`
        );
        const next = Math.min(Number(maxRow?.[0]?.next || 50), 99);
        const extToUse = String(next).padStart(2, '0');
        await db.sequelize.query(
          `INSERT INTO ussd_extensions (extension, entity_type, entity_ref, created_at, updated_at) VALUES (?, 'provider', ?, ?, ?)`,
          { replacements: [extToUse, String(providers[i].id), now, now] }
        );
        await providers[i].update({ provider_code: extToUse });
        console.log(`Registered provider ${providers[i].name} -> *920*72*${extToUse}#`);
      }
    }

    // Groups (VSL): 100+
    if (vslDb.isConfigured() && vslDb.Group) {
      const groups = await vslDb.Group.findAll({ where: { isActive: true }, order: [['id', 'ASC']] });
      for (let i = 0; i < groups.length; i++) {
        const ext = String(100 + i);
        const groupId = groups[i].id;
        const [rec] = await db.sequelize.query(
          `SELECT id FROM ussd_extensions WHERE entity_type = 'group' AND entity_ref = ?`,
          { replacements: [groupId] }
        );
        if (!rec || rec.length === 0) {
          const [existing] = await db.sequelize.query(
            `SELECT id FROM ussd_extensions WHERE extension = ?`,
            { replacements: [ext] }
          );
          let extToUse = ext;
          if (existing?.length) {
            const max = await db.sequelize.query(
              `SELECT MAX(CAST(extension AS UNSIGNED)) as m FROM ussd_extensions WHERE CAST(extension AS UNSIGNED) >= 100`,
              { type: db.sequelize.QueryTypes.SELECT }
            );
            extToUse = String((Number(max[0]?.m || 99) + 1));
          }
          await db.sequelize.query(
            `INSERT INTO ussd_extensions (extension, entity_type, entity_ref, created_at, updated_at) VALUES (?, 'group', ?, ?, ?)`,
            { replacements: [extToUse, groupId, now, now] }
          );
          console.log(`Registered group ${groups[i].name} -> *920*72*${extToUse}#`);
        }
      }
    }

    console.log('Done. All extensions under *920*72#');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
