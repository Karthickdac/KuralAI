const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Call = require('../models/Call');
const Customer = require('../models/Customer');
const ChitAccount = require('../models/ChitAccount');
const { buildChitMetadata } = require('./customerController');
const { initiateCall } = require('../services/telephonyService');
const creditService = require('../services/creditService');
const logger = require('../utils/logger');

async function resolveCustomerMeta(toPhone, organizationId) {
  try {
    const where = { phone: toPhone };
    if (organizationId) where.organizationId = organizationId;
    const customer = await Customer.findOne({ where });
    if (!customer) return {};
    const chits   = await ChitAccount.findAll({
      where: { customerId: customer.id },
      order: [['isPrimary', 'DESC']],
    });
    if (!chits.length) return { customerId: customer.id, customerName: customer.name, phone: customer.phone };
    const primary = chits.find(ch => ch.isPrimary) || chits[0];
    const others  = chits.filter(ch => !ch.isPrimary);
    return buildChitMetadata(customer, primary, others[0] || null);
  } catch (e) {
    logger.warn('resolveCustomerMeta failed:', e.message);
    return {};
  }
}

const { getSettingsSync } = require('../services/settingsService');
function getSettings() {
  return getSettingsSync();
}

async function initiateCallController(req, res) {
  const { toPhone, metadata = {}, maxRetries } = req.body;
  const orgId = req.user?.organizationId || null;

  try {
    const customerMeta = await resolveCustomerMeta(toPhone, orgId);
    const enrichedMeta = { ...customerMeta, ...metadata };

    const s = getSettings();
    const provider   = (s.telephonyProvider || 'twilio').toLowerCase();
    const fromPhone  = provider === 'twilio'
      ? (s.twilioPhoneNumber  || process.env.TWILIO_PHONE_NUMBER  || '')
      : (s.exotelPhoneNumber  || process.env.EXOTEL_PHONE_NUMBER  || '');

    const call = await Call.create({
      id: uuidv4(),
      toPhone,
      fromPhone,
      status: 'initiated',
      direction: 'outbound',
      maxRetries: maxRetries || parseInt(process.env.CALL_RETRY_ATTEMPTS) || 3,
      metadata: enrichedMeta,
      organizationId: orgId,
    });

    logger.info(`Call initiated: ${call.id} -> ${toPhone} | customer=${enrichedMeta.customerName || 'unknown'} | chit=${enrichedMeta.chitGroup || 'none'}`);

    const exotelCall = await initiateCall(toPhone, call.id, enrichedMeta);

    await call.update({
      callSid: exotelCall.sid,
      status: 'queued',
    });

    if (orgId) {
      try {
        await creditService.deductMinutes(orgId, 2, call.id, `Call initiated: ${call.id}`);
      } catch (e) {
        logger.warn(`Credit deduction failed for call ${call.id}:`, e.message);
      }
    }

    const _meta = { ...enrichedMeta };
    setImmediate(async () => {
      try {
        const { synthesizeSpeech } = require('../services/speechService');
        const { getPromptText }    = require('../services/aiService');
        const { applyTemplate }    = require('../utils/templateEngine');
        const { generateConversationExoML } = require('../services/telephonyService');
        const { setGreetingCache } = require('../services/conversationEngine');
        const QaTemplate           = require('../models/QaTemplate');
        const _fs = require('fs');
        const _path = require('path');

        const otherTexts = [];
        let greetingText = null;

        const wfId = _meta.workflowId || _meta.callType;
        if (wfId) {
          try {
            const wfFile = _path.join(__dirname, '../../config/workflows.json');
            if (_fs.existsSync(wfFile)) {
              const wfs = JSON.parse(_fs.readFileSync(wfFile, 'utf8'));
              const wf = wfs.find(w => w.id === wfId);
              if (wf?.scriptFlow?.enabled && wf.scriptFlow.steps?.length) {
                const startStep = wf.scriptFlow.steps.find(s => s.id === wf.scriptFlow.startStep) || wf.scriptFlow.steps[0];
                if (startStep?.agentMessage) {
                  greetingText = applyTemplate(startStep.agentMessage, _meta);
                }
                for (const step of wf.scriptFlow.steps) {
                  if (step.agentMessage && step !== startStep) {
                    otherTexts.push(applyTemplate(step.agentMessage, _meta));
                  }
                  if (step.fallbackMessage) {
                    otherTexts.push(applyTemplate(step.fallbackMessage, _meta));
                  }
                  if (step.branches) {
                    for (const br of step.branches) {
                      if (br.agentResponse) {
                        otherTexts.push(applyTemplate(br.agentResponse, _meta));
                      }
                    }
                  }
                }
              }
            }
          } catch (e) {
            logger.debug('Workflow pre-warm parse error:', e.message);
          }
        }

        if (!greetingText) {
          greetingText = await getPromptText('GREETING', _meta);
        }

        const greetingTts = await synthesizeSpeech(greetingText);
        const twiml = generateConversationExoML(greetingTts.playableUrl, call.id, 0, greetingText);
        setGreetingCache(call.id, twiml, greetingText, greetingTts.playableUrl);
        logger.info(`Greeting TwiML pre-cached for call ${call.id} in ring phase`);

        const qaRows = await QaTemplate.findAll({ where: { isActive: true }, raw: true });
        qaRows.forEach(r => {
          (r.responses || []).forEach(t => {
            otherTexts.push(applyTemplate(t, _meta));
          });
        });

        const unique = [...new Set(otherTexts)];
        for (let i = 0; i < unique.length; i += 6) {
          await Promise.all(unique.slice(i, i + 6).map(t => synthesizeSpeech(t).catch(() => {})));
        }
        logger.info(`Pre-warmed ${unique.length + 1} TTS entries for call ${call.id} (workflow: ${wfId || 'none'})`);
      } catch (e) {
        logger.warn('Per-call TTS pre-warm failed:', e.message);
      }
    });

    res.status(201).json({
      success: true,
      callId: call.id,
      callSid: exotelCall.sid,
      status: 'queued',
      toPhone,
    });

  } catch (error) {
    logger.error('Failed to initiate call:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function getCallStatus(req, res) {
  const { callId } = req.params;
  const orgFilter = req.tenantScope || {};

  const call = await Call.findOne({
    where: { id: callId, ...orgFilter },
    attributes: ['id', 'callSid', 'toPhone', 'status', 'duration', 'escalated', 'createdAt', 'startedAt', 'endedAt'],
  });

  if (!call) return res.status(404).json({ error: 'Call not found' });

  res.json({ success: true, call });
}

async function bulkCallController(req, res) {
  const { phones = [], customerIds = [], metadata = {}, delayMs = 2500 } = req.body;
  const orgId = req.user?.organizationId || null;

  if (!phones.length && !customerIds.length) {
    return res.status(400).json({ success: false, error: 'phones or customerIds array required' });
  }

  const targets = phones.length ? phones : [];

  if (customerIds.length) {
    const custWhere = { id: customerIds };
    if (orgId) custWhere.organizationId = orgId;
    const customers = await Customer.findAll({ where: custWhere });
    customers.forEach(c => { if (c.phone && !targets.includes(c.phone)) targets.push(c.phone); });
  }

  if (!targets.length) {
    return res.status(400).json({ success: false, error: 'No valid phone numbers found' });
  }

  res.json({
    success: true,
    queued: targets.length,
    message: `Queued ${targets.length} call(s). They will start within a few seconds.`,
  });

  setImmediate(async () => {
    const s = getSettings();
    const provider   = (s.telephonyProvider || 'twilio').toLowerCase();
    const fromPhone  = provider === 'twilio'
      ? (s.twilioPhoneNumber  || process.env.TWILIO_PHONE_NUMBER  || '')
      : (s.exotelPhoneNumber  || process.env.EXOTEL_PHONE_NUMBER  || '');

    for (let i = 0; i < targets.length; i++) {
      const toPhone = targets[i];
      try {
        const customerMeta = await resolveCustomerMeta(toPhone, orgId);
        const enrichedMeta = { ...customerMeta, ...metadata };

        const call = await Call.create({
          id: uuidv4(), toPhone, fromPhone,
          status: 'initiated', direction: 'outbound',
          maxRetries: parseInt(process.env.CALL_RETRY_ATTEMPTS) || 3,
          metadata: enrichedMeta,
          organizationId: orgId,
        });

        const exotelCall = await initiateCall(toPhone, call.id, enrichedMeta);
        await call.update({ callSid: exotelCall.sid, status: 'queued' });
        logger.info(`Bulk call ${i + 1}/${targets.length}: ${call.id} -> ${toPhone}`);

        const _meta = { ...enrichedMeta };
        (async () => {
          try {
            const { synthesizeSpeech } = require('../services/speechService');
            const { getPromptText }    = require('../services/aiService');
            const { applyTemplate }    = require('../utils/templateEngine');
            const { generateConversationExoML } = require('../services/telephonyService');
            const { setGreetingCache } = require('../services/conversationEngine');
            const QaTemplate           = require('../models/QaTemplate');
            const _fs = require('fs');
            const _path = require('path');

            let greetingText = null;
            const wfId = _meta.workflowId || _meta.callType;
            if (wfId) {
              try {
                const wfFile = _path.join(__dirname, '../../config/workflows.json');
                if (_fs.existsSync(wfFile)) {
                  const wfs = JSON.parse(_fs.readFileSync(wfFile, 'utf8'));
                  const wf = wfs.find(w => w.id === wfId);
                  if (wf?.scriptFlow?.enabled && wf.scriptFlow.steps?.length) {
                    const startStep = wf.scriptFlow.steps.find(s => s.id === wf.scriptFlow.startStep) || wf.scriptFlow.steps[0];
                    if (startStep?.agentMessage) greetingText = applyTemplate(startStep.agentMessage, _meta);
                  }
                }
              } catch {}
            }
            if (!greetingText) greetingText = await getPromptText('GREETING', _meta);
            const greetingTts = await synthesizeSpeech(greetingText);
            const twiml = generateConversationExoML(greetingTts.playableUrl, call.id, 0, greetingText);
            setGreetingCache(call.id, twiml, greetingText, greetingTts.playableUrl);

            const qaRows = await QaTemplate.findAll({ where: { isActive: true }, raw: true });
            const texts = [];
            qaRows.forEach(r => (r.responses || []).forEach(t => texts.push(applyTemplate(t, _meta))));
            for (let j = 0; j < texts.length; j += 5) {
              await Promise.all(texts.slice(j, j + 5).map(t => synthesizeSpeech(t).catch(() => {})));
            }
          } catch {}
        })();

        if (i < targets.length - 1) {
          await new Promise(r => setTimeout(r, delayMs));
        }
      } catch (e) {
        logger.error(`Bulk call failed for ${toPhone}:`, e.message);
        if (i < targets.length - 1) await new Promise(r => setTimeout(r, 1000));
      }
    }
    logger.info(`Bulk call batch complete: ${targets.length} calls initiated`);
  });
}

async function listCalls(req, res) {
  const { page = 1, limit = 20, status, fromDate, toDate } = req.query;
  const { Op } = require('sequelize');
  const orgFilter = req.tenantScope || {};

  const where = { ...orgFilter };
  if (status) where.status = status;
  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt[Op.gte] = new Date(fromDate);
    if (toDate) where.createdAt[Op.lte] = new Date(toDate);
  }

  const { count, rows } = await Call.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: parseInt(limit),
    offset: (parseInt(page) - 1) * parseInt(limit),
  });

  res.json({
    success: true,
    calls: rows,
    pagination: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / parseInt(limit)),
    },
  });
}

async function retryCall(req, res) {
  const { callId } = req.params;
  const orgFilter = req.tenantScope || {};
  const call = await Call.findOne({ where: { id: callId, ...orgFilter } });

  if (!call) return res.status(404).json({ error: 'Call not found' });
  if (call.retryCount >= call.maxRetries) {
    return res.status(400).json({ error: 'Maximum retries reached' });
  }

  try {
    const exotelCall = await initiateCall(call.toPhone, call.id, call.metadata);

    await call.update({
      callSid: exotelCall.sid,
      status: 'queued',
      retryCount: call.retryCount + 1,
      nextRetryAt: null,
    });

    res.json({ success: true, callId: call.id, retryCount: call.retryCount });
  } catch (error) {
    logger.error('Retry failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = { initiateCallController, bulkCallController, getCallStatus, listCalls, retryCall };
