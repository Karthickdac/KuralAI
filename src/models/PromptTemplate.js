/**
 * PromptTemplate Model
 * Stores system-level prompt strings (greeting, fallback, escalation, etc.)
 * that may contain {{templateVars}} resolved at call time.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PromptTemplate = sequelize.define('PromptTemplate', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  key: {
    type: DataTypes.STRING(80),
    allowNull: false,
    unique: true,
    comment: 'Unique key, e.g. GREETING, FALLBACK_LOW_CONFIDENCE',
  },
  label: {
    type: DataTypes.STRING(120),
    allowNull: false,
    comment: 'Human-readable label shown in dashboard',
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Template text. May contain {{customerName}}, {{dueAmount}}, etc.',
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Notes on when this prompt is used',
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'prompt_templates',
  indexes: [{ fields: ['key'] }],
});

module.exports = PromptTemplate;
