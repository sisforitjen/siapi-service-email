const { validationResult, body } = require('express-validator');
const db = require('../models');
const emailQueue = require('../jobs/emailQueue');

const ALLOWED_TEMPLATES = ['otp-verification', 'password-changed', 'raw'];

const validateSend = [
  body('to').isEmail().withMessage('to harus berupa email yang valid'),
  body('subject').notEmpty().withMessage('subject wajib diisi'),
  body('template').notEmpty().withMessage('template wajib diisi'),
];

module.exports = {
  validateSend,

  async send(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: false, errors: errors.array().map(e => e.msg) });
    }

    const { to, subject, template, data } = req.body;

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
    const queuedAt = new Date();

    const log = await db.EmailLog.create({
      service_origin: serviceOrigin,
      to,
      subject,
      template,
      template_data: data || null,
      status: 'queued',
      queued_at: queuedAt,
    });

    const job = await emailQueue.add(
      'send-email',
      { logId: log.id, to, subject, template, data: data || {} },
      { jobId: log.id }
    );

    await db.EmailLog.update({ job_id: job.id }, { where: { id: log.id } });

    return res.json({
      status: true,
      job_id: log.id,
      message: 'Email queued successfully',
    });
  },

  async getLogs(req, res) {
    const { status, service_origin, date_from, date_to, page = 1, limit = 20 } = req.query;
    const { Op } = require('sequelize');

    const where = {};
    if (status) where.status = status;
    if (service_origin) where.service_origin = service_origin;
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
