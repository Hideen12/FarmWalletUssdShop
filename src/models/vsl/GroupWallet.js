/**
 * VSL GroupWallet model - from external database
 */
module.exports = (sequelize, DataTypes) => {
  const GroupWallet = sequelize.define('GroupWallet', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    groupId: { type: DataTypes.UUID, allowNull: false },
    mainBalance: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    socialFund: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 }
  }, {
    tableName: 'group_wallets'
  });

  return GroupWallet;
};
