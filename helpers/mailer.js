require('dotenv').config();
const nodemailer = require('nodemailer');
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

function renderTemplate(template, data) {
  if (template === 'raw') {
    if (!data?.html) throw new Error("Template 'raw' membutuhkan data.html");
    return data.html;
  }
  const source = TEMPLATES[template];
  if (!source) throw new Error(`Template '${template}' tidak ditemukan`);
  return handlebars.compile(source)(data || {});
}

async function sendMail({ to, subject, html }) {
  return transport.sendMail({
    from: `"${process.env.SENDER_NAME}" <${process.env.SENDER_EMAIL}>`,
    to,
    subject,
    html,
  });
}

module.exports = { renderTemplate, sendMail, transport };
