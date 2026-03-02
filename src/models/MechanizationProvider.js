module.exports = (sequelize, DataTypes) => {
  const MechanizationProvider = sequelize.define('MechanizationProvider', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    provider_code: {
      type: DataTypes.STRING(5),
      unique: true,
      allowNull: true,
      comment: 'USSD extension e.g. 01, 02 for *920*73*01# (direct provider access)',
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    momo_number: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    region: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Region or area served (e.g. Northern, Ashanti)',
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    pin_hash: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Hashed 4-digit PIN for dashboard login',
    },
  }, {
    tableName: 'mechanization_providers',
    timestamps: true,
    underscored: true,
  });

  return MechanizationProvider;
};
