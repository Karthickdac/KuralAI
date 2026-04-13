const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Campaign = sequelize.define('Campaign', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM('due_reminder', 'lottery_participation', 'payment_followup', 'custom'),
    defaultValue: 'due_reminder',
  },
  status: {
    type: DataTypes.ENUM('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled'),
    defaultValue: 'draft',
  },
  scheduledAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  customerIds: {
    type: DataTypes.JSONB,
    defaultValue: [],
  },
  callIds: {
    type: DataTypes.JSONB,
    defaultValue: [],
  },
  concurrency: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    validate: { min: 1, max: 10 },
  },
  totalCalls: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  completedCalls: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  answeredCalls: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  failedCalls: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
  workflowId: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  recordCalls: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  callbackUrl: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'External system URL to push call recordings and results',
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'campaigns',
  indexes: [
    { fields: ['status'] },
    { fields: ['createdAt'] },
    { fields: ['scheduledAt'] },
  ],
});

module.exports = Campaign;
