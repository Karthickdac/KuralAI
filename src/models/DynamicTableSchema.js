/**
 * DynamicTableSchema — one row per organization storing the current dynamic table layout.
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DynamicTableSchema = sequelize.define('DynamicTableSchema', {
  organizationId: { type: DataTypes.UUID, primaryKey: true },
  tableName: { type: DataTypes.STRING(100), defaultValue: 'Imported Table' },
  columns: { type: DataTypes.JSONB, defaultValue: [] },
  phoneColumn: { type: DataTypes.STRING(100), allowNull: true },
  nameColumn: { type: DataTypes.STRING(100), allowNull: true },
}, {
  tableName: 'dynamic_table_schemas',
});

module.exports = DynamicTableSchema;
