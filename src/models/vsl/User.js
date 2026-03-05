/**
 * VSL/VSLA User model - from external database
 * User types: farmer, input_dealer, vsla_leader, vba
 */
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      fullname: { type: DataTypes.STRING },
      phoneNumber: { type: DataTypes.STRING, unique: true, allowNull: false },
      dateOfBirth: { type: DataTypes.DATEONLY },
      address: { type: DataTypes.STRING },
      nextOfKin: { type: DataTypes.STRING },
      nextOfKinContact: { type: DataTypes.STRING },
      ghanaCardNumber: { type: DataTypes.STRING, unique: true },
      ghanaCardPhoto: { type: DataTypes.STRING },
      selfiePhoto: { type: DataTypes.STRING },
      userType: {
        type: DataTypes.ENUM('farmer', 'input_dealer', 'vsla_leader', 'vba'),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('draft', 'pending', 'approved', 'rejected'),
        defaultValue: 'draft',
      },
      registrationStep: {
        type: DataTypes.ENUM('personal_info', 'identification', 'completed'),
        defaultValue: 'personal_info',
      },
      locationId: { type: DataTypes.INTEGER, allowNull: true },
      gender: {
        type: DataTypes.ENUM('Male', 'Female', 'Other', 'Prefer not to say'),
        allowNull: true,
      },
      disabilityStatus: {
        type: DataTypes.ENUM('Yes', 'No'),
        allowNull: true,
        defaultValue: 'No',
      },
      valueChain: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
      valueChainActivities: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
      partnerId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'partners', key: 'id' },
      },
      partnerMetadata: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
      isSuspended: { type: DataTypes.BOOLEAN, defaultValue: false },
      isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },
      refreshToken: { type: DataTypes.STRING },
      createdBy: { type: DataTypes.UUID, allowNull: true },
      vbaPermissions: {
        type: DataTypes.JSON,
        defaultValue: {
          canOnboard: true,
          canDeposit: true,
          canRecordSavings: true,
          canApplyForLoans: true,
          canVisit: true,
        },
      },
    },
    {
      timestamps: true,
      paranoid: true,
      tableName: 'users',
      indexes: [
        { fields: ['partnerId'] },
        { fields: ['gender'] },
        { fields: ['locationId'] },
        { fields: ['createdBy'] },
        { fields: ['phoneNumber'] },
        { fields: ['userType'] },
        { fields: ['status'] },
      ],
    }
  );
  return User;
};
