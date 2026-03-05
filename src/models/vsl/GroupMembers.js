/**
 * VSL GroupMembers model - from external database
 */
module.exports = (sequelize, DataTypes) => {
  const GroupMembers = sequelize.define(
    'GroupMembers',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      groupId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
      membershipNumber: { type: DataTypes.STRING },
      joinedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      timestamps: false,
      tableName: 'group_members',
    }
  );

  return GroupMembers;
};
