/**
 * Seed Script - Create initial admin user
 * Run: node scripts/seed.js
 */

require('dotenv').config();
const { initDatabase } = require('../src/config/database');
const User = require('../src/models/User');
const logger = require('../src/utils/logger');

async function seed() {
  try {
    await initDatabase();

    const [user, created] = await User.findOrCreate({
      where: { email: 'admin@automystic.com' },
      defaults: {
        name: 'KuralAI Admin',
        password: 'ChangeMe@123', // CHANGE IN PRODUCTION
        role: 'admin',
      },
    });

    if (created) {
      logger.info('✅ Admin user created: admin@automystic.com / ChangeMe@123');
      logger.warn('⚠️  CHANGE THE PASSWORD IMMEDIATELY AFTER FIRST LOGIN');
    } else {
      logger.info('Admin user already exists');
    }

    process.exit(0);
  } catch (error) {
    logger.error('Seed failed:', error);
    process.exit(1);
  }
}

seed();
