const path = require('path');
const log = require('logxpert');

log.settings({
  level: process.env.LOG_LEVEL || 'info',
  console: { enableTimestamp: true, timestampFormat: 'YYYY-MM-DD HH:mm:ss' },
  files: {
    folder: path.join(__dirname, '..', 'logs'),
    prefix: 'githook',
    maxFile: '14d',
    maxSize: '20m',
    runNumber: true,
    zippedArchive: true,
  },
});

module.exports = log;
