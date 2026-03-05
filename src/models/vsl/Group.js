/**
 * VSL Group model - from external database
 */
module.exports = (sequelize, DataTypes) => {
  const Group = sequelize.define(
    'Group',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      groupCode: { type: DataTypes.STRING(5), allowNull: true, unique: true, field: 'group_code' },
      name: { type: DataTypes.STRING, allowNull: false },
      leaderId: { type: DataTypes.UUID, allowNull: false },
      secretaryId: { type: DataTypes.UUID, allowNull: false },
      treasurerId: { type: DataTypes.UUID, allowNull: false },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      description: { type: DataTypes.STRING, allowNull: true },
      maxMembers: { type: DataTypes.INTEGER },
      numCycles: { type: DataTypes.INTEGER },
      currentCycleStartDate: { type: DataTypes.DATE },
      currentCycleEndDate: { type: DataTypes.DATE },
      currentCycleNumber: { type: DataTypes.INTEGER, defaultValue: 1 },
      shareValue: { type: DataTypes.DECIMAL(10, 2) },
      interestRate: { type: DataTypes.DECIMAL(5, 2) },
      loanDurationLimit: { type: DataTypes.INTEGER }, // in days
      savingsDay: { type: DataTypes.ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday') },
      meetingFrequency: { type: DataTypes.STRING }, // e.g., weekly, biweekly
      isActive: { type: DataTypes.BOOLEAN, defaultValue: false },
      isArchived: { type: DataTypes.BOOLEAN, defaultValue: false },
      activationDate: { type: DataTypes.DATE },
      vbaId: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'groups',
    }
  );

  return Group;
};
