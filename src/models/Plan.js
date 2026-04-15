const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Plan = sequelize.define('Plan', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    price: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    billingCycle: {
      type: DataTypes.ENUM('monthly', 'quarterly', 'yearly'),
      defaultValue: 'monthly',
    },
    creditMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    maxWorkflows: {
      type: DataTypes.INTEGER,
      defaultValue: 3,
    },
    maxCustomers: {
      type: DataTypes.INTEGER,
      defaultValue: 100,
    },
    maxCampaigns: {
      type: DataTypes.INTEGER,
      defaultValue: 5,
    },
    maxUsersPerOrg: {
      type: DataTypes.INTEGER,
      defaultValue: 3,
    },
    maxClonedVoices: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    maxParallelCalls: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
    maxAssistants: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
    maxKnowledgebases: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    maxPhoneNumbers: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
    extraMinuteRate: {
      type: DataTypes.FLOAT,
      defaultValue: 15,
    },
    recommended: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    features: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  }, {
    tableName: 'plans',
    timestamps: true,
  });

  return Plan;
};
