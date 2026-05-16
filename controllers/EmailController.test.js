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

const app = require('../app');

const VALID_KEY = 'test-secret-key';

beforeAll(() => {
  process.env.SERVICE_KEY = VALID_KEY;
});

describe('POST /api/email/send', () => {
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
    expect(res.body.job_id).toBeDefined();
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
      .send({
        to: 'user@kemenag.go.id',
        subject: 'Test',
        template: 'template-tidak-ada',
        data: {},
      });

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
        data: { html: '<h1>Halo!</h1><p>Ini email raw HTML.</p>' },
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(true);
    expect(res.body.job_id).toBeDefined();
  });

  it('returns 400 when template raw without data.html', async () => {
    const res = await request(app)
      .post('/api/email/send')
      .set('x-service-key', VALID_KEY)
      .send({
        to: 'user@kemenag.go.id',
        subject: 'Test Raw HTML',
        template: 'raw',
        data: {},
      });

    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatch(/data\.html/);
  });
});
