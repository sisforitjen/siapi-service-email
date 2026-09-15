'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('email_logs', 'provider', {
      type: Sequelize.ENUM('kemenag', 'mailtrap'),
      allowNull: false,
      defaultValue: 'kemenag',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('email_logs', 'provider');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_email_logs_provider";');
  },
};
