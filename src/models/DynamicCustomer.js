/**
 * DynamicCustomer Model
 * Stores rows imported from a CSV/XLSX. Schema is dynamic — full row in JSONB.
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DynamicCustomer = sequelize.define('DynamicCustomer', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  organizationId: { type: DataTypes.UUID, allowNull: true },
  phone: { type: DataTypes.STRING(20), allowNull: true },
  name: { type: DataTypes.STRING(200), allowNull: true },
  data: { type: DataTypes.JSONB, defaultValue: {} },
}, {
  tableName: 'dynamic_customers',
  indexes: [{ fields: ['organizationId'] }, { fields: ['phone'] }],
});

module.exports = DynamicCustomer;
