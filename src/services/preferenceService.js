/**
 * Preference Service
 * Extracts and stores customer preferences from call transcripts.
 *
 * After a call ends, scans user turns for key intents and updates
 * the customer's preferences JSONB column in the database.
 */

const Customer = require('../models/Customer');
const Transcript = require('../models/Transcript');
const Call = require('../models/Call');
const logger = require('../utils/logger');

const INTENT_TO_PREFERENCE = {
  no_office_calls:       (prefs, date) => ({ ...prefs, doNotCallOffice: true,        officeCallRequestedAt: date }),
  reduce_calls:          (prefs, date) => ({ ...prefs, preferSingleCaller: true,      singleCallerRequestedAt: date }),
  lottery_participation: (prefs, date) => ({ ...prefs, lotteryConfirmed: true,        lotteryConfirmedAt: date }),
  payment_complaint:     (prefs, date) => ({ ...prefs, paymentIssueReported: true,    paymentIssueAt: date }),
  premature_withdrawal:  (prefs, date) => ({ ...prefs, withdrawalInterest: true,      withdrawalInquiredAt: date }),
};

/**
 * Extract preferences from a completed call and save to the customer record.
 * @param {string} callId
 */
async function extractAndSavePreferences(callId) {
  try {
    const call = await Call.findByPk(callId);
    if (!call) return;

    const customerId = call.metadata?.customerId;
    if (!customerId) return;

    const customer = await Customer.findByPk(customerId);
    if (!customer) return;

    const aiTurns = await Transcript.findAll({
      where: { callId, speaker: 'ai' },
      order: [['turnNumber', 'ASC']],
    });

    const detectedIntents = aiTurns
      .map(t => t.intent)
      .filter(i => i && INTENT_TO_PREFERENCE[i]);

    if (detectedIntents.length === 0) return;

    const now = new Date().toISOString();
    let updatedPreferences = { ...(customer.preferences || {}) };

    for (const intent of detectedIntents) {
      updatedPreferences = INTENT_TO_PREFERENCE[intent](updatedPreferences, now);
      logger.info(`[PREFS] customerId=${customerId} → ${intent} → preference saved`);
    }

    updatedPreferences.lastCallId   = callId;
    updatedPreferences.lastCallAt   = now;

    await Customer.update(
      { preferences: updatedPreferences },
      { where: { id: customerId } }
    );

    logger.info(`[PREFS] Saved preferences for customer ${customerId}:`, Object.keys(updatedPreferences));
  } catch (err) {
    logger.error('[PREFS] Failed to extract preferences:', err.message);
  }
}

/**
 * Manually update a specific preference flag for a customer.
 */
async function setPreference(customerId, key, value) {
  try {
    const customer = await Customer.findByPk(customerId);
    if (!customer) throw new Error('Customer not found');

    const updated = { ...(customer.preferences || {}), [key]: value };
    await Customer.update({ preferences: updated }, { where: { id: customerId } });
    return updated;
  } catch (err) {
    logger.error('[PREFS] setPreference error:', err.message);
    throw err;
  }
}

/**
 * Clear a specific preference flag.
 */
async function clearPreference(customerId, key) {
  try {
    const customer = await Customer.findByPk(customerId);
    if (!customer) throw new Error('Customer not found');

    const updated = { ...(customer.preferences || {}) };
    delete updated[key];
    await Customer.update({ preferences: updated }, { where: { id: customerId } });
    return updated;
  } catch (err) {
    logger.error('[PREFS] clearPreference error:', err.message);
    throw err;
  }
}

module.exports = { extractAndSavePreferences, setPreference, clearPreference };
