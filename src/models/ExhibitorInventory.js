module.exports = (sequelize, DataTypes) => {
  const ExhibitorInventory = sequelize.define('ExhibitorInventory', {
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
    rice_type: {
      type: DataTypes.ENUM('perfumed', 'brown', 'parboiled', 'jasmine', 'basmati', 'other'),
      allowNull: false,
    },
    bag_size_kg: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 50,
      comment: 'Bag size in kg: 5, 25, 50, or 100',
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    price_per_bag: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    verification_status: {
      type: DataTypes.ENUM('pending', 'verified', 'rejected'),
      defaultValue: 'pending',
      comment: 'Admin must verify before product shows in marketplace',
    },
  }, {
    tableName: 'exhibitor_inventory',
    timestamps: true,
    underscored: true,
  });

  return ExhibitorInventory;
};
