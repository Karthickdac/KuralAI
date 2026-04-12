/**
 * Webhook Routes - /webhook
 * Protected by shared-secret token validation (not JWT).
 * All URLs include ?wt=<EXOTEL_WEBHOOK_TOKEN> set at call initiation time.
 */

const express = require('express');
const router = express.Router();
const { validateExotelWebhook, webhookRateLimit } = require('../middleware/exotelValidation');
const logger = require('../utils/logger');
const {
  handleCallAnswer,
  handleConversationStart,
  handleSpeechInput,
  handleSilenceTimeout,
  handleCallStatus,
  handleRecordingStatus,
  handleIncomingCall,
} = require('../controllers/webhookController');

// Log every webhook request so we can see exactly what Exotel sends
router.use((req, res, next) => {
  logger.info(`WEBHOOK HIT: ${req.method} ${req.path} | ip=${req.ip} | qs=${JSON.stringify(req.query)} | body=${JSON.stringify(req.body)}`);
  next();
});

// Rate limit + token validation on all webhook routes
router.use(webhookRateLimit);
router.use(validateExotelWebhook);

// Outbound call lifecycle — Exotel may send GET or POST for redirects
router.post('/call/answer', handleCallAnswer);
router.get('/call/answer', handleCallAnswer);
router.post('/call/conversation', handleConversationStart);
router.get('/call/conversation', handleConversationStart);
router.post('/call/speech', handleSpeechInput);
router.get('/call/speech', handleSpeechInput);
router.post('/call/silence', handleSilenceTimeout);
router.get('/call/silence', handleSilenceTimeout);
router.post('/call/status', handleCallStatus);
router.get('/call/status', handleCallStatus);

// Inbound calls — Exotel Passthru can send GET or POST depending on configuration
router.post('/call/incoming', handleIncomingCall);
router.get('/call/incoming', handleIncomingCall);

// Recording ready
router.post('/recording/status', handleRecordingStatus);

module.exports = router;
