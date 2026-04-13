/**
 * Retry Scheduler
 * Runs every minute to retry failed/no-answer calls
 */

const cron = require('node-cron');
const { Op, literal } = require('sequelize');
const Call = require('../models/Call');
const { initiateCall } = require('./exotelService');
const logger = require('../utils/logger');

function startRetryScheduler() {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();

      // Find calls due for retry
      // Note: column-to-column comparison uses literal() — Op.col() is not valid inside Op.lt
      const callsToRetry = await Call.findAll({
        where: {
          status: { [Op.in]: ['no-answer', 'busy', 'failed'] },
          nextRetryAt: { [Op.lte]: now },
          [Op.and]: [literal('"retryCount" < "maxRetries"')],
        },
        limit: 10, // Process max 10 retries per minute
      });

      for (const call of callsToRetry) {
        try {
          logger.info(`Retrying call ${call.id} (attempt ${call.retryCount + 1})`);

          const exotelCall = await initiateCall(call.toPhone, call.id, call.metadata);

          await call.update({
            callSid: exotelCall.sid,
            status: 'queued',
            retryCount: call.retryCount + 1,
            nextRetryAt: null,
          });

        } catch (error) {
          logger.error(`Retry failed for call ${call.id}:`, error.message);

          // If retry fails, schedule next attempt or mark as permanently failed
          if (call.retryCount + 1 >= call.maxRetries) {
            await call.update({ status: 'failed', nextRetryAt: null });
          } else {
            const delay = parseInt(process.env.CALL_RETRY_DELAY_SECONDS) || 60;
            await call.update({
              nextRetryAt: new Date(Date.now() + delay * 1000 * 2), // Double delay on error
            });
          }
        }
      }

      if (callsToRetry.length > 0) {
        logger.info(`Retry scheduler: processed ${callsToRetry.length} calls`);
      }

    } catch (error) {
      logger.error('Retry scheduler error:', error.message);
    }
  });

  logger.info('Retry scheduler started (runs every minute)');
}

module.exports = { startRetryScheduler };
