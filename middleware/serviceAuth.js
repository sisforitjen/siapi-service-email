require('dotenv').config();

function serviceAuth(req, res, next) {
  const key = req.headers['x-service-key'];
  if (!key || key !== process.env.SERVICE_KEY) {
    return res.status(401).json({ status: false, errors: ['Unauthorized'] });
  }
  next();
}

module.exports = serviceAuth;
