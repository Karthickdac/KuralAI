const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CreditTransaction = sequelize.define('CreditTransaction', {
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
    type: {
      type: DataTypes.ENUM('recharge', 'usage', 'plan_credit', 'adjustment', 'refund'),
      allowNull: false,
    },
    minutes: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    balanceAfter: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    amount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    callId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    razorpayPaymentId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
  }, {
    tableName: 'credit_transactions',
    timestamps: true,
  });

  return CreditTransaction;
};
