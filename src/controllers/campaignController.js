const { v4: uuidv4 } = require('uuid');
const fs   = require('fs');
const path = require('path');
const Campaign = require('../models/Campaign');
const Call = require('../models/Call');
const Customer = require('../models/Customer');
const ChitAccount = require('../models/ChitAccount');
const { buildChitMetadata } = require('./customerController');
const { initiateCall } = require('../services/telephonyService');
const { notifyDashboard } = require('../websocket/wsServer');
const logger = require('../utils/logger');

const SETTINGS_FILE = path.join(__dirname, '../../config/app-settings.json');
function getSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); } catch { return {}; }
}

const activeCampaigns = new Map();

async function resolveCustomerMeta(toPhone) {
  try {
    const customer = await Customer.findOne({ where: { phone: toPhone } });
    if (!customer) return {};
    const chits = await ChitAccount.findAll({
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

async function listCampaigns(req, res) {
  const { page = 1, limit = 20, status } = req.query;
  const { Op } = require('sequelize');
  const where = {};
  if (status) where.status = status;

  const { count, rows } = await Campaign.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: parseInt(limit),
    offset: (parseInt(page) - 1) * parseInt(limit),
  });

  res.json({
    success: true,
    campaigns: rows,
    pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / parseInt(limit)) },
  });
}

