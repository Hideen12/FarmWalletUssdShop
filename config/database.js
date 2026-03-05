require('dotenv').config();

module.exports = {
  // Primary: FarmWallet (exhibitors, sales, mechanization)
  development: {
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'farmwallet_rice_shops',
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: console.log,
  },
  test: {
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'farmwallet_rice_shops_test',
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false,
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 20000,
      idle: 5000,
    },
  },

  // Secondary: VSL/VSLA external database (read-only or VSLA operations)
  vsl: {
    username: process.env.VSL_DB_USER,
    password: process.env.VSL_DB_PASSWORD,
    database: process.env.VSL_DB_NAME,
    host: process.env.VSL_DB_HOST,
    port: process.env.VSL_DB_PORT || 3306,
    dialect: process.env.VSL_DB_DIALECT || 'mysql',
    logging: process.env.NODE_ENV === 'development' ? false : false,
    pool: { max: 3, min: 0, acquire: 15000, idle: 5000 },
  },
};
