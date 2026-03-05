/**
 * USSD extension registry - maps *920*72*XX# to entity (shop, provider, group)
 * All extensions are under *920*72# and unique across the system
 */
module.exports = (sequelize, DataTypes) => {
  const UssdExtension = sequelize.define(
    'UssdExtension',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      extension: {
        type: DataTypes.STRING(5),
        allowNull: false,
        unique: true,
        comment: 'USSD extension e.g. 01, 02, 50, 100 for *920*72*XX#',
      },
      entityType: {
        type: DataTypes.ENUM('shop', 'provider', 'group'),
        allowNull: false,
        field: 'entity_type',
      },
      entityRef: {
        type: DataTypes.STRING(100),
        allowNull: false,
        field: 'entity_ref',
        comment: 'shop_id, provider_id, or group_id',
      },
    },
    {
      tableName: 'ussd_extensions',
      underscored: true,
      indexes: [{ unique: true, fields: ['extension'] }, { fields: ['entity_type', 'entity_ref'] }],
    }
  );
  return UssdExtension;
};
