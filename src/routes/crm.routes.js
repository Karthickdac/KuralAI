const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const Customer = require('../models/Customer');
const ChitAccount = require('../models/ChitAccount');
const Call = require('../models/Call');
const Transcript = require('../models/Transcript');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

const SETTINGS_FILE = path.join(__dirname, '../../config/app-settings.json');

async function loadSettings() {
  try {
    const AppSetting = require('../models/AppSetting');
    const row = await AppSetting.findByPk('main');
    if (row) return row.data;
  } catch {}
  try {
    if (fs.existsSync(SETTINGS_FILE)) return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  } catch {}
  return {};
}

async function saveSettings(data) {
  try {
    const AppSetting = require('../models/AppSetting');
    const [row] = await AppSetting.findOrBuild({ where: { key: 'main' } });
    row.data = data;
    row.changed('data', true);
    await row.save();
  } catch {}
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.startsWith('91') && digits.length === 12) return '+' + digits;
  if (digits.length === 10) return '+91' + digits;
  if (digits.length >= 11 && digits.length <= 15) return '+' + digits;
  return null;
}

function validateUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return false;
    if (host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.')) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    if (host.endsWith('.internal') || host.endsWith('.local')) return false;
    return true;
  } catch { return false; }
}

router.use(authenticateToken, requireAdmin);

router.get('/config', async (req, res) => {
  const s = await loadSettings();
  res.json({
    success: true,
    config: {
      crmFetchUrl: s.crmFetchUrl || '',
      crmFetchMethod: s.crmFetchMethod || 'GET',
      crmFetchHeaders: s.crmFetchHeaders || '',
      crmPushUrl: s.crmPushUrl || '',
      crmPushHeaders: s.crmPushHeaders || '',
      crmAutoSync: s.crmAutoSync || false,
    },
  });
});

