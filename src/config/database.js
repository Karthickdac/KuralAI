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

  // Register all models (order matters for FK sync)
  require('../models/Call');
  require('../models/Transcript');
  require('../models/CallLog');
  require('../models/User');
  require('../models/Customer');
  require('../models/ChitAccount');

  // Sync schema (create tables if they don't exist)
  await sequelize.sync({ force: false });

  // Seed sample customers if table is empty
  await seedCustomers();
}

async function seedCustomers() {
  const Customer = require('../models/Customer');
  const ChitAccount = require('../models/ChitAccount');
  const count = await Customer.count();
  if (count > 0) return; // Already seeded

  const { toIndianFormat } = require('../utils/templateEngine');

  const customers = [
    {
      name: 'ரமேஷ் குமார்',
      phone: '+919876543210',
      address: 'அண்ணா நகர், சென்னை',
      notes: 'Regular customer. Punctual with payments.',
      chits: [
        {
          chitGroup: 'CG-2024-A',
          chitValue: 500000,
          dueAmount: 18750,
          totalDues: 40,
          completedDues: 2,
          nextDueDate: 'மே 7',
          withdrawalAmount: 355000,
          isPrimary: true,
          documents: { familyJamin: 2, otherJamin: 2, chequeLeaf: 4 },
        },
        {
          chitGroup: 'CG-2023-D',
          chitValue: 500000,
          dueAmount: 18750,
          totalDues: 40,
          completedDues: 5,
          nextDueDate: 'மே 10',
          withdrawalAmount: 342000,
          isPrimary: false,
          documents: { familyJamin: 2, otherJamin: 2, chequeLeaf: 4 },
        },
      ],
    },
    {
      name: 'சுரேஷ் பாபு',
      phone: '+919876543211',
      address: 'T நகர், சென்னை',
      notes: 'Has two active chit accounts.',
      chits: [
        {
          chitGroup: 'CG-2024-B',
          chitValue: 300000,
          dueAmount: 11250,
          totalDues: 40,
          completedDues: 4,
          nextDueDate: 'மே 12',
          withdrawalAmount: 210000,
          isPrimary: true,
          documents: { familyJamin: 2, otherJamin: 2, chequeLeaf: 4 },
        },
        {
          chitGroup: 'CG-2023-F',
          chitValue: 300000,
          dueAmount: 11250,
          totalDues: 40,
          completedDues: 8,
          nextDueDate: 'மே 15',
          withdrawalAmount: 185000,
          isPrimary: false,
          documents: { familyJamin: 2, otherJamin: 2, chequeLeaf: 4 },
        },
      ],
    },
    {
      name: 'பிரியா ஆனந்த்',
      phone: '+919876543212',
      address: 'அடையாறு, சென்னை',
      notes: 'High-value customer with 10L chit.',
      chits: [
        {
          chitGroup: 'CG-2024-C',
          chitValue: 1000000,
          dueAmount: 37500,
          totalDues: 40,
          completedDues: 1,
          nextDueDate: 'மே 5',
          withdrawalAmount: 720000,
          isPrimary: true,
          documents: { familyJamin: 2, otherJamin: 3, chequeLeaf: 4 },
        },
        {
          chitGroup: 'CG-2023-G',
          chitValue: 500000,
          dueAmount: 18750,
          totalDues: 40,
          completedDues: 11,
          nextDueDate: 'மே 5',
          withdrawalAmount: 290000,
          isPrimary: false,
          documents: { familyJamin: 2, otherJamin: 2, chequeLeaf: 4 },
        },
      ],
    },
  ];

  for (const c of customers) {
    const { chits, ...customerData } = c;
    const customer = await Customer.create(customerData);
    for (const chit of chits) {
      await ChitAccount.create({ ...chit, customerId: customer.id });
    }
  }
  logger.info('✅ Sample customers seeded (3 customers, 6 chit accounts)');
}

module.exports = { sequelize, initDatabase };
