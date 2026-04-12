/**
 * Database Configuration
 * Uses PostgreSQL in production/development, SQLite in-memory for tests.
 */

const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

// Use SQLite for tests — no real database needed
const isTest = process.env.DB_DIALECT === 'sqlite' || process.env.NODE_ENV === 'test';

const sequelize = isTest
  ? new Sequelize({
      dialect: 'sqlite',
      storage: process.env.DB_STORAGE || ':memory:',
      logging: false,
    })
  : new Sequelize({
      dialect: 'postgres',
      host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
      port: parseInt(process.env.DB_PORT || process.env.PGPORT) || 5432,
      database: process.env.DB_NAME || process.env.PGDATABASE || 'kuralai',
      username: process.env.DB_USER || process.env.PGUSER || 'postgres',
      password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
      logging: (msg) => logger.debug(msg),
      pool: { max: 10, min: 2, acquire: 30000, idle: 10000 },
      dialectOptions: process.env.DB_SSL === 'true' ? {
        ssl: { require: true, rejectUnauthorized: false },
      } : {},
    });

async function initDatabase() {
  await sequelize.authenticate();

  // Register all models
  require('../models/Call');
  require('../models/Transcript');
  require('../models/CallLog');
  require('../models/User');

  // Sync schema (create tables if they don't exist)
  await sequelize.sync({ force: false });
}

module.exports = { sequelize, initDatabase };
