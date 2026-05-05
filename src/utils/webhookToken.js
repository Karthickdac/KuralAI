/**
 * Centralized webhook-token resolver.
 *
 * Replaces the legacy `'kuralai-wh'` literal default that used to be sprinkled
 * across every telephony service. Failing closed (returning '' / null) is the
 * only safe default — a guessable token on a public webhook surface is a
 * privilege-escalation primitive.
 *
 *   - getWebhookToken()      → returns the configured token, or '' if unset.
 *   - requireWebhookToken()  → throws if unset (use in initiateCall paths).
 */
const { getSettingsSync } = require('../services/settingsService');

function getWebhookToken() {
  const s = getSettingsSync();
  return (
    s.webhookToken ||
    s.exotelWebhookToken ||
    process.env.EXOTEL_WEBHOOK_TOKEN ||
    ''
  );
}

function requireWebhookToken(context = 'call') {
  const t = getWebhookToken();
  if (!t) {
    throw new Error(
      `webhook token not configured — set Settings → Telephony → Webhook Token before initiating a ${context}`
    );
  }
  return t;
}

module.exports = { getWebhookToken, requireWebhookToken };
