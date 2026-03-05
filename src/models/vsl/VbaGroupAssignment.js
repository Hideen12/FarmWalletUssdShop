/**
 * VSL VbaGroupAssignment model - from external database
 */
module.exports = (sequelize, DataTypes) => {
  const VbaGroupAssignment = sequelize.define('VbaGroupAssignment', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    vbaId: { type: DataTypes.UUID, allowNull: false },
    groupId: { type: DataTypes.UUID, allowNull: false },
    assignedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'vba_group_assignments',
    timestamps: true
  });

  return VbaGroupAssignment;
};
