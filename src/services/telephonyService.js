/**
 * Telephony Service — provider-agnostic facade
 * Routes to Exotel or Twilio based on the 'telephonyProvider' setting.
 * All call code should import from here, not from exotelService/twilioService directly.
 */

const { getSettingsSync } = require('./settingsService');

function getProvider() {
  const s = getSettingsSync();
  return (s.telephonyProvider || 'twilio').toLowerCase();
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
