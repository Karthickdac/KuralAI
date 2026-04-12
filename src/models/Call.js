/**
 * Call Model - Stores all call records
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Call = sequelize.define('Call', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  callSid: {
    type: DataTypes.STRING(64),
    unique: true,
    allowNull: true, // Populated after Exotel creates the call
    comment: 'Exotel Call SID',
  },
  toPhone: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Destination phone number',
  },
  fromPhone: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: process.env.EXOTEL_PHONE_NUMBER,
  },
  status: {
    type: DataTypes.ENUM(
      'initiated',    // Call created in DB
      'queued',       // Exotel accepted the call
      'ringing',      // Phone is ringing
      'answered',     // User picked up
      'in-progress',  // Conversation happening
      'completed',    // Call ended normally
      'failed',       // Call failed
      'busy',         // User busy
      'no-answer',    // User didn't pick up
      'canceled'      // Call was canceled
    ),
    defaultValue: 'initiated',
  },
  direction: {
    type: DataTypes.ENUM('outbound', 'inbound'),
    defaultValue: 'outbound',
  },
  duration: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Call duration in seconds',
  },
  recordingUrl: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'S3 URL of the call recording',
  },
  recordingSid: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  retryCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  maxRetries: {
    type: DataTypes.INTEGER,
    defaultValue: () => parseInt(process.env.CALL_RETRY_ATTEMPTS) || 3,
  },
  nextRetryAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  escalated: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether this call was escalated to a human agent',
  },
  escalationReason: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional call metadata (customer ID, order ID, etc.)',
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  endedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  consentRecording: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'User consented to recording',
  },
}, {
  tableName: 'calls',
  indexes: [
    { fields: ['callSid'] },
    { fields: ['status'] },
    { fields: ['toPhone'] },
    { fields: ['createdAt'] },
  ],
});

module.exports = Call;
