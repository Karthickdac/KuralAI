/**
 * ChitAccount Model
 * Stores chit fund account details per customer.
 * One customer can have multiple chit accounts (primary + others).
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ChitAccount = sequelize.define('ChitAccount', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  customerId: {
    type: DataTypes.UUID,
    allowNull: false,
    comment: 'FK → customers.id',
  },
  chitGroup: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Group identifier, e.g. CG-2024-A',
  },
  chitValue: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Total chit value in rupees, e.g. 500000',
  },
  dueAmount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Monthly instalment in rupees, e.g. 18750',
  },
  totalDues: {
    type: DataTypes.INTEGER,
    defaultValue: 40,
    comment: 'Total number of monthly instalments',
  },
  completedDues: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Number of dues already paid',
  },
  nextDueDate: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Human-readable next due date, e.g. "மே 7"',
  },
  withdrawalAmount: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Premature withdrawal amount in rupees',
  },
  chitStatus: {
    type: DataTypes.ENUM('active', 'withdrawn', 'completed'),
    defaultValue: 'active',
  },
  documents: {
    type: DataTypes.JSONB,
    defaultValue: { familyJamin: 2, otherJamin: 2, chequeLeaf: 4 },
    comment: 'Required security documents',
  },
  isPrimary: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'True = this is the chit being called about; False = other chit',
  },
}, {
  tableName: 'chit_accounts',
  indexes: [
    { fields: ['customerId'] },
    { fields: ['chitStatus'] },
  ],
});

module.exports = ChitAccount;
