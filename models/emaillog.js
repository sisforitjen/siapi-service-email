'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EmailLog extends Model {
    static associate(models) {}
  }

  EmailLog.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      service_origin: DataTypes.STRING(50),
      to: DataTypes.STRING(255),
      subject: DataTypes.STRING(255),
      template: DataTypes.STRING(100),
      template_data: DataTypes.JSONB,
      status: DataTypes.ENUM('queued', 'sent', 'failed'),
      job_id: DataTypes.STRING(100),
      message_id: DataTypes.STRING(255),
      error_message: DataTypes.TEXT,
      retry_count: { type: DataTypes.INTEGER, defaultValue: 0 },
      queued_at: DataTypes.DATE,
      sent_at: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'EmailLog',
      tableName: 'email_logs',
    }
  );

  return EmailLog;
};
