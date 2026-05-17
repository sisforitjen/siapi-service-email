'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('email_logs', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      service_origin: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      to: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      subject: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      template: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      template_data: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('queued', 'sent', 'failed'),
        allowNull: false,
        defaultValue: 'queued',
      },
      job_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      message_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      retry_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      queued_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      sent_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addIndex('email_logs', ['status']);
    await queryInterface.addIndex('email_logs', ['service_origin']);
    await queryInterface.addIndex('email_logs', ['queued_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('email_logs');
  },
};
