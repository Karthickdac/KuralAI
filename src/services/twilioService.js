/**
 * Twilio Service
 * Handles outgoing calls, TwiML responses, recording management
 */

const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;
const logger = require('../utils/logger');
const { TAMIL_PROMPTS } = require('../config/tamilPrompts');

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      throw new Error('Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
    }
    _client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return _client;
}
const client = new Proxy({}, {
  get(_, prop) {
    return getClient()[prop];
  },
});

/**
 * Initiate an outgoing call to a phone number
 * @param {string} toPhone - Destination phone number (E.164 format)
 * @param {string} callId - Internal call ID for webhook routing
 * @param {Object} metadata - Additional data (customer info, etc.)
 */
async function initiateCall(toPhone, callId, metadata = {}) {
  const webhookBase = process.env.APP_URL;

  const call = await client.calls.create({
    to: toPhone,
    from: process.env.TWILIO_PHONE_NUMBER,
    url: `${webhookBase}/webhook/call/answer?callId=${callId}`,
    statusCallback: `${webhookBase}/webhook/call/status?callId=${callId}`,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    statusCallbackMethod: 'POST',
    machineDetection: 'DetectMessageEnd', // Detect answering machines
    asyncAmd: 'true',
    asyncAmdStatusCallback: `${webhookBase}/webhook/call/amd?callId=${callId}`,
    timeLimit: parseInt(process.env.MAX_CALL_DURATION_SECONDS) || 300,
    record: false, // Recording enabled per-call after consent
  });

  logger.info(`Twilio call initiated: ${call.sid} -> ${toPhone}`);
  return call;
}

/**
 * Generate TwiML for the call answer (entry point)
 * This is what plays when the user picks up
 */
function generateAnswerTwiML(callId, language = 'ta-IN') {
  const response = new VoiceResponse();
  const webhookBase = process.env.APP_URL;

  // Brief pause before speaking
  response.pause({ length: 1 });

  // Play recording consent notice
  response.say({
    language,
    voice: 'Polly.Aditi', // Fallback before Azure TTS audio is ready
  }, TAMIL_PROMPTS.RECORDING_CONSENT);

  response.pause({ length: 1 });

  // Redirect to the conversation loop
  response.redirect({
    method: 'POST',
  }, `${webhookBase}/webhook/call/conversation?callId=${callId}&turn=0`);

  return response.toString();
}

/**
 * Generate TwiML to play an audio file and gather speech input
 * @param {string} audioUrl - URL of the TTS audio to play
 * @param {string} callId - Internal call ID
 * @param {number} turn - Current conversation turn
 */
function generateConversationTwiML(audioUrl, callId, turn) {
  const response = new VoiceResponse();
  const webhookBase = process.env.APP_URL;

  const gather = response.gather({
    input: 'speech',
    language: 'ta-IN',          // Tamil speech recognition
    speechTimeout: process.env.SPEECH_TIMEOUT_SECONDS || 'auto',
    speechModel: 'phone_call',
    enhanced: true,             // Enhanced model for better Tamil accuracy
    action: `${webhookBase}/webhook/call/speech?callId=${callId}&turn=${turn + 1}`,
    method: 'POST',
    timeout: parseInt(process.env.SILENCE_TIMEOUT_SECONDS) || 5,
    profanityFilter: false,     // Don't filter Tamil words incorrectly
  });

  // Play the AI's response audio
  gather.play(audioUrl);

  // If no input received (silence), handle timeout
  response.redirect({
    method: 'POST',
  }, `${webhookBase}/webhook/call/silence?callId=${callId}&turn=${turn + 1}`);

  return response.toString();
}

/**
 * Generate TwiML for call end
 */
function generateEndCallTwiML(goodbyeAudioUrl) {
  const response = new VoiceResponse();

  if (goodbyeAudioUrl) {
    response.play(goodbyeAudioUrl);
  } else {
    response.say({ language: 'ta-IN' }, TAMIL_PROMPTS.GOODBYE);
  }

  response.pause({ length: 1 });
  response.hangup();

  return response.toString();
}

/**
 * Generate TwiML for human escalation (transfer to agent)
 */
function generateEscalationTwiML(escalationAudioUrl) {
  const response = new VoiceResponse();
  const escalationPhone = process.env.ESCALATION_PHONE;

  if (escalationAudioUrl) {
    response.play(escalationAudioUrl);
  }

  response.pause({ length: 1 });

  if (escalationPhone) {
    // Transfer to human agent
    const dial = response.dial({
      timeout: 30,
      callerId: process.env.TWILIO_PHONE_NUMBER,
    });
    dial.number(escalationPhone);
  } else {
    response.say({ language: 'ta-IN' }, 'மன்னிக்கவும், இப்போது எந்த ஒரு ஆதரவாளரும் கிடைக்கவில்லை.');
    response.hangup();
  }

  return response.toString();
}

/**
 * Start recording for a call (after user consent)
 */
async function startRecording(callSid) {
  const recording = await client.calls(callSid).recordings.create({
    recordingStatusCallback: `${process.env.APP_URL}/webhook/recording/status`,
    recordingStatusCallbackMethod: 'POST',
    recordingChannels: 'dual', // Separate channels for AI and user
  });

  logger.info(`Recording started: ${recording.sid} for call ${callSid}`);
  return recording;
}

/**
 * Fetch recording and return URL
 */
async function getRecording(recordingSid) {
  const recording = await client.recordings(recordingSid).fetch();
  return {
    url: `https://api.twilio.com${recording.uri.replace('.json', '.mp3')}`,
    duration: recording.duration,
    status: recording.status,
  };
}

/**
 * Validate Twilio webhook signature
 */
function validateWebhookSignature(req) {
  const signature = req.headers['x-twilio-signature'];
  const url = `${process.env.APP_URL}${req.originalUrl}`;
  const params = req.body ? Object.fromEntries(new URLSearchParams(req.body.toString())) : {};

  return twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    signature,
    url,
    params
  );
}

module.exports = {
  initiateCall,
  generateAnswerTwiML,
  generateConversationTwiML,
  generateEndCallTwiML,
  generateEscalationTwiML,
  startRecording,
  getRecording,
  validateWebhookSignature,
  client,
};
