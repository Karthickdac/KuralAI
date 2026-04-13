/**
 * Telephony Service — provider-agnostic facade
 * Routes to Exotel or Twilio based on the 'telephonyProvider' setting.
 * All call code should import from here, not from exotelService/twilioService directly.
 */

const fs   = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../../config/app-settings.json');

function getProvider() {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    return (s.telephonyProvider || 'exotel').toLowerCase();
  } catch {}
  return process.env.TELEPHONY_PROVIDER || 'exotel';
}

function getService() {
  return getProvider() === 'twilio'
    ? require('./twilioService')
    : require('./exotelService');
}

module.exports = {
  get provider() { return getProvider(); },

  initiateCall:              (...args) => getService().initiateCall(...args),
  generateAnswerExoML:       (...args) => getService().generateAnswerExoML(...args),
  generateConversationExoML: (...args) => getService().generateConversationExoML(...args),
  generateEndCallExoML:      (...args) => getService().generateEndCallExoML(...args),
  generateEscalationExoML:   (...args) => getService().generateEscalationExoML(...args),
  validateWebhookToken:      (...args) => getService().validateWebhookToken(...args),
};
