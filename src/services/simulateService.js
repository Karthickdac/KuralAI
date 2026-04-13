/**
 * Simulate Service
 * Drives the full KuralAI conversation pipeline in-process —
 * no Exotel account required. Audio is synthesized by Azure TTS and
 * served locally so the browser can play it directly.
 */

const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const Call = require('../models/Call');
const Transcript = require('../models/Transcript');
const { processCallAnswer, processSpeechInput } = require('./conversationEngine');
const logger = require('../utils/logger');

/**
 * Start a new simulated call.
 * Creates a Call row, runs the greeting, returns structured {callId, text, audioUrl, turn}.
 */
async function startSimulatedCall(workflowId = null) {
  const callSid = `SIM-${uuidv4()}`;

  const metadata = { simulated: true };
  if (workflowId) metadata.workflowId = workflowId;

  const call = await Call.create({
    callSid,
    toPhone: '+91SIMULATOR',
    fromPhone: '+91SIMULATOR',
    status: 'in-progress',
    startedAt: new Date(),
    metadata,
  });

  const callId = call.id;
  logger.info(`[SIM] Started simulated call ${callId}`);

  // Run the greeting through the full pipeline
  await processCallAnswer(callId);

  // Retrieve the greeting transcript from DB (speaker=ai, turn=0)
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
  };
}

/**
 * Process one user turn in a simulated call.
 * @param {string} callId
 * @param {number} turn      - Current turn number (0-indexed, starts at 0 after greeting)
 * @param {string} userText  - Text typed or transcribed by the user
 */
async function simulateTurn(callId, turn, userText) {
  logger.info(`[SIM] callId=${callId} turn=${turn} userText="${userText}"`);

  // Run through the full conversation engine (speech text passed directly — no STT needed)
  const exoml = await processSpeechInput(callId, turn, null, userText);

  // Detect end-of-call from ExoML
  const ended = exoml.includes('<Hangup/>') || exoml.includes('</Dial>');

  if (ended) {
    // Mark the call complete in DB
    await Call.update(
      { status: 'completed', endedAt: new Date() },
      { where: { id: callId } }
    );
  }

  // Fetch the latest AI transcript entry (the response just generated)
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
 * End a simulated call early (user clicked "Hang Up").
 */
async function endSimulatedCall(callId) {
  await Call.update(
    { status: 'completed', endedAt: new Date() },
    { where: { id: callId } }
  );
  logger.info(`[SIM] Ended simulated call ${callId}`);
}

module.exports = { startSimulatedCall, simulateTurn, endSimulatedCall };
