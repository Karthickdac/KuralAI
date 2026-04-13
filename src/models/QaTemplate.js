/**
 * QaTemplate Model
 * Stores Q&A pairs: keyword matching rules + response templates.
 * Replaces the hardcoded QA_PAIRS array in aiService.js.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const QaTemplate = sequelize.define('QaTemplate', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  intent: {
    type: DataTypes.STRING(80),
    allowNull: false,
    comment: 'Intent name, e.g. seat_due_status',
  },
  label: {
    type: DataTypes.STRING(120),
    allowNull: false,
    comment: 'Human-readable label shown in dashboard',
  },
  phraseKeywords: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Multi-word phrases — each match adds 3 points',
  },
  tokenKeywords: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Single words — each match adds 1 point',
  },
  minScore: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    comment: 'Minimum score to trigger this intent',
  },
  responses: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of response strings. May contain {{templateVars}}. One is picked at random.',
  },
  action: {
    type: DataTypes.ENUM('continue', 'end_call', 'escalate'),
    defaultValue: 'continue',
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Lower number = checked first',
  },
}, {
  tableName: 'qa_templates',
  indexes: [
    { fields: ['intent'] },
    { fields: ['isActive'] },
    { fields: ['sortOrder'] },
  ],
});

module.exports = QaTemplate;
