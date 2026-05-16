require('dotenv').config();
const { Worker } = require('bullmq');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');
const { createRedisConnection } = require('../config/redis');
const db = require('../models');

const TEMPLATES = {
  'otp-verification': fs.readFileSync(
    path.join(__dirname, '../views/otp-verification.hbs'),
    'utf8'
  ),
  'password-changed': fs.readFileSync(
    path.join(__dirname, '../views/password-changed.hbs'),
    'utf8'
  ),
};

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: parseInt(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

transport.verify((error) => {
  if (error) {
    console.error('SMTP connection error:', error.message);
  } else {
    console.log('SMTP server siap mengirim email');
  }
});

const worker = new Worker(
  'email-queue',
  async (job) => {
    const { logId, to, subject, template, data } = job.data;

    const templateSource = TEMPLATES[template];
    if (!templateSource) {
      throw new Error(`Template '${template}' tidak ditemukan`);
    }

    const compiled = handlebars.compile(templateSource);
    const html = compiled(data || {});

    const mailData = {
      from: `"${process.env.SENDER_NAME}" <${process.env.SENDER_EMAIL}>`,
      to,
      subject,
      html,
    };

    const info = await transport.sendMail(mailData);

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
