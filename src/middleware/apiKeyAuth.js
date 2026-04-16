/**
 * API Key Authentication Middleware
 *
 * Accepts the key via:
 *   - Header:  X-API-Key: <key>
 *   - Query:   ?apiKey=<key>
 *
 * The key is stored in app settings under the 'apiKey' field.
 * Falls back to the KURAL_API_KEY environment variable.
 */

const logger = require('../utils/logger');
const { getSettingsSync } = require('../services/settingsService');

function getStoredApiKey() {
  const s = getSettingsSync();
  return s.apiKey || process.env.KURAL_API_KEY || '';
}

/**
 * Middleware: require a valid API key.
 * Adds req.apiKeyAuth = true so downstream can distinguish.
 */
function requireApiKey(req, res, next) {
  const provided =
    req.headers['x-api-key'] ||
    req.query.apiKey ||
    req.query.api_key;

  if (!provided) {
    return res.status(401).json({ error: 'API key required. Pass X-API-Key header or ?apiKey= query param.' });
  }

  const stored = getStoredApiKey();
  if (!stored) {
    return res.status(503).json({ error: 'API access not configured. Generate an API key in Settings.' });
  }

  if (provided !== stored) {
    logger.warn(`Invalid API key attempt from ${req.ip}`);
    return res.status(403).json({ error: 'Invalid API key.' });
  }

  req.apiKeyAuth = true;
  req.user = { role: 'api', email: 'api-client' };
  next();
}

/**
 * Middleware: accept EITHER a valid JWT OR a valid API key.
 * Used on customer routes that need to work from both the dashboard and external systems.
 */
function authenticateTokenOrApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey || req.query.api_key;

  if (apiKey) {
    return requireApiKey(req, res, next);
  }

  // Fall through to JWT check
  const { authenticateToken } = require('./auth');
  return authenticateToken(req, res, next);
}

module.exports = { requireApiKey, authenticateTokenOrApiKey };
