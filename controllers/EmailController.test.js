const request = require('supertest');

jest.mock('../jobs/emailQueue', () => ({
  add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
}));

jest.mock('../models', () => ({
  EmailLog: {
    create: jest.fn().mockResolvedValue({ id: 'mock-log-id' }),
    update: jest.fn().mockResolvedValue([1]),
    findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
    findOne: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../helpers/mailer', () => ({
  renderTemplate: jest.fn().mockReturnValue('<h1>HTML</h1>'),
  sendMail: jest.fn().mockResolvedValue({ messageId: 'mock-message-id@smtp' }),
}));

const app = require('../app');
const { sendMail } = require('../helpers/mailer');

const VALID_KEY = 'test-secret-key';

beforeAll(() => {
  process.env.SERVICE_KEY = VALID_KEY;
});

beforeEach(() => {
  jest.clearAllMocks();
  const { EmailLog } = require('../models');
  EmailLog.create.mockResolvedValue({ id: 'mock-log-id' });
  EmailLog.update.mockResolvedValue([1]);
});

describe('POST /api/email/send — mode queue (default)', () => {
  it('returns 200 and job_id when request valid', async () => {
    const res = await request(app)
      .post('/api/email/send')
      .set('x-service-key', VALID_KEY)
      .send({
        to: 'user@kemenag.go.id',
        subject: 'Test Subject',
        template: 'otp-verification',
        data: { user: { fullname: 'Budi' }, kode_verif: '123456' },
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(true);
    expect(res.body.mode).toBe('queue');
    expect(res.body.job_id).toBeDefined();
  });

  it('menyimpan app_name dari header x-app-name', async () => {
    const { EmailLog } = require('../models');
    const res = await request(app)
      .post('/api/email/send')
      .set('x-service-key', VALID_KEY)
      .set('x-app-name', 'SIAPI')
      .send({
        to: 'user@kemenag.go.id',
        subject: 'Test',
        template: 'otp-verification',
        data: {},
      });

    expect(res.status).toBe(200);
    expect(EmailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ app_name: 'SIAPI' })
    );
  });

  it('menyimpan app_name dari body jika header tidak ada', async () => {
    const { EmailLog } = require('../models');
    const res = await request(app)
      .post('/api/email/send')
      .set('x-service-key', VALID_KEY)
      .send({
        to: 'user@kemenag.go.id',
        subject: 'Test',
        template: 'otp-verification',
        app_name: 'DUMAS',
        data: {},
      });

    expect(res.status).toBe(200);
    expect(EmailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ app_name: 'DUMAS' })
    );
  });

  it('returns 401 without service key', async () => {
    const res = await request(app)
      .post('/api/email/send')
      .send({ to: 'user@kemenag.go.id', subject: 'Test', template: 'otp-verification' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields missing', async () => {
    const res = await request(app)
      .post('/api/email/send')
      .set('x-service-key', VALID_KEY)
      .send({ to: 'user@kemenag.go.id' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('returns 400 when template unknown', async () => {
    const res = await request(app)
      .post('/api/email/send')
      .set('x-service-key', VALID_KEY)
      .send({ to: 'user@kemenag.go.id', subject: 'Test', template: 'tidak-ada', data: {} });

    expect(res.status).toBe(400);
  });

  it('returns 200 when template raw with valid data.html', async () => {
    const res = await request(app)
      .post('/api/email/send')
      .set('x-service-key', VALID_KEY)
      .send({
        to: 'user@kemenag.go.id',
        subject: 'Test Raw HTML',
        template: 'raw',
        data: { html: '<h1>Halo!</h1>' },
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(true);
  });

  it('returns 400 when template raw without data.html', async () => {
    const res = await request(app)
      .post('/api/email/send')
      .set('x-service-key', VALID_KEY)
      .send({ to: 'user@kemenag.go.id', subject: 'Test', template: 'raw', data: {} });

    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatch(/data\.html/);
  });
});

describe('POST /api/email/send — mode direct', () => {
  it('returns 200 dengan message_id jika SMTP berhasil', async () => {
    const res = await request(app)
      .post('/api/email/send')
      .set('x-service-key', VALID_KEY)
      .send({
        to: 'user@kemenag.go.id',
        subject: 'Test Direct',
        template: 'otp-verification',
        mode: 'direct',
        data: { user: { fullname: 'Budi' }, kode_verif: '111222' },
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(true);
    expect(res.body.mode).toBe('direct');
    expect(res.body.message_id).toBe('mock-message-id@smtp');
    expect(res.body.log_id).toBeDefined();
  });

  it('returns 500 dengan error_message jika SMTP gagal', async () => {
    sendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));

    const res = await request(app)
      .post('/api/email/send')
      .set('x-service-key', VALID_KEY)
      .send({
        to: 'user@kemenag.go.id',
        subject: 'Test Direct Gagal',
        template: 'otp-verification',
        mode: 'direct',
        data: {},
      });

    expect(res.status).toBe(500);
    expect(res.body.status).toBe(false);
    expect(res.body.mode).toBe('direct');
    expect(res.body.error_message).toBe('SMTP connection refused');
    expect(res.body.log_id).toBeDefined();
  });

  it('returns 400 jika mode tidak valid', async () => {
    const res = await request(app)
      .post('/api/email/send')
      .set('x-service-key', VALID_KEY)
      .send({
        to: 'user@kemenag.go.id',
        subject: 'Test',
        template: 'otp-verification',
        mode: 'invalid-mode',
      });

    expect(res.status).toBe(400);
  });
});
