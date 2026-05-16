const serviceAuth = require('./serviceAuth');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('serviceAuth middleware', () => {
  const originalKey = process.env.SERVICE_KEY;

  beforeAll(() => {
    process.env.SERVICE_KEY = 'test-secret-key';
  });

  afterAll(() => {
    process.env.SERVICE_KEY = originalKey;
  });

  it('calls next() when X-Service-Key is valid', () => {
    const req = { headers: { 'x-service-key': 'test-secret-key' } };
    const res = mockRes();
    const next = jest.fn();

    serviceAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when X-Service-Key is missing', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    serviceAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ status: false, errors: ['Unauthorized'] });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when X-Service-Key is wrong', () => {
    const req = { headers: { 'x-service-key': 'wrong-key' } };
    const res = mockRes();
    const next = jest.fn();

    serviceAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
