module.exports = (sequelize, DataTypes) => {
  const MechanizationTransaction = sequelize.define('MechanizationTransaction', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    provider_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'mechanization_providers', key: 'id' },
    },
    provider_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Provider business name at time of transaction (denormalized for reporting)',
    },
    service_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'mechanization_services', key: 'id' },
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      comment: 'Total amount paid (GHS)',
    },
    farmer_phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Farmer/customer phone',
    },
    tractor_registration_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'From service — for tracking earnings per tractor',
    },
    farmwallet_commission: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      comment: '10% commission to FarmWallet',
    },
    commission_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 10,
      comment: 'Commission % at time of transaction',
    },
  }, {
    tableName: 'mechanization_transactions',
    timestamps: true,
    underscored: true,
  });

  return MechanizationTransaction;
};
