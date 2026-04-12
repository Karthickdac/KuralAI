/**
 * Webhook Routes - /webhook
 * Protected by shared-secret token validation (not JWT).
 * All URLs include ?wt=<EXOTEL_WEBHOOK_TOKEN> set at call initiation time.
 */

const express = require('express');
const router = express.Router();
const { validateExotelWebhook, webhookRateLimit } = require('../middleware/exotelValidation');
const {
  handleCallAnswer,
  handleConversationStart,
  handleSpeechInput,
  handleSilenceTimeout,
  handleCallStatus,
  handleRecordingStatus,
  handleIncomingCall,
} = require('../controllers/webhookController');

// Rate limit + token validation on all webhook routes
router.use(webhookRateLimit);
router.use(validateExotelWebhook);

// Outbound call lifecycle
router.post('/call/answer', handleCallAnswer);
router.post('/call/conversation', handleConversationStart);
router.post('/call/speech', handleSpeechInput);
router.post('/call/silence', handleSilenceTimeout);
router.post('/call/status', handleCallStatus);

// Inbound calls — configure in Exotel Console → ExoPhone → Incoming Webhook
router.post('/call/incoming', handleIncomingCall);

// Recording ready
router.post('/recording/status', handleRecordingStatus);

module.exports = router;
