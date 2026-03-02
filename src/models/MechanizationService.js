module.exports = (sequelize, DataTypes) => {
  const MechanizationService = sequelize.define('MechanizationService', {
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
    service_type: {
      type: DataTypes.ENUM('tractor', 'plowing', 'threshing', 'harvesting', 'seed_drill', 'irrigation', 'sprayer', 'other'),
      allowNull: false,
    },
    price_per_unit: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    unit: {
      type: DataTypes.ENUM('per_acre', 'per_hour', 'per_day', 'per_job'),
      allowNull: false,
      defaultValue: 'per_acre',
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    tractor_registration_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Official tractor/equipment registration number — required for tracking earnings and commission per tractor',
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    verification_status: {
      type: DataTypes.ENUM('pending', 'verified', 'rejected'),
      defaultValue: 'pending',
      comment: 'Admin must verify before service shows on USSD',
    },
  }, {
    tableName: 'mechanization_services',
    timestamps: true,
    underscored: true,
  });

  return MechanizationService;
};
