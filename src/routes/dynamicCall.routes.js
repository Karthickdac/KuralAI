/**
 * Dynamic Call routes
 * - Import CSV/XLSX → auto-create dynamic table (org-scoped)
 * - List/delete rows
 * - Trigger calls that forward arbitrary row data to ElevenLabs as dynamic_variables
 */
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');

const { authenticateTokenOrApiKey } = require('../middleware/apiKeyAuth');
const { tenantScope } = require('../middleware/tenant');
const { requireCredits } = require('../middleware/planLimits');
const { sequelize } = require('../config/database');
const DynamicCustomer = require('../models/DynamicCustomer');
const DynamicTableSchema = require('../models/DynamicTableSchema');
const Call = require('../models/Call');
const { dispatchCall } = require('../services/callDispatcher');
const creditService = require('../services/creditService');
const logger = require('../utils/logger');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticateTokenOrApiKey);
router.use(tenantScope);

function detectColumn(columns, patterns) {
  for (const c of columns) {
    const k = String(c).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (patterns.some(p => k.includes(p))) return c;
  }
  return null;
}

function normalizePhone(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/[^\d+]/g, '');
  if (!s) return null;
  if (s.startsWith('+')) return s;
  if (s.length === 10) return `+91${s}`;
  if (s.length === 12 && s.startsWith('91')) return `+${s}`;
  return s.startsWith('+') ? s : `+${s}`;
}

// GET schema + rows
router.get('/', async (req, res) => {
  try {
    const orgId = req.user?.organizationId || null;
    const schema = await DynamicTableSchema.findOne({ where: { organizationId: orgId } });
    const rows = await DynamicCustomer.findAll({
      where: { organizationId: orgId },
      order: [['createdAt', 'ASC']],
    });
    res.json({
      success: true,
      schema: schema ? {
        tableName: schema.tableName,
        columns: schema.columns || [],
        phoneColumn: schema.phoneColumn,
        nameColumn: schema.nameColumn,
      } : null,
      rows: rows.map(r => ({ id: r.id, phone: r.phone, name: r.name, data: r.data, createdAt: r.createdAt })),
    });
  } catch (e) {
    logger.error('[dynamic-call] list failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST import — multipart file
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    const orgId = req.user?.organizationId || null;
    const tableName = (req.body.tableName || req.file.originalname || 'Imported Table').slice(0, 100);

    // Parse with xlsx (handles csv too)
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return res.status(400).json({ success: false, error: 'No sheets found' });

    const json = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    if (!json.length) return res.status(400).json({ success: false, error: 'File has no data rows' });

    const columns = Object.keys(json[0]);
    const phoneColumn = detectColumn(columns, ['phone', 'mobile', 'contact', 'number']) || columns[0];
    const nameColumn = detectColumn(columns, ['name', 'customer', 'fullname']) || columns.find(c => c !== phoneColumn) || columns[0];

    if (!orgId) return res.status(400).json({ success: false, error: 'No organization context — cannot import' });

    const rowsToInsert = json.map(r => ({
      id: uuidv4(),
      organizationId: orgId,
      phone: normalizePhone(r[phoneColumn]),
      name: r[nameColumn] != null ? String(r[nameColumn]).slice(0, 200) : null,
      data: r,
    }));

    // Atomically wipe + recreate
    await sequelize.transaction(async (t) => {
      await DynamicCustomer.destroy({ where: { organizationId: orgId }, transaction: t });
      await DynamicTableSchema.destroy({ where: { organizationId: orgId }, transaction: t });
      await DynamicTableSchema.create({
        organizationId: orgId, tableName, columns, phoneColumn, nameColumn,
      }, { transaction: t });
      await DynamicCustomer.bulkCreate(rowsToInsert, { transaction: t });
    });

    res.json({ success: true, imported: rowsToInsert.length, columns, phoneColumn, nameColumn, tableName });
  } catch (e) {
    logger.error('[dynamic-call] import failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE entire table
router.delete('/', async (req, res) => {
  try {
    const orgId = req.user?.organizationId || null;
    await DynamicCustomer.destroy({ where: { organizationId: orgId } });
    await DynamicTableSchema.destroy({ where: { organizationId: orgId } });
    res.json({ success: true });
  } catch (e) {
    logger.error('[dynamic-call] delete-all failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE single row
router.delete('/:id', async (req, res) => {
  try {
    const orgId = req.user?.organizationId || null;
    const n = await DynamicCustomer.destroy({ where: { id: req.params.id, organizationId: orgId } });
    res.json({ success: true, deleted: n });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST call/:id — initiate call for one row
router.post('/call/:id', requireCredits(2), async (req, res) => {
  try {
    const orgId = req.user?.organizationId || null;
    const row = await DynamicCustomer.findOne({ where: { id: req.params.id, organizationId: orgId } });
    if (!row) return res.status(404).json({ success: false, error: 'Row not found' });
    if (!row.phone) return res.status(400).json({ success: false, error: 'Row has no valid phone number' });

    const callType = req.body?.callType || 'dynamic';

    const enrichedMeta = {
      customerId:   row.id,
      customerName: row.name || 'வாடிக்கையாளர்',
      callType,
      source: 'dynamic-call',
      engine: 'elevenlabs',
      customData: row.data || {},
    };

    const call = await Call.create({
      id: uuidv4(),
      toPhone: row.phone,
      fromPhone: '',
      status: 'initiated',
      direction: 'outbound',
      maxRetries: parseInt(process.env.CALL_RETRY_ATTEMPTS) || 3,
      metadata: enrichedMeta,
      organizationId: orgId,
    });

    const dispatched = await dispatchCall(row.phone, call.id, enrichedMeta);

    const updates = { callSid: dispatched.sid, status: 'queued' };
    if (dispatched.conversationId) {
      updates.metadata = {
        ...enrichedMeta,
        elevenlabs: { conversationId: dispatched.conversationId },
      };
    }
    await call.update(updates);

    if (orgId) {
      try { await creditService.deductMinutes(orgId, 2, call.id, `Dynamic call: ${call.id}`); }
      catch (e) { logger.warn(`Credit deduction failed: ${e.message}`); }
    }

    res.json({ success: true, callId: call.id, callSid: dispatched.sid });
  } catch (e) {
    logger.error('[dynamic-call] call failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
