/**
 * Webhook Controller
 * Handles all Exotel webhooks: outbound answer, conversation, speech, status, inbound
 *
 * Field reference (Exotel → Twilio equivalents):
 *   CallSid        = CallSid    (same)
 *   Status         = CallStatus (renamed)
 *   CallDuration   = CallDuration (same)
 *   SpeechResult   = SpeechResult (same, from <Gather>)
 *   RecordingUrl   = RecordingUrl (same)
 *   From/To        = From/To (same)
 */

const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Call = require('../models/Call');
const { processCallAnswer, processSpeechInput } = require('../services/conversationEngine');
const { generateAnswerExoML } = require('../services/telephonyService');
const { notifyDashboard } = require('../websocket/wsServer');
const logger = require('../utils/logger');

const SETTINGS_FILE   = path.join(__dirname, '../../config/app-settings.json');
const WORKFLOWS_FILE  = path.join(__dirname, '../../config/workflows.json');

function getSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); } catch { return {}; }
}

function getWorkflow(id) {
  try {
    const wfs = JSON.parse(fs.readFileSync(WORKFLOWS_FILE, 'utf-8'));
    return wfs.find(w => w.id === id) || null;
  } catch { return null; }
}

function getActiveWorkflow() {
  try {
    const wfs = JSON.parse(fs.readFileSync(WORKFLOWS_FILE, 'utf-8'));
    return wfs.find(w => w.status === 'active' && w.scriptFlow?.enabled && w.scriptFlow?.steps?.length > 0) || null;
  } catch { return null; }
}

// ── Outbound Call Webhooks ─────────────────────────────────────────────────────

/**
 * POST /webhook/call/answer
 * Fires when Exotel connects the outbound call (callee picks up).
 * Exotel expects ExoML back.
 */
async function handleCallAnswer(req, res) {
  const { callId } = req.query;
  const { CallSid } = req.body;
  logger.info(`Call answered: callId=${callId}, sid=${CallSid}`);

  try {
    const call = await Call.findByPk(callId);
    if (!call) return res.type('text/xml').send('<Response><Hangup/></Response>');

    await call.update({ callSid: CallSid, status: 'answered', startedAt: new Date() });

    // Return the greeting + redirect to conversation start
    res.type('text/xml').send(generateAnswerExoML(callId));
  } catch (error) {
    logger.error('handleCallAnswer error:', error);
    res.type('text/xml').send(_errorExoML());
  }
}

/**
 * POST /webhook/call/conversation
 * Entry point for the AI conversation loop (redirected from answer ExoML).
 */
async function handleConversationStart(req, res) {
  const { callId } = req.query;
  logger.info(`Conversation starting for callId=${callId}`);

  try {
    const call = await Call.findByPk(callId);
    if (!call) return res.type('text/xml').send('<Response><Hangup/></Response>');

    const exoml = await processCallAnswer(callId);
    res.type('text/xml').send(exoml);
  } catch (error) {
    logger.error('handleConversationStart error:', error);
    res.type('text/xml').send(_errorExoML());
  }
}

/**
 * POST /webhook/call/speech
 * Fires after <Gather> captures user speech.
 * Exotel posts SpeechResult (text) and optionally RecordingUrl.
 */
async function handleSpeechInput(req, res) {
  const params = { ...req.body, ...req.query };
  const { callId, turn } = params;
  const SpeechResult = params.SpeechResult || params.speechResult || null;
  const RecordingUrl = params.RecordingUrl || params.recordingUrl || null;
  logger.info(`Speech input: callId=${callId}, turn=${turn}, text="${SpeechResult}"`);

  try {
    const exoml = await processSpeechInput(
      callId,
      parseInt(turn),
      RecordingUrl || null,
      SpeechResult || null
    );
    res.type('text/xml').send(exoml);
  } catch (error) {
    logger.error('handleSpeechInput error:', error);
    res.type('text/xml').send(_errorExoML());
  }
}

