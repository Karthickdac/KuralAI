/**
 * AppSetting model — single-row JSONB store for all application settings.
 * Key is always 'main'. Settings are also mirrored to config/app-settings.json
 * so existing file-reading services continue to work.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AppSetting = sequelize.define('AppSetting', {
  key: {
    type: DataTypes.STRING,
    primaryKey: true,
    defaultValue: 'main',
  },
  data: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
}, {
  tableName: 'app_settings',
  timestamps: true,
});

module.exports = AppSetting;
