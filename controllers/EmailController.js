const { validationResult, body } = require('express-validator');
const db = require('../models');
const emailQueue = require('../jobs/emailQueue');
const { renderTemplate, sendMail } = require('../helpers/mailer');

const ALLOWED_TEMPLATES = ['otp-verification', 'password-changed', 'raw'];

const validateSend = [
  body('to').isEmail().withMessage('to harus berupa email yang valid'),
  body('subject').notEmpty().withMessage('subject wajib diisi'),
  body('template').notEmpty().withMessage('template wajib diisi'),
  body('mode').optional().isIn(['queue', 'direct']).withMessage("mode harus 'queue' atau 'direct'"),
];

module.exports = {
  validateSend,

  async send(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: false, errors: errors.array().map(e => e.msg) });
    }

    const { to, subject, template, data, mode = 'queue' } = req.body;

    if (!ALLOWED_TEMPLATES.includes(template)) {
      return res.status(400).json({
        status: false,
        errors: [`Template '${template}' tidak dikenali. Template tersedia: ${ALLOWED_TEMPLATES.join(', ')}`],
      });
    }

    if (template === 'raw' && !data?.html) {
      return res.status(400).json({
        status: false,
        errors: ["Template 'raw' membutuhkan field data.html berisi konten HTML"],
      });
    }

    const serviceOrigin = req.headers['x-service-origin'] || 'unknown';
    const appName = req.headers['x-app-name'] || req.body.app_name || null;
    const now = new Date();

    // ── MODE DIRECT ─────────────────────────────────────────────────────────
    if (mode === 'direct') {
      let html;
      try {
        html = renderTemplate(template, data || {});
      } catch (err) {
        return res.status(400).json({ status: false, errors: [err.message] });
      }

      const log = await db.EmailLog.create({
        service_origin: serviceOrigin,
        app_name: appName,
        to,
        subject,
        template,
        template_data: data || null,
        html_body: html,
        status: 'queued',
        queued_at: now,
      });

      try {
        const info = await sendMail({ to, subject, html });

        await db.EmailLog.update(
          { status: 'sent', message_id: info.messageId, sent_at: new Date() },
          { where: { id: log.id } }
        );

        return res.json({
          status: true,
          mode: 'direct',
          message_id: info.messageId,
          log_id: log.id,
          message: 'Email berhasil dikirim',
        });
      } catch (err) {
        await db.EmailLog.update(
          { status: 'failed', error_message: err.message, retry_count: 1 },
          { where: { id: log.id } }
        );

        return res.status(500).json({
          status: false,
          mode: 'direct',
          log_id: log.id,
          error_message: err.message,
          message: 'Email gagal dikirim',
        });
      }
    }

    // ── MODE QUEUE (default) ─────────────────────────────────────────────────
    let html;
    try {
      html = renderTemplate(template, data || {});
    } catch (err) {
      return res.status(400).json({ status: false, errors: [err.message] });
    }

    const log = await db.EmailLog.create({
      service_origin: serviceOrigin,
      app_name: appName,
      to,
      subject,
      template,
      template_data: data || null,
      html_body: html,
      status: 'queued',
      queued_at: now,
    });

    const job = await emailQueue.add(
      'send-email',
      { logId: log.id, to, subject, html },
      { jobId: `email-${log.id}` }
    );

    await db.EmailLog.update({ job_id: job.id }, { where: { id: log.id } });

    return res.json({
      status: true,
      mode: 'queue',
      job_id: log.id,
      message: 'Email queued successfully',
    });
  },

  async getLogs(req, res) {
    const { status, service_origin, app_name, date_from, date_to, page = 1, limit = 20 } = req.query;
    const { Op } = require('sequelize');

    const where = {};
    if (status) where.status = status;
    if (service_origin) where.service_origin = service_origin;
    if (app_name) where.app_name = app_name;
    if (date_from || date_to) {
      where.queued_at = {};
      if (date_from) where.queued_at[Op.gte] = new Date(date_from);
      if (date_to) where.queued_at[Op.lte] = new Date(date_to + 'T23:59:59');
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows, count } = await db.EmailLog.findAndCountAll({
      where,
      order: [['queued_at', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    return res.json({
      status: true,
      data: rows,
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  },

  async getLogById(req, res) {
    const log = await db.EmailLog.findOne({ where: { id: req.params.id } });
    if (!log) {
      return res.status(404).json({ status: false, errors: ['Log tidak ditemukan'] });
    }
    return res.json({ status: true, data: log });
  },
};
