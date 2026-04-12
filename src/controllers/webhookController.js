/**
 * Webhook Controller
 * Handles all Twilio webhooks: outbound answer, speech, status + inbound calls
 */

const { v4: uuidv4 } = require('uuid');
const Call = require('../models/Call');
const { processCallAnswer, processSpeechInput } = require('../services/conversationEngine');
const { generateAnswerTwiML } = require('../services/twilioService');
const { notifyDashboard } = require('../websocket/wsServer');
const logger = require('../utils/logger');

// ── Outbound Call Webhooks ─────────────────────────────────────────────────────

async function handleCallAnswer(req, res) {
  const { callId } = req.query;
  const { CallSid } = req.body;
  logger.info(`Call answered: callId=${callId}, sid=${CallSid}`);

  try {
    const call = await Call.findByPk(callId);
    if (!call) return res.type('text/xml').send('<Response><Hangup/></Response>');

    await call.update({ callSid: CallSid, status: 'answered', startedAt: new Date() });
    const twiml = await processCallAnswer(callId);
    res.type('text/xml').send(twiml);
  } catch (error) {
    logger.error('handleCallAnswer error:', error);
    res.type('text/xml').send(_errorTwiML());
  }
}

async function handleSpeechInput(req, res) {
  const { callId, turn } = req.query;
  const { SpeechResult, RecordingUrl } = req.body;
  logger.info(`Speech input: callId=${callId}, turn=${turn}, text="${SpeechResult}"`);

  try {
    const twiml = await processSpeechInput(callId, parseInt(turn), RecordingUrl || null, SpeechResult || null);
    res.type('text/xml').send(twiml);
  } catch (error) {
    logger.error('handleSpeechInput error:', error);
    res.type('text/xml').send(_errorTwiML());
  }
}

async function handleSilenceTimeout(req, res) {
  const { callId, turn } = req.query;
  logger.info(`Silence timeout: callId=${callId}, turn=${turn}`);

  try {
    const twiml = await processSpeechInput(callId, parseInt(turn), null, null);
    res.type('text/xml').send(twiml);
  } catch (error) {
    logger.error('handleSilenceTimeout error:', error);
    res.type('text/xml').send(_errorTwiML());
  }
}

async function handleCallStatus(req, res) {
  const { callId } = req.query;
  const { CallSid, CallStatus, CallDuration } = req.body;
  logger.info(`Call status: ${CallStatus} for callId=${callId}`);

  try {
    const call = await Call.findByPk(callId);
    if (!call) return res.sendStatus(200);

    const updateData = { status: CallStatus };

    if (CallStatus === 'completed') {
      updateData.endedAt = new Date();
      updateData.duration = parseInt(CallDuration) || 0;
      await notifyDashboard({ type: 'CALL_COMPLETED', callId, duration: updateData.duration });
    }

    if (['no-answer', 'busy', 'failed'].includes(CallStatus) && call.retryCount < call.maxRetries) {
      const retryDelay = parseInt(process.env.CALL_RETRY_DELAY_SECONDS) || 60;
      updateData.nextRetryAt = new Date(Date.now() + retryDelay * 1000);
      await notifyDashboard({ type: 'CALL_RETRY_SCHEDULED', callId, retryCount: call.retryCount + 1 });
    }

    await call.update(updateData);
  } catch (error) {
    logger.error('handleCallStatus error:', error);
  }

  res.sendStatus(200);
}

async function handleAMD(req, res) {
  const { callId } = req.query;
  const { AnsweredBy } = req.body;
  logger.info(`AMD result: ${AnsweredBy} for call ${callId}`);

  const isMachine = ['machine_start', 'machine_end_beep', 'machine_end_silence', 'machine_end_other'].includes(AnsweredBy);

  if (isMachine) {
    await Call.update(
      { status: 'no-answer', nextRetryAt: new Date(Date.now() + 120000) },
      { where: { id: callId } }
    );
    return res.type('text/xml').send('<Response><Hangup/></Response>');
  }

  res.sendStatus(200);
}

async function handleRecordingStatus(req, res) {
  const { RecordingSid, RecordingUrl, RecordingStatus, CallSid } = req.body;

  if (RecordingStatus === 'completed') {
    const call = await Call.findOne({ where: { callSid: CallSid } });
    if (call) {
      await call.update({ recordingUrl: RecordingUrl, recordingSid: RecordingSid });
      logger.info(`Recording saved for call ${call.id}`);
    }
  }
  res.sendStatus(200);
}

// ── Inbound Call Handler ───────────────────────────────────────────────────────

/**
 * POST /webhook/call/incoming
 * Fires when someone dials your Twilio number.
 * Configure in: Twilio Console → Phone Numbers → Voice → "A call comes in"
 *
 * The same conversation engine handles inbound — no code duplication.
 */
async function handleIncomingCall(req, res) {
  const { CallSid, From, To } = req.body;
  logger.info(`Inbound call from ${From}, sid=${CallSid}`);

  try {
    // Create a call record so the conversation engine can track state
    const call = await Call.create({
      id: uuidv4(),
      callSid: CallSid,
      toPhone: From,          // caller's number
      fromPhone: To,          // our Twilio number
      status: 'answered',
      direction: 'inbound',
      startedAt: new Date(),
      maxRetries: 0,          // no auto-retry for inbound
      consentRecording: false,
    });

    logger.info(`Inbound call record: ${call.id}`);
    await notifyDashboard({ type: 'INBOUND_CALL_RECEIVED', callId: call.id, from: From });

    // Reuse the same greeting + conversation loop as outbound calls
    const twiml = await processCallAnswer(call.id);
    res.type('text/xml').send(twiml);

  } catch (error) {
    logger.error('handleIncomingCall error:', error);
    res.type('text/xml').send(_errorTwiML());
  }
}

// ── Helper ─────────────────────────────────────────────────────────────────────

function _errorTwiML() {
  return `<Response><Say language="ta-IN">மன்னிக்கவும், ஒரு தொழில்நுட்ப பிரச்சனை ஏற்பட்டது. பின்னர் மீண்டும் முயற்சிக்கவும்.</Say><Hangup/></Response>`;
}

module.exports = {
  handleCallAnswer,
  handleSpeechInput,
  handleSilenceTimeout,
  handleCallStatus,
  handleAMD,
  handleRecordingStatus,
  handleIncomingCall,
};
