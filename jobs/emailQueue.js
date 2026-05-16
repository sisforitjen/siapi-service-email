require('dotenv').config();
const { Queue } = require('bullmq');
const { createRedisConnection } = require('../config/redis');

const emailQueue = new Queue('email-queue', {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5 * 60 * 1000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 },
  },
});

module.exports = emailQueue;
