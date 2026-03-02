/**
 * USSD session persistence - survives server restarts and enables resume after telco timeout
 * Africa's Talking session timeout is ~30-60 sec (telco-controlled). We persist to DB so:
 * - Sessions survive server restarts
 * - Users can resume registration after timeout (lookup by phone)
 */
module.exports = (sequelize, DataTypes) => {
  const UssdSession = sequelize.define('UssdSession', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    session_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Telco session ID (e.g. from Africa\'s Talking)',
    },
    phone_number: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: 'User phone for lookup and resume',
    },
    step: {
      type: DataTypes.STRING(80),
      allowNull: false,
      defaultValue: 'menu',
    },
    data: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Session state (step-specific data)',
    },
    provider: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'africastalking, arkesel, etc.',
    },
  }, {
    tableName: 'ussd_sessions',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['session_id', 'phone_number'] },
      { fields: ['phone_number'] },
      { fields: ['updated_at'] },
    ],
  });

  return UssdSession;
};
