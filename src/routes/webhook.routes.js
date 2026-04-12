/**
 * Webhook Routes - /webhook
 * Protected by Twilio HMAC signature validation (not JWT).
 */

const express = require('express');
const router = express.Router();
const { validateTwilioSignature, webhookRateLimit } = require('../middleware/twilioValidation');
const {
  handleCallAnswer,
  handleSpeechInput,
  handleSilenceTimeout,
  handleCallStatus,
  handleAMD,
  handleRecordingStatus,
  handleIncomingCall,
} = require('../controllers/webhookController');

// Rate limit + Twilio signature validation on all webhook routes
router.use(webhookRateLimit);
router.use(validateTwilioSignature);

// Outbound call lifecycle
router.post('/call/answer', handleCallAnswer);
router.post('/call/speech', handleSpeechInput);
router.post('/call/silence', handleSilenceTimeout);
router.post('/call/status', handleCallStatus);
router.post('/call/amd', handleAMD);

// Inbound calls (configure in Twilio Console → Phone Numbers → Voice webhook)
router.post('/call/incoming', handleIncomingCall);

// Recording ready
router.post('/recording/status', handleRecordingStatus);

module.exports = router;
