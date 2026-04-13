/**
 * Template Controller
 * CRUD for QaTemplate (Q&A pairs) and PromptTemplate (system prompts).
 */

const QaTemplate = require('../models/QaTemplate');
const PromptTemplate = require('../models/PromptTemplate');
const logger = require('../utils/logger');
const { invalidateTemplateCache } = require('../services/aiService');

// ─── QA Templates ─────────────────────────────────────────────────────────────

async function listQaTemplates(req, res) {
  try {
    const rows = await QaTemplate.findAll({ order: [['sortOrder', 'ASC'], ['createdAt', 'ASC']] });
    res.json(rows);
  } catch (err) {
    logger.error('listQaTemplates error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function createQaTemplate(req, res) {
  try {
    const { intent, label, phraseKeywords, tokenKeywords, minScore, responses, action, sortOrder } = req.body;
    if (!intent || !label) return res.status(400).json({ error: 'intent and label are required' });
    const row = await QaTemplate.create({
      intent, label,
      phraseKeywords: phraseKeywords || [],
      tokenKeywords:  tokenKeywords  || [],
      minScore:       minScore       ?? 1,
      responses:      responses      || [],
      action:         action         || 'continue',
      sortOrder:      sortOrder      ?? 0,
    });
    invalidateTemplateCache();
    res.status(201).json(row);
  } catch (err) {
    logger.error('createQaTemplate error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function updateQaTemplate(req, res) {
  try {
    const row = await QaTemplate.findByPk(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const { intent, label, phraseKeywords, tokenKeywords, minScore, responses, action, isActive, sortOrder } = req.body;
    // Use static update() to avoid Sequelize JSONB mutation-detection bug on instance.update()
    await QaTemplate.update(
      { intent, label, phraseKeywords, tokenKeywords, minScore, responses, action, isActive, sortOrder },
      { where: { id: req.params.id } }
    );
    const updated = await QaTemplate.findByPk(req.params.id);
    invalidateTemplateCache();
    res.json(updated);
  } catch (err) {
    logger.error('updateQaTemplate error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function deleteQaTemplate(req, res) {
  try {
    const row = await QaTemplate.findByPk(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    await row.destroy();
    invalidateTemplateCache();
    res.json({ ok: true });
  } catch (err) {
    logger.error('deleteQaTemplate error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ─── Prompt Templates ─────────────────────────────────────────────────────────

async function listPromptTemplates(req, res) {
  try {
    const rows = await PromptTemplate.findAll({ order: [['key', 'ASC']] });
    res.json(rows);
  } catch (err) {
    logger.error('listPromptTemplates error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function createPromptTemplate(req, res) {
  try {
    const { key, label, text, description } = req.body;
    if (!key || !label || !text) return res.status(400).json({ error: 'key, label and text are required' });
    const row = await PromptTemplate.create({ key, label, text, description });
    invalidateTemplateCache();
    res.status(201).json(row);
  } catch (err) {
    logger.error('createPromptTemplate error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function updatePromptTemplate(req, res) {
  try {
    const row = await PromptTemplate.findByPk(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const { key, label, text, description, isActive } = req.body;
    await PromptTemplate.update(
      { key, label, text, description, isActive },
      { where: { id: req.params.id } }
    );
    const updated = await PromptTemplate.findByPk(req.params.id);
    invalidateTemplateCache();
    res.json(updated);
  } catch (err) {
    logger.error('updatePromptTemplate error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function deletePromptTemplate(req, res) {
  try {
    const row = await PromptTemplate.findByPk(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    await row.destroy();
    invalidateTemplateCache();
    res.json({ ok: true });
  } catch (err) {
    logger.error('deletePromptTemplate error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listQaTemplates, createQaTemplate, updateQaTemplate, deleteQaTemplate,
  listPromptTemplates, createPromptTemplate, updatePromptTemplate, deletePromptTemplate,
};
