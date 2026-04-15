const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CreditBalance = sequelize.define('CreditBalance', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'organizations', key: 'id' },
    },
    totalMinutes: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    usedMinutes: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    reservedMinutes: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    lastRechargedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'credit_balances',
    timestamps: true,
  });

  CreditBalance.prototype.availableMinutes = function() {
    return Math.max(0, this.totalMinutes - this.usedMinutes - this.reservedMinutes);
  };

  return CreditBalance;
};
