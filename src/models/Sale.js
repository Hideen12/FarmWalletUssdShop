module.exports = (sequelize, DataTypes) => {
  const Sale = sequelize.define('Sale', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    exhibitor_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'exhibitors', key: 'id' },
    },
    buyer_phone: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    rice_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    bag_size_kg: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Bag size in kg at time of sale (5, 25, 50, 100)',
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    farmwallet_commission: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Commission to FarmWallet from this sale',
    },
    commission_percent: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0,
      comment: 'Commission % applied at time of sale',
    },
    momo_status: {
      type: DataTypes.ENUM('pending', 'initiated', 'completed', 'failed'),
      defaultValue: 'initiated',
    },
    momo_reference: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    mtn_reference: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'MTN X-Reference-Id from requestToPay - used for callback lookup',
    },
  }, {
    tableName: 'sales',
    timestamps: true,
    underscored: true,
  });

  return Sale;
};
