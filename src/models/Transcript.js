/**
 * Transcript Model - Stores conversation transcripts turn by turn
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Transcript = sequelize.define('Transcript', {
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
  turnNumber: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Sequential turn number in conversation',
  },
  speaker: {
    type: DataTypes.ENUM('ai', 'user'),
    allowNull: false,
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'The spoken/transcribed text in Tamil',
  },
  originalText: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Raw Whisper output before any cleanup',
  },
  intent: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Detected intent for user turns',
  },
  confidence: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Intent detection confidence (0.0 - 1.0)',
  },
  audioUrl: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'S3 URL of TTS audio for AI turns',
  },
  processingTimeMs: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Time taken to process this turn in milliseconds',
  },
}, {
  tableName: 'transcripts',
  indexes: [
    { fields: ['callId'] },
    { fields: ['intent'] },
  ],
});

module.exports = Transcript;
