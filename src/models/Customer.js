/**
 * Customer Model
 * Stores chit fund customers with phone and contact info.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Customer = sequelize.define('Customer', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  organizationId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'organizations', key: 'id' },
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Customer full name (Tamil or English)',
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Mobile number with country code',
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  preferences: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Stored customer preferences captured from call transcripts',
  },
}, {
  tableName: 'customers',
  indexes: [{ fields: ['phone'] }],
});

module.exports = Customer;
