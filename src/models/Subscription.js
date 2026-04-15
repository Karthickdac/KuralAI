const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Subscription = sequelize.define('Subscription', {
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
    planId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'plans', key: 'id' },
    },
    status: {
      type: DataTypes.ENUM('active', 'past_due', 'cancelled', 'trialing', 'expired'),
      defaultValue: 'active',
    },
    currentPeriodStart: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    currentPeriodEnd: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    razorpaySubscriptionId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    razorpayCustomerId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
  }, {
    tableName: 'subscriptions',
    timestamps: true,
  });

  return Subscription;
};
