/**
 * VSL VbaVisit model - from external database
 */
module.exports = (sequelize, DataTypes) => {
  const VbaVisit = sequelize.define('VbaVisit', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    vbaId: { type: DataTypes.UUID, allowNull: false },
    scheduleCode: {
      type: DataTypes.STRING(8),
      allowNull: false,
      unique: true
    },
    groupId: { type: DataTypes.UUID, allowNull: true },
    farmerId: { type: DataTypes.UUID, allowNull: true },
    typeOfVisit: { type: DataTypes.ENUM('onboarding', 'deposit', 'loan follow-up', 'field-visit'), allowNull: true },
    purpose: { type: DataTypes.TEXT, allowNull: true },
    scheduledAt: { type: DataTypes.DATE, allowNull: false },
    scheduledTime: { type: DataTypes.TIME, allowNull: false },
    status: { type: DataTypes.ENUM('scheduled', 'completed', 'missed', 'cancelled'), defaultValue: 'scheduled' },
    outcome: { type: DataTypes.TEXT, allowNull: true },
    remindersSent: { type: DataTypes.INTEGER, defaultValue: 0 },
    createdBy: { type: DataTypes.UUID, allowNull: true }
  }, {
    tableName: 'vba_visits',
    timestamps: true
  });

  return VbaVisit;
};