/**
 * POST /webhook/call/silence
 * Fires when <Gather> times out with no speech detected.
 */
async function handleSilenceTimeout(req, res) {
  const { callId, turn } = req.query;
  logger.info(`Silence timeout: callId=${callId}, turn=${turn}`);

  try {
    const exoml = await processSpeechInput(callId, parseInt(turn), null, null);
    res.type('text/xml').send(exoml);
  } catch (error) {
    logger.error('handleSilenceTimeout error:', error);
    res.type('text/xml').send(_errorExoML());
  }
}

/**
 * POST /webhook/call/status
 * Exotel posts call status updates here.
 * Note: Exotel uses `Status` (not `CallStatus` like Twilio).
 * Also supports JSON body if StatusCallbackContentType=application/json.
 */
async function handleCallStatus(req, res) {
  const { callId } = req.query;
  // Exotel sends 'Status', some older versions send 'CallStatus'
  const status = req.body.Status || req.body.CallStatus;
  const { CallSid, CallDuration } = req.body;
  logger.info(`Call status update: ${status} for callId=${callId}, sid=${CallSid}`);

  try {
    const call = await Call.findByPk(callId);
    if (!call) return res.sendStatus(200);

    const updateData = { status };

    if (status === 'completed') {
      updateData.endedAt = new Date();
      updateData.duration = parseInt(CallDuration) || 0;
      await notifyDashboard({ type: 'CALL_COMPLETED', callId, duration: updateData.duration });
    }

    if (['no-answer', 'busy', 'failed'].includes(status) && call.retryCount < call.maxRetries) {
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

/**
 * POST /webhook/recording/status
 * Fires when a call recording is ready.
 * Exotel posts RecordingUrl and CallSid.
 */
async function handleRecordingStatus(req, res) {
  const { RecordingUrl, RecordingSid, CallSid } = req.body;
  const callId = req.query.callId;

  let call = null;
  if (callId) call = await Call.findByPk(callId);
  if (!call && CallSid) call = await Call.findOne({ where: { callSid: CallSid } });

  if (call && RecordingUrl) {
    const update = { recordingUrl: RecordingUrl };
    if (RecordingSid) update.recordingSid = RecordingSid;
    await call.update(update);
    logger.info(`Recording saved for call ${call.id}: ${RecordingUrl}`);
    await notifyDashboard({ type: 'RECORDING_READY', callId: call.id, recordingUrl: RecordingUrl });

    if (call.metadata?.callbackUrl) {
      setImmediate(async () => {
        try {
          const axios = require('axios');
          const Transcript = require('../models/Transcript');
          const transcripts = await Transcript.findAll({
            where: { callId: call.id },
            order: [['turnNumber', 'ASC']],
            attributes: ['turnNumber', 'speaker', 'text', 'intent', 'confidence'],
          });
          await axios.post(call.metadata.callbackUrl, {
            event: 'recording_ready',
            callId: call.id,
            callSid: call.callSid,
            phone: call.toPhone,
            status: call.status,
            duration: call.duration,
            recordingUrl: RecordingUrl,
            recordingSid: RecordingSid,
            campaignId: call.metadata?.campaignId,
            transcripts: transcripts.map(t => t.toJSON()),
            pushedAt: new Date().toISOString(),
          }, { timeout: 15000 });
          logger.info(`Auto-pushed recording for call ${call.id} to ${call.metadata.callbackUrl}`);
        } catch (e) {
          logger.error(`Auto-push recording failed for call ${call.id}: ${e.message}`);
        }
      });
    }
  }
  res.sendStatus(200);
}

// ── Inbound Call Handler ───────────────────────────────────────────────────────

/**
 * Normalize an Indian phone number to E.164 (+91XXXXXXXXXX).
 * Exotel sends numbers in local format (07358337470 or 08047280398).
 */
function normalizePhone(num) {
  if (!num) return num;
  num = String(num).trim().replace(/\s+/g, '');
  if (num.startsWith('+')) return num;                 // already E.164
  if (num.startsWith('91') && num.length === 12) return '+' + num; // 91XXXXXXXXXX
  if (num.startsWith('0') && num.length === 11) return '+91' + num.slice(1); // 0XXXXXXXXXX
  if (num.length === 10) return '+91' + num;           // bare 10-digit
  return num;
}

async function handleIncomingCall(req, res) {
  // Exotel Passthru may send params as query string OR body — merge both
  const params = { ...req.query, ...req.body };
  const CallSid = params.CallSid;
  // Exotel uses both From/To and CallFrom/CallTo
  const From = normalizePhone(params.From || params.CallFrom);
  const To   = normalizePhone(params.To   || params.CallTo);

  logger.info(`Inbound call from ${From} to ${To}, sid=${CallSid}, type=${params.CallType || 'n/a'}`);
  logger.debug('Inbound webhook params:', JSON.stringify(params));

  try {
    // Load the configured inbound workflow (or auto-detect the first active one)
    const settings = getSettings();
    let workflow = null;
    if (settings.inboundWorkflowId) {
      workflow = getWorkflow(settings.inboundWorkflowId);
    }
    if (!workflow) {
      workflow = getActiveWorkflow();
    }

    const metadata = {};
    if (workflow) {
      metadata.workflowId = workflow.id;
      metadata.workflowName = workflow.name;
      logger.info(`Inbound call will use workflow: ${workflow.name} (${workflow.id})`);
    } else {
      logger.info('Inbound call: no workflow configured — using free-form AI mode');
    }

    let call;
    let isRetry = false;

    try {
      call = await Call.create({
        id: uuidv4(),
        callSid: CallSid,
        toPhone: From,
        fromPhone: To || settings.exotelPhoneNumber || '',
        status: 'answered',
        direction: 'inbound',
        startedAt: new Date(),
        maxRetries: 0,
        metadata,
      });
      logger.info(`Inbound call record created: ${call.id}`);
      await notifyDashboard({ type: 'INBOUND_CALL_RECEIVED', callId: call.id, from: From, workflowId: workflow?.id });
    } catch (dbError) {
      // Exotel retries the passthru webhook when <Gather> times out or <Redirect> is ignored.
      // Re-use the existing call record instead of crashing.
      if (dbError.name === 'SequelizeUniqueConstraintError') {
        call = await Call.findOne({ where: { callSid: CallSid } });
        if (call) {
          isRetry = true;
          logger.info(`Exotel retry for sid=${CallSid} — continuing existing call ${call.id}`);
        } else {
          throw dbError;
        }
      } else {
        throw dbError;
      }
    }

    // Return the answer ExoML — plays greeting and redirects to conversation loop.
    // NOTE: <Say> TTS requires the Exotel account to have TTS enabled (not available on Trial).
    //       Complete KYC and upgrade to a paid plan for full audio functionality.
    const exoml = generateAnswerExoML(call.id);
    logger.info(`Returning answer ExoML for call ${call.id}`);
    res.type('text/xml').send(exoml);
    return;
  } catch (error) {
    logger.error('handleIncomingCall error:', error);
    res.type('text/xml').send(_errorExoML());
  }
}

// ── Helper ─────────────────────────────────────────────────────────────────────

function _errorExoML() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Say language="ta-IN">மன்னிக்கவும், ஒரு தொழில்நுட்ப பிரச்சனை ஏற்பட்டது. பின்னர் மீண்டும் முயற்சிக்கவும்.</Say><Hangup/></Response>`;
}

module.exports = {
  handleCallAnswer,
  handleConversationStart,
  handleSpeechInput,
  handleSilenceTimeout,
  handleCallStatus,
  handleRecordingStatus,
  handleIncomingCall,
};
