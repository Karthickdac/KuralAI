/**
 * Twilio Webhook Signature Validation Middleware
 * Verifies every webhook request genuinely came from Twilio.
 * Without this, anyone who discovers your webhook URL can fake calls.
 *
 * Docs: https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */

const twilio = require('twilio');
const logger = require('../utils/logger');

/**
 * Middleware to validate Twilio webhook signatures.
 * Must be applied BEFORE body parsing for the raw body to be available.
 *
 * Usage: router.use(validateTwilioSignature)
 */
function validateTwilioSignature(req, res, next) {
  // Skip validation in test/development if explicitly disabled
  if (process.env.NODE_ENV === 'test' || process.env.SKIP_TWILIO_VALIDATION === 'true') {
    return next();
  }

  const twilioSignature = req.headers['x-twilio-signature'];

  if (!twilioSignature) {
    logger.warn(`Webhook request missing Twilio signature from ${req.ip}`);
    return res.status(403).json({ error: 'Missing Twilio signature' });
  }

  // Build the full URL Twilio signed (must match exactly)
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const fullUrl = `${protocol}://${host}${req.originalUrl}`;

  // Parse body params — Twilio sends application/x-www-form-urlencoded
  let params = {};
  if (req.body) {
    if (Buffer.isBuffer(req.body)) {
      // Raw buffer — parse manually
      const bodyStr = req.body.toString('utf8');
      params = Object.fromEntries(new URLSearchParams(bodyStr));
    } else if (typeof req.body === 'object') {
      params = req.body;
    }
  }

  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    twilioSignature,
    fullUrl,
    params
  );

  if (!isValid) {
    logger.warn(`Invalid Twilio signature for ${fullUrl} from ${req.ip}`);
    return res.status(403).json({ error: 'Invalid Twilio signature' });
  }

  // Signature valid — parse params onto req.body for downstream handlers
  if (Buffer.isBuffer(req.body)) {
    req.body = params;
  }

  next();
}

/**
 * Rate limiter specifically for webhook endpoints.
 * Twilio sends at most a few requests per second per active call.
 * Anything higher is suspicious.
 */
const webhookRequestCounts = new Map();

function webhookRateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 1000; // 1 second window
  const maxRequests = 20; // max 20 webhook hits/sec per IP

  const entry = webhookRequestCounts.get(ip) || { count: 0, windowStart: now };

  if (now - entry.windowStart > windowMs) {
    entry.count = 1;
    entry.windowStart = now;
  } else {
    entry.count++;
  }

  webhookRequestCounts.set(ip, entry);

  // Cleanup old entries every 5 minutes
  if (Math.random() < 0.001) {
    for (const [key, val] of webhookRequestCounts) {
      if (now - val.windowStart > 60000) webhookRequestCounts.delete(key);
    }
  }

  if (entry.count > maxRequests) {
    logger.warn(`Webhook rate limit exceeded for ${ip}`);
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  next();
}

module.exports = { validateTwilioSignature, webhookRateLimit };
