module.exports = (sequelize, DataTypes) => {
  const Exhibitor = sequelize.define('Exhibitor', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    shop_id: {
      type: DataTypes.STRING(5),
      unique: true,
      allowNull: false,
      comment: 'Digital Shop ID e.g. 01, 02 for *920*72*01#',
    },
    ghana_card: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: 'Ghana Card (national ID) for exhibitor verification',
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
      allowNull: false,
    },
    momo_provider: {
      type: DataTypes.ENUM('mtn', 'vodafone', 'airteltigo'),
      allowNull: false,
    },
    exhibition_day: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: 'Exhibition day (1, 2, 3...) - exhibitor receives payments on this day',
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    pin_hash: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Bcrypt hash of exhibitor 4-digit PIN for secure access',
    },
  }, {
    tableName: 'exhibitors',
    timestamps: true,
    underscored: true,
  });

  return Exhibitor;
};
