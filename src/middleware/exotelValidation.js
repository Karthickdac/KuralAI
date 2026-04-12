/**
 * Exotel Webhook Validation Middleware
 *
 * Security approach:
 *  1. Shared-secret token in the webhook URL query (?wt=<token>) — checked here.
 *  2. In production, also whitelist Exotel IP ranges in your hosting firewall.
 *     Exotel IP ranges: https://developer.exotel.com/api/#ip-whitelist
 *
 * Set EXOTEL_WEBHOOK_TOKEN to a long random secret in your env vars.
 */

const { validateWebhookToken } = require('../services/exotelService');
const logger = require('../utils/logger');

function validateExotelWebhook(req, res, next) {
  if (process.env.NODE_ENV === 'test' || process.env.SKIP_EXOTEL_VALIDATION === 'true') {
    return next();
  }

  if (!validateWebhookToken(req)) {
    logger.warn(`Invalid Exotel webhook token from ${req.ip} on ${req.originalUrl}`);
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

  // Periodic cleanup
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
