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

function sanitizeError(err) {
  if (!err || typeof err !== 'object') return err;
  const clean = {
    message: err.message,
    name: err.name,
    code: err.code,
    status: err.status || err.statusCode,
  };
  if (err.stack) clean.stack = err.stack;
  if (err.isAxiosError) {
    clean.isAxiosError = true;
    if (err.response) {
      clean.responseStatus = err.response.status;
      clean.responseStatusText = err.response.statusText;
    }
  }
  return clean;
}

const sanitizeFormat = winston.format((info) => {
  try {
    const dangerous = ['req', 'res', 'socket', 'client', 'connection',
      'agent', '_httpMessage', 'config', 'request', 'response',
      '_currentRequest', '_redirectable', '_writableState', '_readableState'];
    for (const key of dangerous) {
      if (info[key]) delete info[key];
    }

    if (info.splat && Array.isArray(info.splat)) {
      info.splat = info.splat.map(arg => {
        if (arg instanceof Error || (arg && arg.isAxiosError)) return sanitizeError(arg);
        return arg;
      });
    }
  } catch {}
  return info;
});

function safeStringify(obj) {
  try {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (value.constructor && /^(ClientRequest|IncomingMessage|Socket|TLSSocket|Agent)$/.test(value.constructor.name)) {
          return `[${value.constructor.name}]`;
        }
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      if (typeof value === 'function') return undefined;
      if (value instanceof Buffer) return `[Buffer ${value.length} bytes]`;
      return value;
    });
  } catch {
    return '[unserializable]';
  }
}

const logFormat = printf((info) => {
  try {
    const { level, message, timestamp: ts, stack, ...meta } = info;
    let log = `${ts} [${level.toUpperCase()}]: ${stack || message}`;
    try {
      const keys = Object.keys(meta);
      if (keys.length) log += ` ${safeStringify(meta)}`;
    } catch {}
    return log;
  } catch (e) {
    return `[LOG_FORMAT_ERROR] ${e.message}`;
  }
});

const transports = [
  new winston.transports.Console({
    format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), sanitizeFormat(), logFormat),
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
    sanitizeFormat(),
    logFormat
  ),
  transports,
});

logger.http = (msg) => logger.log('http', msg);

module.exports = logger;
