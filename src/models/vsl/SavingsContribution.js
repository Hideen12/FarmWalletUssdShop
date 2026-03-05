/**
 * VSL SavingsContribution model - from external database
 */
module.exports = (sequelize, DataTypes) => {
  const SavingsContribution = sequelize.define(
    'SavingsContribution',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      groupId: { type: DataTypes.UUID },
      userId: { type: DataTypes.UUID },
      amount: { type: DataTypes.DECIMAL(10, 2) },
      contributionDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      paymentMethod: { type: DataTypes.ENUM('momo', 'wallet'), allowNull: false },
      virtualWalletId: { type: DataTypes.UUID, allowNull: true },
      reference: { type: DataTypes.STRING },
      status: {
        type: DataTypes.ENUM('pending', 'confirmed', 'failed'),
        defaultValue: 'pending',
      },
      recordedBy: { type: DataTypes.UUID, allowNull: true },
      smsNotified: { type: DataTypes.BOOLEAN, defaultValue: false },
    },
    {
      tableName: 'savings_contributions',
    }
  );

  SavingsContribution.addHook('beforeValidate', (contribution, options) => {
    if (contribution.paymentMethod === 'wallet' && !contribution.virtualWalletId) {
      throw new Error('VirtualWalletId is required when payment method is wallet');
    }
  });

  return SavingsContribution;
};
