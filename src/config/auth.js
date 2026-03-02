/**
 * Centralized auth config - enforces JWT_SECRET in production
 */
function getJwtConfig() {
  const secret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && (!secret || secret.length < 32)) {
    console.error('FATAL: JWT_SECRET must be set and at least 32 characters in production.');
    process.exit(1);
  }

  return {
    secret: secret || 'farmwallet-rice-dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    isProduction,
  };
}

const jwtConfig = getJwtConfig();

module.exports = {
  JWT_SECRET: jwtConfig.secret,
  JWT_EXPIRES_IN: jwtConfig.expiresIn,
  isProduction: jwtConfig.isProduction,
};
