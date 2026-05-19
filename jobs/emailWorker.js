require('dotenv').config();
const { Worker } = require('bullmq');
const { createRedisConnection } = require('../config/redis');
const { sendMail } = require('../helpers/mailer');
const db = require('../models');

const worker = new Worker(
  'email-queue',
  async (job) => {
    const { logId, to, subject, html } = job.data;

    const info = await sendMail({ to, subject, html });

    await db.EmailLog.update(
      {
        status: 'sent',
        message_id: info.messageId,
        sent_at: new Date(),
      },
      { where: { id: logId } }
    );

    console.log(`Email terkirim [${logId}]: ${info.messageId} -> ${to}`);
    return { messageId: info.messageId };
  },
  {
    connection: createRedisConnection(),
    concurrency: 3,
  }
);

worker.on('failed', async (job, err) => {
  console.error(`Email gagal [${job.data.logId}] attempt ${job.attemptsMade}: ${err.message}`);

  await db.EmailLog.update(
    {
      status: 'failed',
      error_message: err.message,
      retry_count: job.attemptsMade,
    },
    { where: { id: job.data.logId } }
  );
});

worker.on('error', (err) => {
  console.error('Worker error:', err.message);
});

module.exports = worker;
