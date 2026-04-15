const { DataTypes } = require('sequelize');

const AVAILABLE_MODULES = [
  'campaigns',
  'crm_integration',
  'api_config',
  'reports',
  'simulator',
  'templates',
  'call_recording',
  'bulk_import',
];

module.exports = (sequelize) => {
  const ModuleAccess = sequelize.define('ModuleAccess', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'organizations', key: 'id' },
    },
    moduleName: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    isEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  }, {
    tableName: 'module_access',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['organizationId', 'moduleName'] },
    ],
  });

  ModuleAccess.AVAILABLE_MODULES = AVAILABLE_MODULES;

  return ModuleAccess;
};
