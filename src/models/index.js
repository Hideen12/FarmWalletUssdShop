const { Sequelize } = require('sequelize');
const config = require('../../config/database');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    logging: dbConfig.logging,
    pool: dbConfig.pool,
  }
);

const db = {
  sequelize,
  Sequelize,
  Exhibitor: require('./Exhibitor')(sequelize, Sequelize.DataTypes),
  ExhibitorInventory: require('./ExhibitorInventory')(sequelize, Sequelize.DataTypes),
  Sale: require('./Sale')(sequelize, Sequelize.DataTypes),
  Admin: require('./Admin')(sequelize, Sequelize.DataTypes),
  MechanizationProvider: require('./MechanizationProvider')(sequelize, Sequelize.DataTypes),
  MechanizationService: require('./MechanizationService')(sequelize, Sequelize.DataTypes),
  MechanizationTransaction: require('./MechanizationTransaction')(sequelize, Sequelize.DataTypes),
  UssdSession: require('./UssdSession')(sequelize, Sequelize.DataTypes),
  DataSubmission: require('./DataSubmission')(sequelize, Sequelize.DataTypes),
  UssdExtension: require('./UssdExtension')(sequelize, Sequelize.DataTypes),
};

db.ExhibitorInventory.belongsTo(db.Exhibitor, { foreignKey: 'exhibitor_id' });
db.Exhibitor.hasMany(db.ExhibitorInventory, { foreignKey: 'exhibitor_id' });
db.Sale.belongsTo(db.Exhibitor, { foreignKey: 'exhibitor_id' });
db.Exhibitor.hasMany(db.Sale, { foreignKey: 'exhibitor_id' });
db.MechanizationService.belongsTo(db.MechanizationProvider, { foreignKey: 'provider_id' });
db.MechanizationProvider.hasMany(db.MechanizationService, { foreignKey: 'provider_id' });
db.MechanizationTransaction.belongsTo(db.MechanizationProvider, { foreignKey: 'provider_id' });
db.MechanizationTransaction.belongsTo(db.MechanizationService, { foreignKey: 'service_id' });
db.MechanizationProvider.hasMany(db.MechanizationTransaction, { foreignKey: 'provider_id' });
db.MechanizationService.hasMany(db.MechanizationTransaction, { foreignKey: 'service_id' });

module.exports = db;
