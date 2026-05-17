'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('email_logs', 'app_name', {
      type: Sequelize.STRING(100),
      allowNull: true,
      after: 'service_origin',
    });

    await queryInterface.addIndex('email_logs', ['app_name']);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('email_logs', ['app_name']);
    await queryInterface.removeColumn('email_logs', 'app_name');
  },
};
