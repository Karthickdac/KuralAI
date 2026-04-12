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
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'kuralai',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
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

  // Sync schema (use migrations in production)
  await sequelize.sync({ alter: !isTest && process.env.NODE_ENV !== 'production' });
}

module.exports = { sequelize, initDatabase };
