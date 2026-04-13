/**
 * Simulate Service
 * Drives the full KuralAI conversation pipeline in-process —
 * no Exotel account required. Supports customer selection so
 * the AI greets by name and uses that customer's real chit data.
 */

const { v4: uuidv4 } = require('uuid');
const Call = require('../models/Call');
const Transcript = require('../models/Transcript');
const Customer = require('../models/Customer');
const ChitAccount = require('../models/ChitAccount');
const { processCallAnswer, processSpeechInput } = require('./conversationEngine');
const { buildChitMetadata } = require('../controllers/customerController');
const { extractAndSavePreferences } = require('./preferenceService');
const logger = require('../utils/logger');

/**
 * Load a customer's chit metadata from DB.
 * Falls back gracefully if the customer isn't found.
 */
async function loadCustomerMetadata(customerId) {
  if (!customerId) return {};
  try {
    const c = await Customer.findByPk(customerId);
    if (!c) return {};
    const chits   = await ChitAccount.findAll({
      where: { customerId: c.id },
      order: [['isPrimary', 'DESC']],
    });
    const primary = chits.find(ch => ch.isPrimary) || chits[0];
    const others  = chits.filter(ch => !ch.isPrimary);
    if (!primary) return { customerName: c.name, phone: c.phone };
    return buildChitMetadata(c, primary, others[0] || null);
  } catch (err) {
    logger.error('[SIM] loadCustomerMetadata error:', err.message);
    return {};
  }
}

/**
 * Start a new simulated call.
 * @param {string|null} workflowId
 * @param {string|null} customerId - If provided, loads that customer's chit data
 */
async function startSimulatedCall(workflowId = null, customerId = null) {
  const callSid = `SIM-${uuidv4()}`;

  // Build metadata: start with chit data, then overlay workflow + sim flag
  const chitMeta = await loadCustomerMetadata(customerId);
  const metadata = {
    simulated: true,
    ...chitMeta,
  };
  if (workflowId) metadata.workflowId = workflowId;

  const call = await Call.create({
    callSid,
    toPhone: chitMeta.phone || '+91SIMULATOR',
    fromPhone: '+91AUTOMYSTIC',
    status: 'in-progress',
    startedAt: new Date(),
    metadata,
  });

  const callId = call.id;
  logger.info(`[SIM] Started call ${callId} for customer="${chitMeta.customerName || 'unknown'}"`);

  // Run the greeting through the full pipeline
  await processCallAnswer(callId);

  const greeting = await Transcript.findOne({
    where: { callId, speaker: 'ai', turnNumber: 0 },
    order: [['createdAt', 'ASC']],
  });

  return {
    callId,
    turn: 0,
    text: greeting?.text || '',
    audioUrl: greeting?.audioUrl || null,
    ended: false,
    customerName: chitMeta.customerName || null,
  };
}

/**
 * Process one user turn in a simulated call.
 */
async function simulateTurn(callId, turn, userText) {
  logger.info(`[SIM] callId=${callId} turn=${turn} userText="${userText}"`);

  const exoml = await processSpeechInput(callId, turn, null, userText);
  const ended = exoml.includes('<Hangup/>') || exoml.includes('</Dial>');

  if (ended) {
    await Call.update(
      { status: 'completed', endedAt: new Date() },
      { where: { id: callId } }
    );
  }

  const nextTurn = turn + 1;
  const aiEntry = await Transcript.findOne({
    where: { callId, speaker: 'ai', turnNumber: nextTurn },
    order: [['createdAt', 'DESC']],
  });

  return {
    callId,
    turn: nextTurn,
    text: aiEntry?.text || '',
    audioUrl: aiEntry?.audioUrl || null,
    intent: aiEntry?.intent || null,
    ended,
  };
}

/**
 * End a simulated call early (user clicked Hang Up).
 */
async function endSimulatedCall(callId) {
  await Call.update(
    { status: 'completed', endedAt: new Date() },
    { where: { id: callId } }
  );
  extractAndSavePreferences(callId).catch(() => {});
  logger.info(`[SIM] Ended call ${callId}`);
}

module.exports = { startSimulatedCall, simulateTurn, endSimulatedCall };
