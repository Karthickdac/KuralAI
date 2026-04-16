/**
 * Logger - Winston-based structured logging
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

const logsDir = path.join(__dirname, '../../logs');
try {
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
} catch (e) {
  console.warn('Could not create logs directory:', e.message);
}

const { combine, timestamp, printf, colorize, errors } = winston.format;

function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  });
}

const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level.toUpperCase()}]: ${stack || message}`;
  try {
    if (Object.keys(meta).length) log += ` ${safeStringify(meta)}`;
  } catch {}
  return log;
});

const transports = [
  new winston.transports.Console({
    format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), logFormat),
  }),
];

try {
  transports.push(
    new winston.transports.File({
      filename: process.env.LOG_FILE || path.join(logsDir, 'kuralai.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 3,
    })
  );
} catch (e) {
  console.warn('File logging disabled:', e.message);
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'http',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  ),
  transports,
});

logger.http = (msg) => logger.log('http', msg);

module.exports = logger;
