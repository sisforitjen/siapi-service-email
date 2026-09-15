require('dotenv').config();
const nodemailer = require('nodemailer');
const { MailtrapClient } = require('mailtrap');
const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');

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

// Dipakai untuk penerima domain lain (non-kemenag.go.id) langsung,
// dan sebagai fallback kalau SMTP Kemenag gagal untuk penerima @kemenag.go.id.
const mailtrapClient = new MailtrapClient({
  token: process.env.MAILTRAP_API_KEY,
});

function renderTemplate(template, data) {
  if (template === 'raw') {
    if (!data?.html) throw new Error("Template 'raw' membutuhkan data.html");
    return data.html;
  }
  const source = TEMPLATES[template];
  if (!source) throw new Error(`Template '${template}' tidak ditemukan`);
  return handlebars.compile(source)(data || {});
}

function isKemenagRecipient(to) {
  return /@kemenag\.go\.id$/i.test(to || '');
}

async function sendMailKemenag({ to, subject, html }) {
  const info = await transport.sendMail({
    from: `"${process.env.SENDER_NAME}" <${process.env.SENDER_EMAIL}>`,
    to,
    subject,
    html,
  });
  return { provider: 'kemenag', messageId: info.messageId };
}

async function sendMailFallback({ to, subject, html }) {
  const result = await mailtrapClient.send({
    from: {
      name: process.env.SENDER_NAME,
      email: process.env.MAILTRAP_SENDER_EMAIL,
    },
    to: [{ email: to }],
    subject,
    html,
  });
  return { provider: 'mailtrap', messageId: result.message_ids?.[0] };
}

// Domain kemenag.go.id -> SMTP Kemenag (reputasi terjaga sesama domain).
// Domain lain (gmail, yahoo, dll) -> langsung Mailtrap, karena SMTP Kemenag
// sering masuk spam di luar domain kemenag.go.id.
async function sendMail({ to, subject, html }) {
  if (!isKemenagRecipient(to)) {
    return sendMailFallback({ to, subject, html });
  }
  return sendMailKemenag({ to, subject, html });
}

module.exports = { renderTemplate, sendMail, sendMailFallback, isKemenagRecipient, transport };
