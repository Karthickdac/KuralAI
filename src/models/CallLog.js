/**
 * CallLog Model - Detailed event log for each call
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CallLog = sequelize.define('CallLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  callId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'calls', key: 'id' },
    onDelete: 'CASCADE',
  },
  event: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Event type: call_initiated, call_answered, stt_success, tts_generated, intent_detected, etc.',
  },
  level: {
    type: DataTypes.ENUM('info', 'warn', 'error'),
    defaultValue: 'info',
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  data: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional event data',
  },
}, {
  tableName: 'call_logs',
  indexes: [
    { fields: ['callId'] },
    { fields: ['event'] },
    { fields: ['createdAt'] },
  ],
});

module.exports = CallLog;
