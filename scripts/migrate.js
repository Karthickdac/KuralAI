/**
 * Database Migration Script
 * Run: node scripts/migrate.js
 */

require('dotenv').config();
const { initDatabase } = require('../src/config/database');
const logger = require('../src/utils/logger');

async function migrate() {
  try {
    logger.info('Running database migrations...');
    await initDatabase();
    logger.info('✅ Migrations completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