router.put('/config', async (req, res) => {
  try {
    const s = await loadSettings();
    const allowed = ['crmFetchUrl', 'crmFetchMethod', 'crmFetchHeaders', 'crmPushUrl', 'crmPushHeaders', 'crmAutoSync'];

    for (const urlKey of ['crmFetchUrl', 'crmPushUrl']) {
      const val = req.body[urlKey];
      if (val && !validateUrl(val)) {
        return res.status(400).json({ success: false, error: `Invalid ${urlKey}: only public HTTP/HTTPS URLs are allowed.` });
      }
    }

    if (req.body.crmFetchMethod && !['GET', 'POST'].includes(req.body.crmFetchMethod.toUpperCase())) {
      return res.status(400).json({ success: false, error: 'Method must be GET or POST' });
    }

    for (const hdrKey of ['crmFetchHeaders', 'crmPushHeaders']) {
      const val = req.body[hdrKey];
      if (val && typeof val === 'string' && val.trim()) {
        try { JSON.parse(val); } catch {
          return res.status(400).json({ success: false, error: `Invalid JSON in ${hdrKey}` });
        }
      }
    }

    for (const key of allowed) {
      if (req.body[key] !== undefined) s[key] = req.body[key];
    }
    await saveSettings(s);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/fetch-customers', async (req, res) => {
  const s = await loadSettings();
  const url = s.crmFetchUrl;
  if (!url) return res.status(400).json({ success: false, error: 'CRM Fetch URL is required. Configure it in the Configuration tab first.' });
  if (!validateUrl(url)) return res.status(400).json({ success: false, error: 'Invalid CRM URL. Only public HTTPS/HTTP endpoints are allowed.' });

  const method = (s.crmFetchMethod || 'GET').toUpperCase();
  let headers = { 'Content-Type': 'application/json' };
  try {
    const raw = s.crmFetchHeaders;
    if (raw && typeof raw === 'string') headers = { ...headers, ...JSON.parse(raw) };
  } catch (e) {
    logger.warn('CRM fetch: invalid headers JSON, using defaults');
  }

  try {
    const response = await axios({ method, url, headers, timeout: 30000 });
    const data = response.data;

    let customers = [];
    if (Array.isArray(data)) customers = data;
    else if (data.customers && Array.isArray(data.customers)) customers = data.customers;
    else if (data.data && Array.isArray(data.data)) customers = data.data;
    else if (data.results && Array.isArray(data.results)) customers = data.results;
    else return res.json({ success: true, fetched: 0, created: 0, updated: 0, message: 'Could not find customer array in CRM response. Expected root array or {customers:[...]}, {data:[...]}, or {results:[...]}', raw: data });

    let created = 0, updated = 0, skipped = 0, errors = [];

    for (const cust of customers) {
      try {
        const phone = normalizePhone(cust.phone || cust.mobile || cust.phoneNumber || cust.contact);
        const name = cust.name || cust.customerName || cust.fullName || '';
        if (!phone) { skipped++; continue; }

        let existing = await Customer.findOne({ where: { phone } });

        if (!existing) {
          if (!name) { skipped++; continue; }
          existing = await Customer.create({
            name,
            phone,
            address: cust.address || '',
            notes: cust.notes || cust.remarks || '',
            preferences: {},
          });
          created++;
        } else {
          if (name) existing.name = name;
          if (cust.address !== undefined) existing.address = cust.address;
          if (cust.notes !== undefined || cust.remarks !== undefined) existing.notes = cust.notes || cust.remarks || existing.notes;
          await existing.save();
          updated++;
        }

        const chit = cust.chit || cust.chitAccount || cust.account || null;
        if (chit) {
          let primary = await ChitAccount.findOne({ where: { customerId: existing.id, isPrimary: true } });
          const chitData = {
            chitGroup: chit.chitGroup || chit.group || (primary?.chitGroup) || 'Group A',
            chitValue: chit.chitValue || chit.value || (primary?.chitValue) || 100000,
            dueAmount: chit.dueAmount || chit.due || chit.installment || (primary?.dueAmount) || 2000,
            totalDues: chit.totalDues || chit.total || (primary?.totalDues) || 20,
            completedDues: chit.completedDues || chit.paid || (primary?.completedDues) || 0,
            nextDueDate: chit.nextDueDate || chit.nextDue || (primary?.nextDueDate) || null,
            withdrawalAmount: chit.withdrawalAmount || chit.withdrawal || (primary?.withdrawalAmount) || null,
          };
          if (primary) {
            Object.assign(primary, chitData);
            await primary.save();
          } else {
            await ChitAccount.create({ customerId: existing.id, isPrimary: true, ...chitData });
          }
        }
      } catch (err) {
        errors.push({ phone: cust.phone, error: err.message });
      }
    }

    res.json({
      success: true,
      fetched: customers.length,
      created,
      updated,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    const status = err.response?.status;
    const msg = status ? `CRM returned HTTP ${status}: ${err.response?.statusText}` : err.message;
    res.status(502).json({ success: false, error: `Failed to fetch from CRM: ${msg}` });
  }
});

router.get('/calls', async (req, res) => {
  try {
    const { sequelize } = require('../config/database');
    const { status, pushed, limit: lim } = req.query;
    const where = { recordingUrl: { [Op.ne]: null } };
    if (status) where.status = status;
    if (pushed === 'true') {
      where[Op.and] = [
        sequelize.literal("(metadata->>'recordingPushedAt') IS NOT NULL"),
      ];
    } else if (pushed === 'false') {
      where[Op.and] = [
        sequelize.literal("(metadata->>'recordingPushedAt') IS NULL"),
      ];
    }

    const calls = await Call.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Math.min(parseInt(lim) || 50, 200),
      attributes: ['id', 'toPhone', 'status', 'duration', 'recordingUrl', 'recordingSid', 'metadata', 'createdAt', 'endedAt'],
    });

    const results = calls.map(c => {
      const cj = c.toJSON();
      return {
        ...cj,
        customerName: cj.metadata?.customerName || '',
        hasPushed: !!cj.metadata?.recordingPushedAt,
      };
    });

    res.json({ success: true, calls: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/push-recording/:callId', async (req, res) => {
  try {
    const call = await Call.findByPk(req.params.callId);
    if (!call) return res.status(404).json({ success: false, error: 'Call not found' });
    if (!call.recordingUrl) return res.status(400).json({ success: false, error: 'No recording available for this call' });

    const s = await loadSettings();
    const targetUrl = s.crmPushUrl;
    if (!targetUrl) return res.status(400).json({ success: false, error: 'Push URL not configured. Set it in the Configuration tab.' });
    if (!validateUrl(targetUrl)) return res.status(400).json({ success: false, error: 'Invalid Push URL. Only public HTTPS/HTTP endpoints are allowed.' });

    let headers = { 'Content-Type': 'application/json' };
    try {
      const raw = s.crmPushHeaders;
      if (raw && typeof raw === 'string') headers = { ...headers, ...JSON.parse(raw) };
    } catch (e) {
      logger.warn('CRM push: invalid headers JSON, using defaults');
    }

    const transcripts = await Transcript.findAll({
      where: { callId: call.id },
      order: [['turnNumber', 'ASC']],
      attributes: ['turnNumber', 'speaker', 'text', 'intent', 'confidence'],
    });

    const payload = {
      callId: call.id,
      callSid: call.callSid,
      phone: call.toPhone,
      status: call.status,
      duration: call.duration,
      direction: call.direction,
      recordingUrl: call.recordingUrl,
      recordingSid: call.recordingSid,
      escalated: call.escalated,
      escalationReason: call.escalationReason,
      metadata: call.metadata,
      transcripts: transcripts.map(t => t.toJSON()),
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      pushedAt: new Date().toISOString(),
    };

    const response = await axios.post(targetUrl, payload, { headers, timeout: 15000 });

    const meta = { ...(call.metadata || {}), recordingPushedAt: new Date().toISOString() };
    await call.update({ metadata: meta });

    logger.info(`CRM push: call ${call.id} → ${targetUrl} (HTTP ${response.status})`);
    res.json({ success: true, message: 'Recording and transcript pushed to CRM', targetStatus: response.status });
  } catch (err) {
    const status = err.response?.status;
    const msg = status ? `CRM returned HTTP ${status}` : err.message;
    logger.error(`CRM push failed for call ${req.params.callId}: ${msg}`);
    res.status(502).json({ success: false, error: `Push failed: ${msg}` });
  }
});

router.post('/push-all', async (req, res) => {
  try {
    const s = await loadSettings();
    const targetUrl = s.crmPushUrl;
    if (!targetUrl) return res.status(400).json({ success: false, error: 'Push URL not configured. Set it in the Configuration tab.' });
    if (!validateUrl(targetUrl)) return res.status(400).json({ success: false, error: 'Invalid Push URL' });

    const calls = await Call.findAll({
      where: {
        recordingUrl: { [Op.ne]: null },
        status: 'completed',
      },
      order: [['createdAt', 'DESC']],
      limit: 100,
    });

    const unpushed = calls.filter(c => !c.metadata?.recordingPushedAt);
    if (unpushed.length === 0) return res.json({ success: true, pushed: 0, message: 'All recordings already pushed' });

    let headers = { 'Content-Type': 'application/json' };
    try {
      const raw = s.crmPushHeaders;
      if (raw) headers = { ...headers, ...JSON.parse(raw) };
    } catch {}

    let pushed = 0, failed = 0;
    for (const call of unpushed) {
      try {
        const transcripts = await Transcript.findAll({
          where: { callId: call.id },
          order: [['turnNumber', 'ASC']],
          attributes: ['turnNumber', 'speaker', 'text', 'intent', 'confidence'],
        });

        const payload = {
          callId: call.id,
          callSid: call.callSid,
          phone: call.toPhone,
          status: call.status,
          duration: call.duration,
          recordingUrl: call.recordingUrl,
          transcripts: transcripts.map(t => t.toJSON()),
          startedAt: call.startedAt,
          endedAt: call.endedAt,
          pushedAt: new Date().toISOString(),
        };

        await axios.post(targetUrl, payload, { headers, timeout: 15000 });
        const meta = { ...(call.metadata || {}), recordingPushedAt: new Date().toISOString() };
        await call.update({ metadata: meta });
        pushed++;
      } catch {
        failed++;
      }
    }

    res.json({ success: true, pushed, failed, total: unpushed.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