async function getCampaign(req, res) {
  const campaign = await Campaign.findByPk(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const callIds = campaign.callIds || [];
  let calls = [];
  if (callIds.length) {
    calls = await Call.findAll({
      where: { id: callIds },
      attributes: ['id', 'toPhone', 'status', 'duration', 'recordingUrl', 'createdAt', 'startedAt', 'endedAt'],
      order: [['createdAt', 'ASC']],
    });
  }

  res.json({ success: true, campaign, calls });
}

async function createCampaign(req, res) {
  const { name, type = 'due_reminder', customerIds = [], concurrency = 1, scheduledAt, metadata = {}, workflowId, recordCalls = true, callbackUrl } = req.body;

  if (!name) return res.status(400).json({ error: 'Campaign name is required' });
  if (!customerIds.length) return res.status(400).json({ error: 'At least one customer is required' });

  const campaign = await Campaign.create({
    id: uuidv4(),
    name,
    type,
    status: scheduledAt ? 'scheduled' : 'draft',
    customerIds,
    concurrency: Math.min(Math.max(1, concurrency), 10),
    totalCalls: customerIds.length,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    metadata,
    workflowId,
    recordCalls,
    callbackUrl,
    createdBy: req.user?.id,
  });

  res.status(201).json({ success: true, campaign });
}

async function updateCampaign(req, res) {
  const campaign = await Campaign.findByPk(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (['running', 'completed'].includes(campaign.status)) {
    return res.status(400).json({ error: 'Cannot edit a running or completed campaign' });
  }

  const { name, type, customerIds, concurrency, scheduledAt, metadata, workflowId, recordCalls, callbackUrl } = req.body;
  const update = {};
  if (name !== undefined) update.name = name;
  if (type !== undefined) update.type = type;
  if (customerIds !== undefined) { update.customerIds = customerIds; update.totalCalls = customerIds.length; }
  if (concurrency !== undefined) update.concurrency = Math.min(Math.max(1, concurrency), 10);
  if (scheduledAt !== undefined) update.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
  if (metadata !== undefined) update.metadata = metadata;
  if (workflowId !== undefined) update.workflowId = workflowId;
  if (recordCalls !== undefined) update.recordCalls = recordCalls;
  if (callbackUrl !== undefined) update.callbackUrl = callbackUrl;

  await campaign.update(update);
  res.json({ success: true, campaign });
}

async function deleteCampaign(req, res) {
  const campaign = await Campaign.findByPk(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.status === 'running') return res.status(400).json({ error: 'Cannot delete a running campaign. Pause it first.' });

  await campaign.destroy();
  res.json({ success: true, message: 'Campaign deleted' });
}

async function startCampaign(req, res) {
  const campaign = await Campaign.findByPk(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.status === 'running') return res.status(400).json({ error: 'Campaign is already running' });
  if (campaign.status === 'completed') return res.status(400).json({ error: 'Campaign is already completed' });

  await campaign.update({ status: 'running', startedAt: new Date() });
  await notifyDashboard({ type: 'CAMPAIGN_STARTED', campaignId: campaign.id, name: campaign.name });

  res.json({ success: true, message: 'Campaign started', campaignId: campaign.id });

  setImmediate(() => executeCampaign(campaign.id));
}

async function pauseCampaign(req, res) {
  const campaign = await Campaign.findByPk(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.status !== 'running') return res.status(400).json({ error: 'Campaign is not running' });

  activeCampaigns.set(campaign.id, 'paused');
  await campaign.update({ status: 'paused' });
  await notifyDashboard({ type: 'CAMPAIGN_PAUSED', campaignId: campaign.id });

  res.json({ success: true, message: 'Campaign paused' });
}

async function resumeCampaign(req, res) {
  const campaign = await Campaign.findByPk(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.status !== 'paused') return res.status(400).json({ error: 'Campaign is not paused' });

  activeCampaigns.delete(campaign.id);
  await campaign.update({ status: 'running' });
  await notifyDashboard({ type: 'CAMPAIGN_RESUMED', campaignId: campaign.id });

  res.json({ success: true, message: 'Campaign resumed' });

  setImmediate(() => executeCampaign(campaign.id));
}

async function executeCampaign(campaignId) {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign || campaign.status !== 'running') return;

  const { customerIds, concurrency, metadata, recordCalls, callbackUrl } = campaign;
  const s = getSettings();
  const provider  = (s.telephonyProvider || 'twilio').toLowerCase();
  const fromPhone = provider === 'twilio'
    ? (s.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER || '')
    : (s.exotelPhoneNumber || process.env.EXOTEL_PHONE_NUMBER || '');

  const customers = await Customer.findAll({ where: { id: customerIds } });

  const existingCalls = (campaign.callIds || []).length
    ? await Call.findAll({ where: { id: campaign.callIds }, attributes: ['id', 'toPhone'], raw: true })
    : [];
  const processedPhones = new Set(existingCalls.map(c => c.toPhone));

  const remaining = customers.filter(c => !processedPhones.has(c.phone));

  const completedCallIds = [...(campaign.callIds || [])];
  let completed = campaign.completedCalls || 0;
  let answered  = campaign.answeredCalls  || 0;
  let failed    = campaign.failedCalls    || 0;

  async function processCustomer(customer) {
    if (activeCampaigns.get(campaignId) === 'paused') return 'paused';

    try {
      const customerMeta = await resolveCustomerMeta(customer.phone);
      const wfId = campaign.workflowId || campaign.type;
      const enrichedMeta = {
        ...customerMeta,
        ...metadata,
        campaignId,
        campaignName: campaign.name,
        recordCalls,
        callbackUrl,
        workflowId: wfId,
      };

      const call = await Call.create({
        id: uuidv4(),
        toPhone: customer.phone,
        fromPhone,
        status: 'initiated',
        direction: 'outbound',
        maxRetries: parseInt(process.env.CALL_RETRY_ATTEMPTS) || 3,
        metadata: enrichedMeta,
      });

      const result = await initiateCall(customer.phone, call.id, enrichedMeta);
      await call.update({ callSid: result.sid, status: 'queued' });

      completedCallIds.push(call.id);
      completed++;

      await Campaign.update(
        { callIds: completedCallIds, completedCalls: completed },
        { where: { id: campaignId } }
      );

      await notifyDashboard({
        type: 'CAMPAIGN_CALL_INITIATED',
        campaignId,
        callId: call.id,
        phone: customer.phone,
        progress: { completed, total: campaign.totalCalls },
      });

      preWarmTts(enrichedMeta, call.id);

      logger.info(`Campaign ${campaign.name}: call ${completed}/${campaign.totalCalls} -> ${customer.phone}`);
      return 'ok';
    } catch (e) {
      failed++;
      completed++;
      await Campaign.update(
        { completedCalls: completed, failedCalls: failed },
        { where: { id: campaignId } }
      );
      logger.error(`Campaign call failed for ${customer.phone}: ${e.message}`);
      return 'error';
    }
  }

  for (let i = 0; i < remaining.length; i += concurrency) {
    if (activeCampaigns.get(campaignId) === 'paused') {
      logger.info(`Campaign ${campaign.name} paused at ${completed}/${campaign.totalCalls}`);
      return;
    }

    const batch = remaining.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(c => processCustomer(c)));

    if (results.includes('paused')) {
      logger.info(`Campaign ${campaign.name} paused at ${completed}/${campaign.totalCalls}`);
      return;
    }

    if (i + concurrency < remaining.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  await Campaign.update(
    { status: 'completed', completedAt: new Date(), completedCalls: completed, failedCalls: failed },
    { where: { id: campaignId } }
  );
  activeCampaigns.delete(campaignId);
  await notifyDashboard({ type: 'CAMPAIGN_COMPLETED', campaignId, name: campaign.name, total: campaign.totalCalls, failed });
  logger.info(`Campaign "${campaign.name}" completed: ${campaign.totalCalls} calls, ${failed} failed`);
}

function preWarmTts(meta, callId) {
  (async () => {
    try {
      const { synthesizeSpeech } = require('../services/speechService');
      const { getPromptText }    = require('../services/aiService');
      const { applyTemplate }    = require('../utils/templateEngine');
      const QaTemplate           = require('../models/QaTemplate');
      const greetingText = await getPromptText('GREETING', meta);
      await synthesizeSpeech(greetingText).catch(() => {});
      const qaRows = await QaTemplate.findAll({ where: { isActive: true }, raw: true });
      const texts = [];
      qaRows.forEach(r => (r.responses || []).forEach(t => texts.push(applyTemplate(t, meta))));
      for (let j = 0; j < texts.length; j += 5) {
        await Promise.all(texts.slice(j, j + 5).map(t => synthesizeSpeech(t).catch(() => {})));
      }
    } catch {}
  })();
}

module.exports = {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
};
