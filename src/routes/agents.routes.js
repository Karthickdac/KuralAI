/**
 * Agents API — /api/agents
 * CRUD for multi-persona AI agents. JWT-protected.
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const agentsService = require('../services/agentsService');

router.use(authenticateToken);

router.get('/', (_req, res) => {
  res.json({ agents: agentsService.list() });
});

router.get('/default', (_req, res) => {
  res.json({ agent: agentsService.getDefault() });
});

router.get('/:id', (req, res) => {
  const a = agentsService.get(req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  res.json({ agent: a });
});

router.post('/', (req, res) => {
  try {
    const a = agentsService.create(req.body || {});
    res.json({ agent: a });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const a = agentsService.update(req.params.id, req.body || {});
    res.json({ agent: a });
  } catch (e) {
    const status = /not found/i.test(e.message) ? 404 : 400;
    res.status(status).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  const ok = agentsService.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ deleted: req.params.id });
});

module.exports = router;
