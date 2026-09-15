require('dotenv').config();
const { Worker } = require('bullmq');
const { createRedisConnection } = require('../config/redis');
const { sendMail, sendMailFallback } = require('../helpers/mailer');
const db = require('../models');

const worker = new Worker(
  'email-queue',
  async (job) => {
    const { logId, to, subject, html } = job.data;

    const info = await sendMail({ to, subject, html });

    await db.EmailLog.update(
      {
        status: 'sent',
        provider: info.provider,
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

  const isFinalAttempt = job.attemptsMade >= (job.opts.attempts || 1);
  if (!isFinalAttempt) {
    await db.EmailLog.update(
      { status: 'failed', error_message: err.message, retry_count: job.attemptsMade },
      { where: { id: job.data.logId } }
    );
    return;
  }

  // Semua retry SMTP Kemenag habis -> coba fallback ke Mailtrap.
  const { to, subject, html } = job.data;
  try {
    const fallback = await sendMailFallback({ to, subject, html });

    await db.EmailLog.update(
      {
        status: 'sent',
        provider: fallback.provider,
        message_id: fallback.messageId,
        sent_at: new Date(),
        error_message: `SMTP Kemenag gagal setelah ${job.attemptsMade}x percobaan, terkirim via fallback Mailtrap: ${err.message}`,
        retry_count: job.attemptsMade,
      },
      { where: { id: job.data.logId } }
    );

    console.log(`Email terkirim via fallback Mailtrap [${job.data.logId}]: ${fallback.messageId} -> ${to}`);
  } catch (fallbackErr) {
    await db.EmailLog.update(
      {
        status: 'failed',
        error_message: `SMTP Kemenag gagal: ${err.message} | Fallback Mailtrap juga gagal: ${fallbackErr.message}`,
        retry_count: job.attemptsMade,
      },
      { where: { id: job.data.logId } }
    );
  }
});

worker.on('error', (err) => {
  console.error('Worker error:', err.message);
});

module.exports = worker;
