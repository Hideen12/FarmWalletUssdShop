/**
 * Data submissions from USSD - no registration required
 * Collects user info for export (farmers, buyers, contact requests)
 */
module.exports = (sequelize, DataTypes) => {
  const DataSubmission = sequelize.define('DataSubmission', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    phone_number: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    submission_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'user_info',
      comment: 'user_info, farmer_survey, contact_request, etc.',
    },
    data: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Flexible fields: name, region, farm_size_acres, interest, etc.',
    },
    source: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'ussd',
      comment: 'ussd, web, manual',
    },
  }, {
    tableName: 'data_submissions',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['phone_number'] },
      { fields: ['submission_type'] },
      { fields: ['created_at'] },
    ],
  });

  return DataSubmission;
};
