/**
 * Webhook Validation Middleware
 *
 * Supports both Exotel (shared-secret token) and Twilio (HMAC-SHA1 or shared token).
 * Security: shared-secret ?wt=<token> in webhook URL query string.
 */

const logger = require('../utils/logger');

function validateExotelWebhook(req, res, next) {
  if (process.env.NODE_ENV === 'test' || process.env.SKIP_EXOTEL_VALIDATION === 'true') {
    return next();
  }

  // Lazy-load so telephonyService picks up current settings at runtime
  const telephonyService = require('../services/telephonyService');
  if (!telephonyService.validateWebhookToken(req)) {
    logger.warn(`Invalid webhook token from ${req.ip} on ${req.originalUrl}`);
    return res.status(403).json({ error: 'Forbidden — invalid webhook token' });
  }

  next();
}

// ── Rate Limiter ───────────────────────────────────────────────────────────────

const _counts = new Map();

function webhookRateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 1000;
  const maxRequests = 30;

  const entry = _counts.get(ip) || { count: 0, windowStart: now };

  if (now - entry.windowStart > windowMs) {
    entry.count = 1;
    entry.windowStart = now;
  } else {
    entry.count++;
  }

  _counts.set(ip, entry);

  if (Math.random() < 0.001) {
    for (const [k, v] of _counts) {
      if (now - v.windowStart > 60000) _counts.delete(k);
    }
  }

  if (entry.count > maxRequests) {
    logger.warn(`Webhook rate limit exceeded for ${ip}`);
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  next();
}

module.exports = { validateExotelWebhook, webhookRateLimit };
