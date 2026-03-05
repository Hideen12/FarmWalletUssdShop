/**
 * VSL/VSLA external database connection
 * Used for Village Savings and Loans / VSLA system
 * Optional: only connects when VSL_DB_HOST is set
 */
const { Sequelize } = require('sequelize');
const config = require('../../../config/database');

const vslConfig = config.vsl;
const isConfigured =
  vslConfig &&
  vslConfig.host &&
  vslConfig.database &&
  vslConfig.username !== undefined;

let sequelize = null;
let User = null;
let Group = null;
let GroupMembers = null;
let GroupWallet = null;
let SavingsContribution = null;
let VbaGroupAssignment = null;
let VbaVisit = null;

if (isConfigured) {
  sequelize = new Sequelize(vslConfig.database, vslConfig.username, vslConfig.password, {
    host: vslConfig.host,
    port: vslConfig.port,
    dialect: vslConfig.dialect,
    logging: vslConfig.logging,
    pool: vslConfig.pool,
  });
  User = require('./User')(sequelize, Sequelize.DataTypes);
  Group = require('./Group')(sequelize, Sequelize.DataTypes);
  GroupMembers = require('./GroupMembers')(sequelize, Sequelize.DataTypes);
  GroupWallet = require('./GroupWallet')(sequelize, Sequelize.DataTypes);
  SavingsContribution = require('./SavingsContribution')(sequelize, Sequelize.DataTypes);
  VbaGroupAssignment = require('./VbaGroupAssignment')(sequelize, Sequelize.DataTypes);
  VbaVisit = require('./VbaVisit')(sequelize, Sequelize.DataTypes);

  // Associations for USSD queries
  GroupMembers.belongsTo(Group, { foreignKey: 'groupId' });
  Group.hasMany(GroupMembers, { foreignKey: 'groupId' });
  VbaGroupAssignment.belongsTo(Group, { foreignKey: 'groupId' });
  Group.hasMany(VbaGroupAssignment, { foreignKey: 'groupId' });
}

const vslDb = {
  sequelize,
  User,
  Group,
  GroupMembers,
  GroupWallet,
  SavingsContribution,
  VbaGroupAssignment,
  VbaVisit,
  isConfigured: () => isConfigured,

  async authenticate() {
    if (!sequelize) return false;
    try {
      await sequelize.authenticate();
      return true;
    } catch (err) {
      console.warn('VSL DB connection failed:', err.message);
      return false;
    }
  },
};

module.exports = vslDb;
