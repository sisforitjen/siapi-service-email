require('dotenv').config();
const IORedis = require('ioredis');

function createRedisConnection() {
  return new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  });
}

module.exports = { createRedisConnection };
